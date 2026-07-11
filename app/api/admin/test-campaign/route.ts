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

// Generate a tiny placeholder video + thumbnail with ffmpeg (available in the
// deployed environment via nixpacks). Avoids committing binary fixtures.
function generateSampleMedia(dir: string): Promise<{ videoPath: string; imagePath: string }> {
  const videoPath = path.join(dir, 'sample.mp4');
  const imagePath = path.join(dir, 'sample.jpg');
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input('color=c=0x1DB954:s=1080x1080:d=2')
      .inputFormat('lavfi')
      .input('anullsrc=channel_layout=stereo:sample_rate=44100')
      .inputFormat('lavfi')
      .outputOptions(['-shortest', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-c:a', 'aac', '-t', '2'])
      .save(videoPath)
      .on('end', () => {
        ffmpeg(videoPath)
          .frames(1)
          .save(imagePath)
          .on('end', () => resolve({ videoPath, imagePath }))
          .on('error', reject);
      })
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
  const instagramUserId = conn.instagramUserId ?? null;

  if (!adAccountId) return NextResponse.json({ error: 'No ad account configured' }, { status: 400 });
  if (!pageId) return NextResponse.json({ error: 'No Facebook Page configured' }, { status: 400 });
  if (!pageToken) return NextResponse.json({ error: 'No Page Access Token — reconnect Meta' }, { status: 400 });

  const createdIds: Record<string, string> = {};
  const rawReadback: Record<string, any> = {};
  let tmpDir: string | null = null;

  try {
    // 1. Custom conversion → decides Engagement vs Traffic.
    const customConversionId = pixelId
      ? await ensureSpotifyClickConversion(adAccountId, token, pixelId)
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

    // 3. Placeholder media.
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promohit-test-'));
    const { videoPath, imagePath } = await generateSampleMedia(tmpDir);
    const videoId = await uploadVideoToMeta(videoPath, token, adAccountId, 'Promohit test clip');
    const imageHash = await uploadImageToMeta(imagePath, token, adAccountId);

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
    const adSet = await createAdSet(buildAdSetBody({
      name: 'Promohit test ad set',
      campaignId: campaign.id,
      useConversions,
      pixelId: pixelId ?? null,
      customConversionId,
      dailyBudgetCents: 100,
      audience: { type: 'INTEREST', interests: [] },
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
      getJson(campaign.id, 'objective,status,special_ad_categories,destination_type,buying_type', token),
      getJson(
        adSet.id,
        'optimization_goal,billing_event,bid_strategy,promoted_object{pixel_id,custom_conversion_id},targeting,daily_budget,status',
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
      results,
      createdIds,
      adsManagerUrl,
      rawReadback,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      error: { message },
      createdIds,
      rawReadback,
      note: 'Whatever was built is left PAUSED in Ads Manager for inspection.',
    }, { status: 500 });
  } finally {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
