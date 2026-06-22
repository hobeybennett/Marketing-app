import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth';

export default async function Home() {
  const session = await getServerSession();
  if (session?.user?.id) redirect('/campaigns');
  return (
    <>
      <style>{`
        @keyframes ring-expand {
          0%   { transform: scale(1);   opacity: 0.55; }
          100% { transform: scale(3);   opacity: 0; }
        }
        .ring { animation: ring-expand 3.6s ease-out infinite; }
        .ring-2 { animation-delay: 1.2s; }
        .ring-3 { animation-delay: 2.4s; }

        @keyframes rise {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .rise   { animation: rise 0.75s ease-out both; }
        .rise-1 { animation: rise 0.75s ease-out 0.15s both; }
        .rise-2 { animation: rise 0.75s ease-out 0.3s both; }
        .rise-3 { animation: rise 0.75s ease-out 0.45s both; }

        @keyframes slow-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .spin-slow { animation: slow-spin 20s linear infinite; }
      `}</style>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section
        className="-mx-4 -mt-8 px-6 pt-28 pb-24 relative overflow-hidden text-center"
        style={{ background: 'radial-gradient(ellipse 70% 55% at 50% 45%, rgba(109,40,217,0.2) 0%, transparent 68%)' }}
      >
        {/* Spinning decorative ring (far back) */}
        <div
          className="spin-slow absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{
            width: 600, height: 600,
            borderRadius: '50%',
            border: '1px dashed rgba(124,58,237,0.12)',
          }}
        />

        {/* Echo rings */}
        <div className="relative inline-flex items-center justify-center mb-12">
          <div className="relative w-20 h-20">
            <div className="ring absolute inset-0 rounded-full border border-violet-500/50" />
            <div className="ring ring-2 absolute inset-0 rounded-full border border-blue-500/35" />
            <div className="ring ring-3 absolute inset-0 rounded-full border border-violet-400/25" />
            {/* Centre orb */}
            <div
              className="absolute inset-0 rounded-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.45) 0%, rgba(59,130,246,0.35) 100%)' }}
            >
              {/* Waveform icon */}
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                <line x1="4"  y1="14" x2="4"  y2="14" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
                <line x1="8"  y1="10" x2="8"  y2="18" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
                <line x1="12" y1="6"  x2="12" y2="22" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
                <line x1="16" y1="9"  x2="16" y2="19" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
                <line x1="20" y1="12" x2="20" y2="16" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
                <line x1="24" y1="14" x2="24" y2="14" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
            </div>
          </div>
        </div>

        <h1 className="font-display text-5xl md:text-7xl font-800 mb-5 leading-[1.08] tracking-tight rise">
          Made something?<br />
          <span className="gradient-text">Now get it heard.</span>
        </h1>

        <p className="text-lg md:text-xl text-gray-400 mb-10 max-w-lg mx-auto rise-1">
          Paste your Spotify link. Upload your audio. We build and launch your Meta ad campaign — automatically.
        </p>

        <div className="flex items-center justify-center gap-4 flex-wrap rise-2">
          <Link href="/campaigns/new" className="btn-primary text-sm px-8 py-3 text-base">
            Get started free
          </Link>
          <a
            href="#how-it-works"
            className="text-sm text-gray-400 hover:text-gray-200 transition-colors border border-gray-700 hover:border-gray-500 rounded-xl px-6 py-3"
          >
            See how it works
          </a>
        </div>

        <p className="text-xs text-gray-600 mt-6 rise-3">No credit card required · First campaign free</p>
      </section>

      {/* ── How it works ────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 scroll-mt-16">
        <div className="text-center mb-14">
          <p className="text-xs font-semibold tracking-widest text-violet-400 uppercase mb-3">Simple by design</p>
          <h2 className="font-display text-3xl md:text-4xl font-700">Three steps to your first play</h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {([
            {
              num: '01',
              title: 'Paste your Spotify link',
              desc: "We pull in your track name, artist name, and cover art. You don't have to type a thing.",
            },
            {
              num: '02',
              title: 'Upload your audio',
              desc: 'We slice your track into 5 short video ads using your artwork. Zero editing skills needed.',
            },
            {
              num: '03',
              title: 'We launch your campaign',
              desc: 'Ads go live across Facebook & Instagram. AI writes the copy. You watch the plays come in.',
            },
          ] as const).map((step) => (
            <div key={step.num} className="card card-hover p-8">
              <div className="font-display text-5xl font-800 gradient-text mb-5 leading-none">{step.num}</div>
              <h3 className="font-semibold text-base mb-2">{step.title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────── */}
      <section className="-mx-4 px-6 py-20 border-t border-gray-800/40" style={{ background: 'rgba(13,17,40,0.4)' }}>
        <div className="text-center mb-14">
          <p className="text-xs font-semibold tracking-widest text-violet-400 uppercase mb-3">What&apos;s included</p>
          <h2 className="font-display text-3xl md:text-4xl font-700">Everything to go from track to audience</h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
          {([
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <rect x="2" y="3" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M7 9.5l3-2 3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ),
              title: '5 video ad creatives',
              desc: 'Generated from your cover art — ready to run, no design work.',
            },
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M4 6h12M4 10h8M4 14h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              ),
              title: 'AI-written ad copy',
              desc: 'Headlines and descriptions for every clip, written by Claude.',
            },
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M10 6v4l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              ),
              title: '3 targeted audiences',
              desc: 'Interest, retargeting, and lookalike — all built automatically.',
            },
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M10 3C6.13 3 3 6.13 3 10s3.13 7 7 7 7-3.13 7-7-3.13-7-7-7z" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M3 10h14M10 3a10 10 0 0 1 0 14M10 3a10 10 0 0 0 0 14" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
              ),
              title: 'Smart stream link',
              desc: 'One link opens Spotify, Apple Music, or YouTube Music — wherever your fans are.',
            },
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M3 15l4-6 4 4 3-5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ),
              title: 'Real-time dashboard',
              desc: 'Track spend, clicks, and reach the moment your ads go live.',
            },
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M10 2l1.5 4.5H16l-3.5 2.5 1.5 4.5L10 11l-4 2.5 1.5-4.5L4 6.5h4.5L10 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
              ),
              title: 'Pixel fires on every visit',
              desc: 'Your Meta Pixel tracks every fan who clicks through — build your retargeting pool from day one.',
            },
          ] as const).map((f) => (
            <div key={f.title} className="card card-hover p-5 flex gap-4 items-start">
              <div className="mt-0.5 text-violet-400 shrink-0">{f.icon}</div>
              <div>
                <h3 className="font-semibold text-sm mb-1">{f.title}</h3>
                <p className="text-xs text-gray-400 leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────── */}
      <section className="py-24 border-t border-gray-800/40">
        <div className="text-center mb-14">
          <p className="text-xs font-semibold tracking-widest text-violet-400 uppercase mb-3">Pricing</p>
          <h2 className="font-display text-3xl md:text-4xl font-700">Start free. Scale when you&apos;re ready.</h2>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
          {/* Free */}
          <div className="card p-8 flex flex-col">
            <p className="font-display text-xl font-700 mb-1">Free</p>
            <div className="text-4xl font-bold mb-1">$0</div>
            <p className="text-sm text-gray-500 mb-8">Your first campaign on us.</p>
            <ul className="space-y-2.5 text-sm text-gray-300 mb-8 flex-1">
              {['1 campaign included', '5 video ad creatives', 'Smart stream link', 'Performance dashboard'].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span className="text-violet-400 mt-px">–</span>
                  {item}
                </li>
              ))}
              <li className="flex gap-2.5 text-gray-500">
                <span className="mt-px">+</span>
                $2.99 AUD per additional campaign
              </li>
            </ul>
            <Link href="/campaigns/new" className="btn-primary w-full text-sm py-2.5">
              Start free
            </Link>
          </div>

          {/* Pro */}
          <div
            className="relative p-8 flex flex-col rounded-xl"
            style={{
              border: '1px solid rgba(124,58,237,0.55)',
              background: 'linear-gradient(145deg, rgba(109,40,217,0.12) 0%, rgba(59,130,246,0.06) 100%)',
            }}
          >
            <div
              className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full"
              style={{ background: 'rgba(109,40,217,0.9)', color: '#ddd6fe', border: '1px solid rgba(139,92,246,0.5)' }}
            >
              Most popular
            </div>
            <p className="font-display text-xl font-700 mb-1 mt-2">Pro</p>
            <div className="text-4xl font-bold mb-1">
              $9.99 AUD<span className="text-base font-normal text-gray-400">/mo</span>
            </div>
            <p className="text-sm text-gray-500 mb-8">Unlimited campaigns. Cancel anytime.</p>
            <ul className="space-y-2.5 text-sm text-gray-300 mb-8 flex-1">
              {[
                'Unlimited campaigns',
                '5 video ad creatives each',
                'Smart stream links',
                'Performance dashboard',
                'Priority processing',
              ].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span className="text-violet-400 mt-px">–</span>
                  {item}
                </li>
              ))}
            </ul>
            <a href="/api/checkout/pro" className="btn-primary w-full text-sm py-2.5">
              Start Pro
            </a>
          </div>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────── */}
      <section
        className="-mx-4 px-6 py-28 text-center border-t border-gray-800/40"
        style={{ background: 'radial-gradient(ellipse 55% 65% at 50% 100%, rgba(109,40,217,0.15) 0%, transparent 65%)' }}
      >
        <h2 className="font-display text-4xl md:text-6xl font-800 mb-5 leading-tight">
          Ready to be heard?
        </h2>
        <p className="text-gray-400 text-lg mb-10 max-w-xs mx-auto">
          Your first campaign is free. No credit card needed.
        </p>
        <Link href="/campaigns/new" className="btn-primary text-base px-10 py-3.5">
          Get started free →
        </Link>
      </section>
    </>
  );
}
