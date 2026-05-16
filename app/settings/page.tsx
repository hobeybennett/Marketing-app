import { getServerSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import MetaConnectSection from './MetaConnectSection';

export default async function SettingsPage() {
  const session = await getServerSession();
  if (!session?.user?.id) redirect('/auth/signin');

  const metaConnection = await prisma.metaConnection.findUnique({
    where: { userId: session.user.id },
  });

  return (
    <div className="max-w-xl mx-auto py-8">
      <h1 className="text-2xl font-bold mb-8">Settings</h1>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-4">
        <h2 className="font-semibold mb-1">Account</h2>
        <p className="text-sm text-gray-400">{session.user.email}</p>
      </div>

      <MetaConnectSection connection={metaConnection} />
    </div>
  );
}
