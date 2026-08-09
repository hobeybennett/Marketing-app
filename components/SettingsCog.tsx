'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';

// Settings moved out of the bottom tab bar (that slot is Support now, because
// the chat launcher sits there on mobile). Lives in the header instead.
export default function SettingsCog() {
  const { data: session } = useSession();
  const pathname = usePathname() ?? '';
  if (!session?.user) return null;

  const active = pathname.startsWith('/settings');
  return (
    <Link
      href="/settings"
      aria-label="Settings"
      title="Settings"
      className={`p-2 rounded-lg transition ${
        active ? 'text-violet-300 bg-violet-600/15' : 'text-gray-400 hover:text-gray-100 hover:bg-gray-900'
      }`}
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    </Link>
  );
}
