import { getServerSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import CampaignNewForm from './CampaignNewForm';

export default async function NewCampaignPage() {
  const session = await getServerSession();

  const metaConnection = session?.user?.id
    ? await prisma.metaConnection.findUnique({ where: { userId: session.user.id } })
    : null;

  if (!metaConnection) {
    return (
      <div className="max-w-md mx-auto py-12">
        <Link href="/campaigns" className="text-sm text-gray-500 hover:text-gray-300 transition mb-8 inline-block">
          ← Back
        </Link>

        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.3), rgba(59,130,246,0.2))', border: '1px solid rgba(124,58,237,0.3)' }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
              <rect x="4" y="4" width="20" height="20" rx="4" stroke="#a78bfa" strokeWidth="1.5"/>
              <path d="M9 14h10M14 9v10" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 className="font-display text-2xl font-700 mb-2">Connect Meta first</h1>
          <p className="text-gray-400 text-sm leading-relaxed max-w-sm mx-auto">
            Promohit runs your ads on Facebook &amp; Instagram. You need to connect your Meta account before you can launch a campaign.
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-5">
          <p className="text-sm font-semibold mb-3">What you&apos;ll need</p>
          <ul className="space-y-2.5">
            {[
              'A Facebook account',
              'A Meta Ad Account (free to create at business.facebook.com)',
              'A Facebook Page for your artist',
            ].map(item => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-gray-400">
                <span className="text-violet-400 mt-0.5 shrink-0">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <a href="/api/auth/meta" className="btn-primary block w-full py-3 text-center text-base mb-3">
          Connect Meta Account →
        </a>
        <p className="text-center text-xs text-gray-600">
          You&apos;ll be redirected to Facebook to grant permission. Takes about 1 minute.
        </p>
      </div>
    );
  }

  return <CampaignNewForm />;
}
