import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hitback',
  description: 'Automated music promotion platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-950 text-white">
        <nav className="border-b border-gray-800 px-6 py-4">
          <a href="/campaigns" className="text-xl font-bold tracking-tight">
            Hitback
          </a>
        </nav>
        <main className="container mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
