import { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '我的片庫 — 個人影音串流平台',
    short_name: '我的片庫',
    description: '收藏、追進度、一鍵開播',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0a0b10',
    theme_color: '#0a0b10',
    categories: ['entertainment', 'utilities'],
    lang: 'zh-TW',
    dir: 'ltr',
    icons: [
      // Android 安裝需要 192 與 512 兩種 PNG，缺任一就不會出現安裝提示
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // maskable 的內容縮在中央安全區，讓系統裁成圓形等形狀時不會切到圖
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      // 向量版給支援的平台用
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}
