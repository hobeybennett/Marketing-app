'use client';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';

export default function UserNav() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [imgError, setImgError] = useState(false);

  if (!session?.user) return null;

  const initials = session.user.name
    ? session.user.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
    : (session.user.email?.[0] ?? '?').toUpperCase();

  const showImage = !!session.user.image && !imgError;

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2">
        {showImage ? (
          <Image
            src={session.user.image!}
            alt=""
            width={32}
            height={32}
            className="rounded-full ring-2 ring-violet-500/30"
            onError={() => setImgError(true)}
            unoptimized
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center text-xs font-semibold text-white ring-2 ring-violet-500/30">
            {initials}
          </div>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-10 bg-gray-900 border border-gray-800 rounded-xl shadow-xl py-1 w-48 z-50">
          <p className="px-3 py-2 text-xs text-gray-500 truncate">{session.user.email}</p>
          <hr className="border-gray-800 my-1" />
          <Link href="/settings" onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm hover:bg-gray-800 transition">
            Settings
          </Link>
          <button onClick={() => signOut({ callbackUrl: '/auth/signin' })}
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-800 transition text-red-400">
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
