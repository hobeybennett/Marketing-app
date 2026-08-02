import { NextRequest, NextResponse } from 'next/server';
import * as path from 'path';
import * as fs from 'fs';
import { getServerSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  metaPost,
  uploadVideoToMeta,
  uploadImageToMeta,
  resolveInterests,
  buildTargeting,
  buildCampaignBody,
} from '@/lib/meta-campaign';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Owner-only: launch the Promohit self-promo ad (ships with the app in
// assets/self-promo) on the owner's ad account, as the Promohit page/IG.
//
//   GET /api/admin/self-promo                 → dry run: shows the plan + your
//                                               available pages/IG accounts
//   GET /api/admin/self-promo?go=1            → launches with defaults below
//     &page=<pageId>&ig=<igUserId>            → run as a specific page/IG identity
//     &budget=2500                            → lifetime budget in cents (default A$25)
//     &days=7                                 → how long the ad set runs
//     &paused=1                               → create everything paused for review
const AD_MESSAGE =
  "You spent months on your song. Don't let it die with 40 streams.\n\n" +
  'Promohit turns your track into 5 video ads and launches a real Instagram campaign ' +
  'for it — automatically. Paste your Spotify link, upload your audio, done.\n\n' +
  'Free during early access. 🎧';
const LINK = 'https://promohit.marketing?utm_source=meta&utm_medium=paid&utm_campaign=selfpromo';
const INTEREST_SEEDS = ['Music production', 'DistroKid', 'CD Baby', 'SoundCloud', 'Spotify for Artists'];

export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (session?.user?.email !== 'hobeybennett@gmail.com') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const conn = await prisma.metaConnection.findFirst({
    where: { user: { email: 'hobeybennett@gmail.com' } },
  });
  const token = conn?.accessToken ?? process.env.META_ACCESS_TOKEN;
  const adAccountId = (sp.get('account') ?? conn?.adAccountId ?? process.env.META_AD_ACCOUNT_ID ?? '')
    .replace(/^act_/, '');
  const pageId = sp.get('page') ?? conn?.pageId ?? process.env.META_PAGE_ID ?? null;
  const igId = sp.get('ig') ?? conn?.instagramUserId ?? null;
  const budgetCents = Math.max(1000, parseInt(sp.get('budget') ?? '2500', 10) || 2500);
  const days = Math.min(30, Math.max(1, parseInt(sp.get('days') ?? '7', 10) || 7));
  const paused = sp.get('paused') === '1';

  if (!token || !adAccountId || !pageId) {
    return NextResponse.json(
      { error: 'Missing Meta credentials (token / ad account / page). Connect Meta in Settings first.' },
      { status: 400 },
    );
  }

  const videoPath = path.join(process.cwd(), 'assets', 'self-promo', 'promohit-ad.mp4');
  const thumbPath = path.join(process.cwd(), 'assets', 'self-promo', 'f1.png');
  if (!fs.existsSync(videoPath) || !fs.existsSync(thumbPath)) {
    return NextResponse.json({ error: 'self-promo assets missing from build' }, { status: 500 });
  }

  if (sp.get('go') !== '1') {
    // Dry run — show the plan and the identities available so the owner can pick
    // the Promohit page/IG by id, then re-request with &go=1.
    return NextResponse.json({
      dryRun: true,
      plan: {
        adAccountId: `act_${adAccountId}`,
        pageId,
        instagramUserId: igId,
        lifetimeBudget: `${(budgetCents / 100).toFixed(2)} (account currency)`,
        runsForDays: days,
        objective: 'OUTCOME_TRAFFIC → landing page views',
        link: LINK,
        message: AD_MESSAGE,
        interestSeeds: INTEREST_SEEDS,
        createStatus: paused ? 'PAUSED' : 'ACTIVE',
      },
      availablePages: conn?.availablePages ?? 'n/a',
      availableInstagramAccounts: conn?.availableInstagramAccounts ?? 'n/a',
      howToLaunch: 'Re-open this URL with &go=1 (optionally &page=<id>&ig=<id>&budget=<cents>&paused=1)',
    });
  }

  try {
    const videoId = await uploadVideoToMeta(videoPath, token, adAccountId, 'Promohit self-promo');
    const imageHash = await uploadImageToMeta(thumbPath, token, adAccountId);

    const campaign = await metaPost(`/act_${adAccountId}/campaigns`, token, {
      // Shared builder — it sets special_ad_categories AND the
      // is_adset_budget_sharing_enabled flag Meta requires when the budget lives
      // on the ad set rather than the campaign (error subcode 4834011). Created
      // PAUSED; activated last, after everything under it exists.
      ...buildCampaignBody({
        name: 'Promohit — Early Access (self-promo)',
        objective: 'OUTCOME_TRAFFIC',
      }),
    });

    const interests = await resolveInterests(INTEREST_SEEDS, token);
    const endTime = new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
    const adSet = await metaPost(`/act_${adAccountId}/adsets`, token, {
      name: 'Promohit self-promo — musicians',
      campaign_id: campaign.id,
      billing_event: 'IMPRESSIONS',
      destination_type: 'WEBSITE',
      optimization_goal: 'LANDING_PAGE_VIEWS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      // Lifetime budget + end date = a hard spend cap, no kill-switch needed.
      lifetime_budget: budgetCents,
      end_time: endTime,
      targeting: buildTargeting({ type: 'INTEREST', interests: [] }, { interests }),
      dsa_beneficiary: 'Promohit',
      dsa_payor: 'Promohit',
      status: 'ACTIVE',
    });

    const creativeBody = (ig: string | null): Record<string, unknown> => ({
      name: 'Promohit self-promo video',
      object_story_spec: {
        page_id: pageId,
        ...(ig ? { instagram_user_id: ig } : {}),
        video_data: {
          video_id: videoId,
          image_hash: imageHash,
          message: AD_MESSAGE,
          call_to_action: { type: 'SIGN_UP', value: { link: LINK } },
        },
      },
    });
    let creative: { id: string };
    try {
      creative = await metaPost(`/act_${adAccountId}/adcreatives`, token, creativeBody(igId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Same fallback as meta-setup: IG identity not usable by this ad account.
      if (igId && (msg.includes('1815199') || /Instagram account/i.test(msg))) {
        creative = await metaPost(`/act_${adAccountId}/adcreatives`, token, creativeBody(null));
      } else {
        throw err;
      }
    }

    const ad = await metaPost(`/act_${adAccountId}/ads`, token, {
      name: 'Promohit self-promo',
      adset_id: adSet.id,
      creative: { creative_id: creative.id },
      status: 'ACTIVE',
    });

    if (!paused) {
      await metaPost(`/${campaign.id}`, token, { status: 'ACTIVE' });
    }

    return NextResponse.json({
      ok: true,
      status: paused ? 'PAUSED (activate in Ads Manager when ready)' : 'ACTIVE (pending Meta ad review)',
      campaignId: campaign.id,
      adSetId: adSet.id,
      adId: ad.id,
      lifetimeBudgetCents: budgetCents,
      endsAt: endTime,
      resolvedInterests: interests.map((i) => i.name),
      manage: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${adAccountId}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[self-promo] failed:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
