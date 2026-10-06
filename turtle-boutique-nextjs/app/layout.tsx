import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '頑龜爬蟲 STReptile',
  description: '頑龜爬蟲 STReptile — 專營鑽紋龜與各式爬寵，每一隻都清楚記錄來源與狀態。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bungee&family=Noto+Sans+TC:wght@400;500;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
