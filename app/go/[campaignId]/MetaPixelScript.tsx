'use client';

import Script from 'next/script';

declare global {
  interface Window { fbq?: (...args: unknown[]) => void; _fbq?: unknown }
}

export function MetaPixelScript({ pixelId, campaignId, songTitle, artistName }: {
  pixelId: string;
  campaignId: string;
  songTitle: string;
  artistName: string;
}) {
  const safeId = pixelId.replace(/\D/g, '');
  const eventData = JSON.stringify({
    content_type: 'music',
    content_name: `${songTitle} by ${artistName}`,
    content_ids: [campaignId],
  });

  if (!safeId) return null;

  return (
    <>
      <Script
        id="meta-pixel"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
            fbq('init','${safeId}');
            fbq('track','PageView');
            fbq('track','ViewContent',${eventData});
          `,
        }}
      />
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img height="1" width="1" style={{ display: 'none' }}
          src={`https://www.facebook.com/tr?id=${safeId}&ev=PageView&noscript=1`}
          alt="" />
      </noscript>
    </>
  );
}
