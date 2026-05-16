import { getServerSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function NewCampaignLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session?.user?.id) redirect('/auth/signin');

  const metaConnection = await prisma.metaConnection.findUnique({
    where: { userId: session.user.id },
  });

  if (!metaConnection) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
          <div className="text-4xl mb-4">📱</div>
          <h2 className="text-xl font-bold mb-2">Connect Meta first</h2>
          <p className="text-gray-400 text-sm mb-6">
            You need to connect your Meta Ads account before creating a campaign.
          </p>
          <Link href="/settings"
            className="inline-block bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-xl font-semibold transition">
            Connect Meta Account →
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
