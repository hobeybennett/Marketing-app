import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import {
  META_API,
  metaPost,
  uploadVideoToMeta,
  uploadImageToMeta,
  ensureSpotifyClickConversion,
  buildCampaignObjectives,
  buildCampaignBody,
  buildAdSetBody,
  buildAdCreativeBody,
  makeCreateAdSet,
  resolveInterests,
} from '@/lib/meta-campaign';
import { evaluateCriteria, type CriterionContext } from '@/lib/meta-test-criteria';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const OWNER_EMAIL = 'hobeybennett@gmail.com';

// Read a Meta object back with the exact fields we want to verify. Tolerant:
// returns { error } on failure rather than throwing, so a single field the app
// lacks permission for doesn't sink the whole report.
async function getJson(id: string, fields: string, token: string): Promise<any> {
  try {
    const res = await fetch(`${META_API}/${id}?fields=${encodeURIComponent(fields)}&access_token=${token}`);
    const json = await res.json().catch(() => null);
    if (json?.error) return { __error: json.error.message };
    return json;
  } catch (err) {
    return { __error: err instanceof Error ? err.message : String(err) };
  }
}

// Resolve a committed still image to use as the placeholder. Avoids the lavfi
// virtual input device, which isn't compiled into every ffmpeg build (Railway's
// isn't) — so we loop a real image into the sample video instead.
function resolveSampleImage(): string {
  const candidates = [
    path.join(process.cwd(), 'public', 'og-image.jpg'),
    path.join(process.cwd(), 'promohit-logo-square.png'),
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error('No placeholder image found for the test campaign');
  return found;
}

// Loop a still image into a tiny silent MP4 with ffmpeg. Uses only file input +
// libx264 (no lavfi), so it works on any ffmpeg build.
function generateSampleVideo(dir: string, sourceImage: string): Promise<string> {
  const videoPath = path.join(dir, 'sample.mp4');
  return new Promise((resolve, reject) => {
    ffmpeg(sourceImage)
      .inputOptions(['-loop', '1'])
      .outputOptions([
        '-t', '2',
        '-r', '30',
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        // Force even dimensions — libx264 with yuv420p requires them.
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      ])
      .save(videoPath)
      .on('end', () => resolve(videoPath))
      .on('error', reject);
  });
}

export async function POST() {
  const session = await getServerSession();
  if (session?.user?.email !== OWNER_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const conn = await prisma.metaConnection.findUnique({ where: { userId: session.user.id } });
  if (!conn) {
    return NextResponse.json({ error: 'No Meta connection — connect Meta in Settings first' }, { status: 400 });
  }

  const token = conn.accessToken;
  const pageToken = conn.pageAccessToken ?? token;
  const adAccountId = conn.adAccountId;
  const pageId = conn.pageId;
  const pixelId = conn.pixelId;
  // Match the production gate: only use the IG identity when Instagram is enabled.
  const instagramUserId = process.env.META_ENABLE_INSTAGRAM_SCOPE === 'true'
    ? (conn.instagramUserId ?? null)
    : null;

  if (!adAccountId) return NextResponse.json({ error: 'No ad account configured' }, { status: 400 });
  if (!pageId) return NextResponse.json({ error: 'No Facebook Page configured' }, { status: 400 });
  if (!pageToken) return NextResponse.json({ error: 'No Page Access Token — reconnect Meta' }, { status: 400 });

  const createdIds: Record<string, string> = {};
  const rawReadback: Record<string, any> = {};
  const customConversionDiag: string[] = [];
  let tmpDir: string | null = null;

  try {
    // 1. Custom conversion → decides Engagement vs Traffic. Capture diagnostics
    // so the report can show exactly why it fell back to Traffic if it does.
    if (!pixelId) customConversionDiag.push('no pixel configured on the Meta connection');
    const customConversionId = pixelId
      ? await ensureSpotifyClickConversion(adAccountId, token, pixelId, customConversionDiag)
      : null;
    const useConversions = !!customConversionId;

    // 2. Campaign (strict — only Engagement is tried when useConversions).
    const [objective] = buildCampaignObjectives(useConversions);
    const chosenObjective = objective;
    const ts = new Date().toISOString();
    const campaign = await metaPost(
      `/act_${adAccountId}/campaigns`,
      token,
      buildCampaignBody({ name: `TEST — Promohit harness — ${ts}`, objective }),
    );
    createdIds.campaignId = campaign.id;

    // 3. Placeholder media — loop a committed still into a short silent MP4.
    const sampleImage = resolveSampleImage();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promohit-test-'));
    const videoPath = await generateSampleVideo(tmpDir, sampleImage);
    const videoId = await uploadVideoToMeta(videoPath, token, adAccountId, 'Promohit test clip');
    const imageHash = await uploadImageToMeta(sampleImage, token, adAccountId);

    // 4. Ad creative (POSTed with the Page token).
    const creative = await metaPost(
      `/act_${adAccountId}/adcreatives`,
      pageToken,
      buildAdCreativeBody({
        name: 'Promohit test creative',
        pageId,
        instagramUserId,
        videoId,
        imageHash,
        message: 'Promohit campaign builder test — this ad is paused and never spends.',
        link: `${process.env.NEXTAUTH_URL}/go/test`,
      }),
    );
    createdIds.creativeId = creative.id;

    // 5. Ad set (synthetic audience — buildTargeting ignores it).
    const createAdSet = makeCreateAdSet(adAccountId, token);
    // Exercise interest resolution with well-known artists so the readback shows
    // the flexible_spec targeting (verifies similar-artist targeting end-to-end).
    const testInterests = await resolveInterests(['Drake', 'The Weeknd'], token);
    const adSet = await createAdSet(buildAdSetBody({
      name: 'Promohit test ad set',
      campaignId: campaign.id,
      useConversions,
      pixelId: pixelId ?? null,
      customConversionId,
      // Comfortably above Meta's per-currency minimum daily budget. The campaign
      // never leaves PAUSED, so this is never actually spent.
      dailyBudgetCents: 500,
      audience: { type: 'INTEREST', interests: ['Drake', 'The Weeknd'] },
      interests: testInterests,
      artistName: 'Promohit Test',
    }));
    createdIds.adSetId = adSet.id;

    // 6. Ad (PAUSED — campaign is never activated → zero spend).
    const ad = await metaPost(`/act_${adAccountId}/ads`, token, {
      name: 'Promohit test ad',
      adset_id: adSet.id,
      status: 'PAUSED',
      creative: { creative_id: creative.id },
    });
    createdIds.adId = ad.id;

    // 7. Read everything back.
    const [campaignRb, adsetRb, creativeRb, adRb] = await Promise.all([
      getJson(campaign.id, 'objective,status,special_ad_categories,buying_type', token),
      getJson(
        adSet.id,
        'optimization_goal,billing_event,bid_strategy,destination_type,promoted_object{pixel_id,custom_conversion_id},targeting,daily_budget,status',
        token,
      ),
      getJson(creative.id, 'object_story_spec,degrees_of_freedom_spec,instagram_user_id', pageToken),
      getJson(ad.id, 'status,creative', token),
    ]);
    rawReadback.campaign = campaignRb;
    rawReadback.adset = adsetRb;
    rawReadback.creative = creativeRb;
    rawReadback.ad = adRb;

    // 8. Compare to the criteria table.
    const ctx: CriterionContext = {
      useConversions,
      pixelId: pixelId ?? null,
      customConversionId,
      pageId,
      instagramUserId,
      chosenObjective,
    };
    const { results, overall } = evaluateCriteria(
      { campaign: campaignRb, adset: adsetRb, creative: creativeRb, ad: adRb },
      ctx,
    );

    const adsManagerUrl = `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${adAccountId}&selected_campaign_ids=${campaign.id}`;

    return NextResponse.json({
      overall,
      chosenObjective,
      useConversions,
      customConversionId,
      customConversionDiag,
      results,
      createdIds,
      adsManagerUrl,
      rawReadback,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      error: { message },
      customConversionDiag,
      createdIds,
      rawReadback,
      note: 'Whatever was built is left PAUSED in Ads Manager for inspection.',
    }, { status: 500 });
  } finally {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
