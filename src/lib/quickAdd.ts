'use client';

import { useSyncExternalStore } from 'react';

/**
 * 「從外面帶一個網址進來新增」的共用入口。
 *
 * 三個來源最後都收斂成同一組 query string：
 * - PWA 分享目標（手機從別的 app 分享網址過來）
 * - 書籤小工具（桌機在任何網頁點一下）
 * - 手動貼網址
 *
 * 為什麼用 useSyncExternalStore 而不是 useEffect 讀 location：
 * 靜態輸出會先預渲染，effect + setState 會造成 hydration mismatch，
 * 這個專案把那條 lint 規則設成 error 就是為了擋這件事。
 */

export interface SharedInput {
  url: string;
  title: string;
}

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener('popstate', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('popstate', onChange);
  };
}

const URL_IN_TEXT = /https?:\/\/[^\s<>"']+/;

/** 從 query string 取出要新增的網址與標題；沒有要做的事就回 null */
export function parseShared(search: string): SharedInput | null {
  const q = new URLSearchParams(search);

  // 分享目標可能把網址塞在 text 裡（很多 app 是「標題 + 換行 + 網址」）
  const raw = (q.get('url') || q.get('add') || '').trim();
  const text = q.get('text') || '';
  const candidate = raw || (URL_IN_TEXT.exec(text)?.[0] ?? '');

  // 只收合法網址。分享過來的東西什麼都有，塞一段不是網址的字串進表單只會製造髒資料
  const url = /^https?:\/\//i.test(candidate) ? candidate : '';

  // ?new=1 是 PWA 圖示長按的「新增作品」捷徑，沒有網址也要開表單
  if (!url && !q.has('new')) return null;

  return { url, title: (q.get('title') || '').trim() };
}

export function useSharedInput(): SharedInput | null {
  const search = useSyncExternalStore(
    subscribe,
    () => window.location.search,
    () => '',
  );
  return parseShared(search);
}

/** 收下之後把 query 清掉，否則重新整理會一直跳出新增表單 */
export function clearShared() {
  if (!window.location.search) return;
  window.history.replaceState(null, '', window.location.pathname);
  listeners.forEach((fn) => fn());
}
