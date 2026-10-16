import type { Metadata, Viewport } from 'next';
import { Noto_Sans_Thai } from 'next/font/google';
import type { ReactNode } from 'react';
import { I18nProvider } from '@/messages';
import { th } from '@/messages/th';
import './globals.css';

const font = Noto_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '600', '700'],
  variable: '--font-sans-th',
  display: 'swap',
});

export const metadata: Metadata = {
  title: th.appName,
  description: th.tagline,
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f8fc' },
    { media: '(prefers-color-scheme: dark)', color: '#161827' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th" className={font.variable}>
      <body className="min-h-dvh font-sans antialiased">
        <I18nProvider>
          <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6">
            {children}
          </main>
        </I18nProvider>
      </body>
    </html>
  );
}
