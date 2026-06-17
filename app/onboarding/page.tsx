import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const session = await getServerSession();
  if (!session?.user) redirect('/auth/signin');

  return (
    <div className="max-w-xl mx-auto pb-20 px-1">
      <style>{`
        @keyframes ob-rise {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .ob-rise {
          opacity: 0;
          animation: ob-rise 0.65s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .ob-d1 { animation-delay: 0.05s; }
        .ob-d2 { animation-delay: 0.18s; }
        .ob-d3 { animation-delay: 0.30s; }
        .ob-d4 { animation-delay: 0.42s; }
        .ob-d5 { animation-delay: 0.54s; }
        .ob-d6 { animation-delay: 0.66s; }
      `}</style>

      {/* ── Hero ────────────────────────────────────────────────────── */}
      <div className="pt-8 pb-12">
        <div className="ob-rise ob-d1 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-violet-700/40 bg-violet-900/20 text-violet-300 text-xs font-medium tracking-widest uppercase mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
          Getting started
        </div>

        <h1 className="ob-rise ob-d2 font-display text-4xl sm:text-5xl font-bold text-white leading-[1.1] tracking-tight mb-4">
          Let's get your music<br />
          <span className="gradient-text">out there.</span>
        </h1>

        <p className="ob-rise ob-d3 text-gray-400 text-lg leading-relaxed">
          Takes about 2 minutes to set up.{' '}
          <span className="text-gray-300">We handle everything after that.</span>
        </p>
      </div>

      {/* ── What you'll need ─────────────────────────────────────────── */}
      <div className="ob-rise ob-d3 mb-12">
        <p className="text-xs font-semibold tracking-[0.18em] uppercase text-gray-600 mb-4">
          What you'll need
        </p>
        <div className="grid grid-cols-2 gap-3">

          {/* Spotify card */}
          <div className="relative bg-gray-900 border border-gray-800 rounded-2xl p-5 overflow-hidden group transition hover:border-green-900/60">
            <div className="absolute inset-0 bg-gradient-to-br from-green-900/15 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="w-10 h-10 rounded-xl bg-green-950/60 border border-green-900/50 flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
              </svg>
            </div>
            <p className="font-display font-bold text-white text-sm mb-1.5">Spotify link</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              Paste your track URL — we pull artwork and info automatically.
            </p>
          </div>

          {/* Audio card */}
          <div className="relative bg-gray-900 border border-gray-800 rounded-2xl p-5 overflow-hidden group transition hover:border-blue-900/60">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-900/15 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="w-10 h-10 rounded-xl bg-blue-950/60 border border-blue-900/50 flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
              </svg>
            </div>
            <p className="font-display font-bold text-white text-sm mb-1.5">Audio file</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              Upload your .mp3 or .wav — we cut 5 short clips automatically.
            </p>
          </div>

        </div>
      </div>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <div className="ob-rise ob-d4 mb-14">
        <p className="text-xs font-semibold tracking-[0.18em] uppercase text-gray-600 mb-6">
          How it works
        </p>

        <div className="relative">
          {/* Vertical connector line */}
          <div className="absolute left-[19px] top-10 bottom-10 w-px bg-gradient-to-b from-gray-700 via-gray-800 to-transparent" />

          <div className="space-y-0">
            {[
              {
                n: '01',
                label: 'Paste your Spotify link',
                desc: 'We pull in your cover art, song title, and artist name.',
                accent: 'text-violet-400',
              },
              {
                n: '02',
                label: 'Upload your audio',
                desc: 'We cut 5 × 30-second clips and generate a video ad for each.',
                accent: 'text-blue-400',
              },
              {
                n: '03',
                label: 'We launch your campaign',
                desc: 'AI writes copy, builds your audiences, and ads go live on Facebook & Instagram.',
                accent: 'text-violet-300',
              },
            ].map((step) => (
              <div key={step.n} className="relative flex gap-5 py-5">
                {/* Step bubble */}
                <div className="shrink-0 w-10 h-10 rounded-full bg-gray-900 border border-gray-700 flex items-center justify-center z-10">
                  <span className={`font-mono text-xs font-semibold ${step.accent}`}>{step.n}</span>
                </div>
                <div className="pt-1.5">
                  <p className="font-display font-bold text-white text-base mb-1">{step.label}</p>
                  <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── What you get ────────────────────────────────────────────── */}
      <div className="ob-rise ob-d5 mb-14">
        <p className="text-xs font-semibold tracking-[0.18em] uppercase text-gray-600 mb-4">
          What you get
        </p>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {[
              '5 video ad creatives from your cover art',
              'AI-written copy for every clip',
              '3 targeted audiences built for you',
              'Smart link page for fans to stream',
              'Ads running on Facebook & Instagram',
              'Real-time performance dashboard',
            ].map((item) => (
              <div key={item} className="flex items-start gap-2.5">
                <span className="mt-0.5 shrink-0 w-4 h-4 rounded-full bg-violet-900/50 border border-violet-700/50 flex items-center justify-center">
                  <svg className="w-2.5 h-2.5 text-violet-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </span>
                <span className="text-sm text-gray-400">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── CTA ─────────────────────────────────────────────────────── */}
      <div className="ob-rise ob-d6 text-center">
        <Link
          href="/campaigns/new"
          className="btn-primary inline-flex items-center gap-2.5 px-8 py-4 text-base font-semibold rounded-xl"
        >
          Create my first campaign
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </Link>
        <p className="text-xs text-gray-600 mt-3 font-body">
          No credit card required for your first campaign
        </p>
      </div>
    </div>
  );
}
