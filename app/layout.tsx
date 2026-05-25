import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import SessionProvider from '@/components/SessionProvider';
import UserNav from '@/components/UserNav';

export const metadata: Metadata = {
  title: 'Hitback',
  description: 'Automated music promotion platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-950 text-white">
        <SessionProvider>
          <nav className="border-b border-gray-800 px-6 py-3 flex items-center justify-between">
            <Link href="/campaigns" className="font-bold text-lg">Hitback</Link>
            <UserNav />
          </nav>
          <main className="container mx-auto px-4 py-8">{children}</main>
          <footer className="border-t border-gray-800 px-6 py-4 flex items-center justify-center gap-6 text-xs text-gray-500">
            <Link href="/privacy" className="hover:text-gray-300 transition">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-gray-300 transition">Terms &amp; Conditions</Link>
          </footer>
        </SessionProvider>
      </body>
    </html>
  );
}
