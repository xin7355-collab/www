'use client';

import { useSyncExternalStore } from 'react';

/**
 * localStorage 是 React 之外的資料源，用 useSyncExternalStore 訂閱它。
 *
 * 為什麼不是 useState + useEffect：靜態輸出會先預渲染 HTML，
 * 那時讀不到 localStorage。用 effect 補寫會造成 hydration mismatch，
 * 而 useSyncExternalStore 的 getServerSnapshot 就是為這件事設計的 ——
 * 預渲染吐 fallback，hydration 後 React 自己換成真實值。
 */
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // 開兩個分頁時，一邊改了另一邊也跟著更新
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function useStored(key: string, fallback: string): string {
  return useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(key) || fallback,
    () => fallback,
  );
}

export function setStored(key: string, value: string) {
  localStorage.setItem(key, value);
  emit();
}

export function clearStored(key: string) {
  localStorage.removeItem(key);
  emit();
}
