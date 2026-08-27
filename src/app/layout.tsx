import type { Metadata, Viewport } from 'next';
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar';
import './globals.css';

export const metadata: Metadata = {
  title: '墨影',
  description: '收藏、追進度、一鍵開播',
  applicationName: '墨影',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  // iOS 加到主畫面後要全螢幕執行、標題不要顯示網址，靠這組設定
  appleWebApp: {
    capable: true,
    title: '墨影',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0b10',
  width: 'device-width',
  initialScale: 1,
  // 全螢幕執行時讓內容避開瀏海與底部 home indicator
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-TW">
      <head>
        {/* Next 只輸出標準化的 mobile-web-app-capable。iOS 16.4 以後改讀 manifest 的
            display 所以夠用，但舊版 iOS 仍只認這個 apple- 前綴的標籤，補上以免
            加到主畫面後開起來還是帶著 Safari 網址列 */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* 這條規則針對的是 Pages Router 的 _document.js，App Router 的 layout
            本來就套用到每一頁，不適用 */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;500;700;900&family=Noto+Sans+TC:wght@300;400;500;700&family=JetBrains+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
        {/*
          主題與字級要在「首次繪製之前」就套上，否則每次開站都會先閃一下
          預設的墨黑再跳成使用者選的主題。靜態輸出沒有伺服器可以先讀 cookie，
          所以只能用同步的行內腳本 —— 這是這類設定的標準做法。
          鍵名與 appearance.ts 的 APPEARANCE_KEYS 必須一致。
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('myStream.theme');if(t&&t!=='ink')document.documentElement.setAttribute('data-theme',t);var s=localStorage.getItem('myStream.fontScale');if(s)document.documentElement.style.setProperty('--font-scale',s)}catch(e){}`,
          }}
        />
      </head>
      <body className="antialiased">
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
