'use client';

import { useEffect } from 'react';

interface Props {
  campaignId: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
}

export function SmartLinkClickRecorder({
  campaignId,
  utmSource,
  utmMedium,
  utmCampaign,
  utmContent,
}: Props) {
  useEffect(() => {
    const params = new URLSearchParams({
      platform: 'page_view',
      ...(utmSource && { utm_source: utmSource }),
      ...(utmMedium && { utm_medium: utmMedium }),
      ...(utmCampaign && { utm_campaign: utmCampaign }),
      ...(utmContent && { utm_content: utmContent }),
    });

    // Record page view without redirecting
    fetch(`/api/go/${campaignId}/click?${params.toString()}&record_only=1`, {
      method: 'GET',
    }).catch(() => {
      // Non-fatal — tracking is best-effort
    });
  }, [campaignId, utmSource, utmMedium, utmCampaign, utmContent]);

  return null;
}
