import { MetadataRoute } from 'next';

export const dynamic = 'force-static';

const base = process.env.NODE_ENV === 'production' ? '/www' : '';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '我的片庫 — 個人影音串流平台',
    short_name: '我的片庫',
    description: '收藏、追進度、一鍵開播',
    start_url: `${base}/`,
    scope: `${base}/`,
    display: 'standalone',
    background_color: '#0a0b10',
    theme_color: '#0a0b10',
    icons: [
      {
        src: `${base}/icon.svg`,
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };
}
