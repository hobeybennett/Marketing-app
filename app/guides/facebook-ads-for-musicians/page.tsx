import type { Metadata } from 'next';
import Link from 'next/link';

const SITE_URL = process.env.NEXTAUTH_URL || 'https://promohit.marketing';
const PATH = '/guides/facebook-ads-for-musicians';

export const metadata: Metadata = {
  title: 'How to Run Facebook & Instagram Ads for Your Music (2025 Guide)',
  description:
    'A step-by-step guide for independent musicians: set up Meta Business Manager, an ad account, and a Facebook Page, then launch Instagram & Facebook ads that drive Spotify streams.',
  keywords: [
    'facebook ads for musicians', 'instagram ads for music', 'how to promote music on facebook',
    'meta ads for artists', 'promote song on instagram', 'music advertising guide',
  ],
  alternates: { canonical: PATH },
  openGraph: {
    type: 'article',
    url: PATH,
    title: 'How to Run Facebook & Instagram Ads for Your Music',
    description:
      'Step-by-step: set up Meta Business Manager, an ad account, and a Page, then launch ads that drive Spotify streams.',
  },
};

const STEPS = [
  {
    n: '01',
    title: 'Create a Facebook account',
    desc: 'You need a personal Facebook account to access Meta’s advertising tools. If you already have one, skip ahead. This account only manages the ads — you don’t have to post from it.',
    action: 'Create a Facebook account',
    href: 'https://www.facebook.com/r.php',
  },
  {
    n: '02',
    title: 'Set up Meta Business Manager',
    desc: 'Business Manager (business.facebook.com) is the hub where your ad account and Page live. Create one, then click “Create account” in the top right if you don’t have one yet. It keeps your advertising separate from your personal profile.',
    action: 'Open Business Manager',
    href: 'https://business.facebook.com/overview',
  },
  {
    n: '03',
    title: 'Create an Ad Account',
    desc: 'The Ad Account is the billing entity that actually runs campaigns. In Business Manager go to Settings → Accounts → Ad Accounts → Add → Create a New Ad Account. You only need one.',
    action: 'Create an Ad Account',
    href: 'https://business.facebook.com/latest/settings/ad-accounts',
  },
  {
    n: '04',
    title: 'Create a Facebook Page',
    desc: 'Your ads appear to come from a Facebook Page — even if you never post on it. Create a simple artist Page, then add it to Business Manager under Settings → Accounts → Pages. Link your Instagram account to this Page so your ads can run under your artist identity on Instagram.',
    action: 'Create a Facebook Page',
    href: 'https://www.facebook.com/pages/creation/',
  },
  {
    n: '05',
    title: 'Add a payment method',
    desc: 'Add a credit or debit card to your Ad Account so ads can spend. Without a valid payment method your campaigns won’t deliver. Make sure you’re in your Ad Account (not Business Manager) when adding billing.',
    action: 'Open Billing in Ads Manager',
    href: 'https://adsmanager.facebook.com/adsmanager/manage/billing',
  },
];

const FAQS = [
  {
    q: 'How much does it cost to promote a song on Instagram or Facebook?',
    a: 'You can start with as little as a few dollars a day. Meta requires a minimum daily budget (roughly AU$1.50–$2 depending on your currency and optimization). Most independent artists test with $5–$10/day and scale what works. You only pay Meta for the ad delivery — Promohit’s first campaign is free.',
  },
  {
    q: 'Do I need a website to run music ads?',
    a: 'No. You can send listeners to a smart link — a single page that opens your song in Spotify. Promohit generates one automatically for every campaign, and fires a conversion pixel when someone clicks through to Spotify.',
  },
  {
    q: 'What should my ads optimize for?',
    a: 'For driving streams, use the Engagement objective with a Website conversion location, and optimize for a custom conversion that fires when someone taps “Listen on Spotify.” This tells Meta to find people who actually click through, not just people who watch the video.',
  },
  {
    q: 'Why do my ads need a Facebook Page and Instagram account?',
    a: 'Ads have to run under an identity. The Facebook Page is required; linking an Instagram account to that Page lets your ads appear under your artist name on Instagram Feed, Stories, and Reels.',
  },
  {
    q: 'How long before I see results?',
    a: 'Meta needs a short learning period (often a few dozen conversions) before delivery becomes efficient, so don’t judge the first day. Spotify for Artists data also lags ad activity by a day or two.',
  },
];

