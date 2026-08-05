'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';

// App chrome for signed-in pages: a sidebar on desktop, a bottom tab bar on
// mobile (most usage is on a phone). Public pages — landing, /go smart links,
// guides, legal — render without it.
const NAV = [
  { href: '/campaigns', label: 'Campaigns', icon: MegaphoneIcon },
  { href: '/smartlinks', label: 'Smart links', icon: LinkIcon },
  { href: '/settings', label: 'Settings', icon: CogIcon },
];

const APP_ROUTES = ['/campaigns', '/smartlinks', '/settings', '/onboarding', '/connect-meta', '/admin'];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname() ?? '';
  const isAppRoute = APP_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
  const show = !!session?.user && isAppRoute;

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  if (!show) return <main className="container mx-auto px-4 py-8">{children}</main>;

  return (
    <div className="flex">
      {/* Desktop sidebar. 57px = the sticky header's height (32px avatar +
          2×12px padding + 1px border) — keep in sync if that nav changes. */}
      <aside className="hidden md:block w-56 shrink-0 border-r border-gray-800 min-h-[calc(100vh-57px)] sticky top-[57px] self-start">
        <nav className="p-3 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                isActive(href)
                  ? 'bg-violet-600/15 text-violet-300 border border-violet-700/40'
                  : 'text-gray-400 hover:text-gray-100 hover:bg-gray-900 border border-transparent'
              }`}
            >
              <Icon />
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Content — extra bottom padding on mobile so the tab bar never covers it */}
      <main className="flex-1 min-w-0 px-4 py-8 pb-24 md:pb-8">{children}</main>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-gray-800 bg-gray-950/95 backdrop-blur-md flex">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
              isActive(href) ? 'text-violet-300' : 'text-gray-500'
            }`}
          >
            <Icon />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function MegaphoneIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84A3 3 0 007 19h-.5a2.5 2.5 0 010-5H7m3.34 1.84L18 20V4l-7.66 4.16M10.34 15.84V8.16M7 14V8.16h3.34M18 9a3 3 0 010 6" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
    </svg>
  );
}

function CogIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
