'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';

// App chrome for signed-in pages: a sidebar on desktop, a bottom tab bar on
// mobile (most usage is on a phone). Public pages — landing, /go smart links,
// guides, legal — render without it.
declare global {
  interface Window { $crisp?: unknown[] }
}

// Third slot is Support rather than Settings: on mobile the Crisp launcher
// bubble sits exactly where this tab is, so the tab opens the chat and the
// bubble stays hidden. Settings lives in the header cog instead.
function openSupport() {
  if (typeof window === 'undefined' || !window.$crisp) return;
  window.$crisp.push(['do', 'chat:show']);
  window.$crisp.push(['do', 'chat:open']);
}

const NAV = [
  { href: '/campaigns', label: 'Campaigns', icon: MegaphoneIcon },
  { href: '/smartlinks', label: 'Smart links', icon: LinkIcon },
  { action: openSupport, label: 'Support', icon: ChatIcon },
] as const;

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
          {NAV.map((item) => {
            const Icon = item.icon;
            const classes = (active: boolean) =>
              `w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                active
                  ? 'bg-violet-600/15 text-violet-300 border border-violet-700/40'
                  : 'text-gray-400 hover:text-gray-100 hover:bg-gray-900 border border-transparent'
              }`;
            return 'href' in item ? (
              <Link key={item.label} href={item.href} className={classes(isActive(item.href))}>
                <Icon />
                {item.label}
              </Link>
            ) : (
              <button key={item.label} onClick={item.action} className={classes(false)}>
                <Icon />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Content — extra bottom padding on mobile so the tab bar never covers it */}
      <main className="flex-1 min-w-0 px-4 py-8 pb-24 md:pb-8">{children}</main>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-gray-800 bg-gray-950/95 backdrop-blur-md flex pb-[env(safe-area-inset-bottom)]">
        {NAV.map((item) => {
          const Icon = item.icon;
          const classes = (active: boolean) =>
            `flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
              active ? 'text-violet-300' : 'text-gray-500'
            }`;
          return 'href' in item ? (
            <Link key={item.label} href={item.href} className={classes(isActive(item.href))}>
              <Icon />
              {item.label}
            </Link>
          ) : (
            <button key={item.label} onClick={item.action} className={classes(false)}>
              <Icon />
              {item.label}
            </button>
          );
        })}
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

function ChatIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.8L3 21l1.4-3.5A7.6 7.6 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}