export default function FacebookAdsGuide() {
  const howToJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: 'How to Run Facebook & Instagram Ads for Your Music',
    description:
      'Set up Meta Business Manager, an ad account, and a Facebook Page, then launch ads that drive Spotify streams.',
    step: STEPS.map((s) => ({
      '@type': 'HowToStep',
      name: s.title,
      text: s.desc,
      url: `${SITE_URL}${PATH}`,
    })),
  };

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return (
    <article className="max-w-2xl mx-auto pb-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([howToJsonLd, faqJsonLd]) }} />

      <header className="pt-8 pb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-violet-400 mb-3">Guide</p>
        <h1 className="font-display text-3xl sm:text-4xl font-700 mb-4 leading-tight">
          How to Run Facebook &amp; Instagram Ads for Your Music
        </h1>
        <p className="text-gray-400 leading-relaxed">
          Paid ads on Meta (Facebook &amp; Instagram) are one of the most reliable ways for
          independent artists to reach new listeners and drive Spotify streams. This guide walks
          you through the exact setup — from a Business Manager account to a live campaign — even
          if you&apos;ve never run an ad before.
        </p>
      </header>

      <section className="mb-10">
        <h2 className="font-display text-xl font-700 mb-4">Before you start: the 5-step Meta setup</h2>
        <p className="text-gray-400 leading-relaxed mb-6">
          Meta requires a few accounts before you can advertise. It takes about five minutes and
          you only do it once. Work through each step, then you&apos;re ready to launch.
        </p>
        <div className="space-y-3">
          {STEPS.map((step) => (
            <div key={step.n} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-start gap-4">
                <span className="font-mono text-xs font-semibold text-violet-400 mt-0.5 shrink-0 w-6">{step.n}</span>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm text-white mb-1">{step.title}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed mb-3">{step.desc}</p>
                  <a
                    href={step.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300 border border-blue-800/50 hover:border-blue-600 px-3 py-1.5 rounded-lg transition"
                  >
                    {step.action}
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="font-display text-xl font-700 mb-4">What makes a music ad actually drive streams</h2>
        <div className="space-y-4 text-gray-400 leading-relaxed text-sm">
          <p>
            <strong className="text-gray-200">Short, native video.</strong> On Instagram Reels and
            Stories, the first half-second decides whether someone keeps watching. Use vertical or
            square clips built around your cover art and a snippet of the track.
          </p>
          <p>
            <strong className="text-gray-200">Optimize for the click, not the view.</strong> Set the
            campaign to an Engagement objective with a Website conversion location, and optimize for
            a custom conversion that fires when a listener taps &quot;Listen on Spotify.&quot; That
            pushes Meta to find people who actually stream, not just scroll past.
          </p>
          <p>
            <strong className="text-gray-200">Send traffic to a smart link.</strong> A single link
            that opens your song in Spotify — with a pixel that tracks every click — lets you build
            a retargeting audience of engaged listeners from day one.
          </p>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="font-display text-xl font-700 mb-4">Frequently asked questions</h2>
        <div className="space-y-4">
          {FAQS.map((f) => (
            <div key={f.q} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="font-semibold text-sm text-white mb-2">{f.q}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="bg-gradient-to-br from-violet-900/30 to-blue-900/20 border border-violet-800/40 rounded-2xl p-6 text-center">
        <p className="font-display text-lg font-700 mb-1">Skip the manual setup</p>
        <p className="text-sm text-gray-400 mb-5">
          Promohit builds your video ads, writes the copy, sets up the conversion tracking, and
          launches the whole campaign automatically. Your first campaign is free.
        </p>
        <Link href="/" className="btn-primary inline-block px-8 py-3 text-sm font-semibold">
          Promote your music free
        </Link>
      </div>
    </article>
  );
}
