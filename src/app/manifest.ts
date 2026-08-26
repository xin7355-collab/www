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
    // 手機上從瀏覽器/任何 app 分享網址過來，直接開新增表單並帶入網址。
    // 走 GET 是因為靜態站沒有伺服器可以接 POST —— 參數會變成 query string，
    // 由 src/lib/quickAdd.ts 解析。
    share_target: {
      action: '/',
      method: 'GET',
      params: { title: 'title', text: 'text', url: 'url' },
    },
    // 長按 app 圖示的快捷選單
    shortcuts: [
      { name: '新增作品', short_name: '新增', url: '/?new=1' },
    ],
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
