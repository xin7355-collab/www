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

/**
 * 存取 localStorage 一律包 try/catch。
 *
 * **不是防禦性程式碼，是真的會丟例外**：Safari 無痕模式、使用者把
 * 「阻擋所有 Cookie」打開、或頁面被放進 sandbox 的 iframe 裡，
 * `localStorage` 這個屬性本身讀取就會 throw。
 *
 * 而 getSnapshot 是 React 在 render 期間呼叫的 —— 在那裡丟例外會讓
 * 整個 App 變成白畫面，而不是「這個設定讀不到」而已。
 */
export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function useStored(key: string, fallback: string): string {
  return useSyncExternalStore(
    subscribe,
    () => readStored(key) || fallback,
    () => fallback,
  );
}

export function setStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 寫不進去就只在這次工作階段生效，總比整個當掉好
  }
  emit();
}

/** 直接寫入，不通知訂閱者 —— 給 pos.{url} 這種沒有元件在看的鍵用 */
export function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 同上
  }
}

export function removeStored(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // 同上
  }
}

export function clearStored(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // 同上
  }
  emit();
}
