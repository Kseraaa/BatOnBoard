import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, Noto_Sans_Thai } from 'next/font/google';
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

// ตัวอักษรละตินของหน้าหลักและรหัสห้อง ตัวไทยไปใช้ Noto Sans Thai
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-plex-mono',
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
    <html lang="th" className={`${font.variable} ${mono.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
