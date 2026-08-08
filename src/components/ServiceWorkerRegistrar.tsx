'use client';

import { useEffect } from 'react';

/**
 * 註冊 service worker。沒有畫面，純副作用。
 *
 * 只在 production 註冊 —— 開發時 SW 會攔截並快取 Next 的 HMR 資源，
 * 造成改了程式碼卻看到舊畫面的鬼打牆。
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.error('Service worker 註冊失敗:', err);
      });
    };

    // 等 load 之後再註冊，不跟首屏資源搶頻寬
    if (document.readyState === 'complete') {
      register();
      return;
    }
    window.addEventListener('load', register);
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
