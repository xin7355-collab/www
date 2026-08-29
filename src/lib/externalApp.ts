'use client';

/**
 * 用外部 App 開啟連結。
 *
 * 為什麼要這個：iOS 上的網頁沒辦法讓 YouTube 在背景播（那是原生 App 才有的
 * 權限），但使用者手機裡通常已經裝了做得到的 App（Tube Browser、Brave…）。
 * 與其假裝我們做得到，不如把連結交給那些 App。
 *
 * 為什麼是「填樣板」而不是內建一份清單：各家 App 的 URL scheme 沒有標準，
 * 也沒有公開的登記處，寫死一份清單只會過期。讓使用者填一次，任何 App 都能接。
 */

/** 樣板裡可以用的替換符 */
export const PLACEHOLDERS = [
  { token: '{url}', desc: '完整網址，已做百分比編碼（最常用）' },
  { token: '{rawurl}', desc: '完整網址，原樣不編碼' },
  { token: '{nohttps}', desc: '去掉開頭 https:// 的網址' },
] as const;

/**
 * 把網址套進樣板。樣板是空的就回 null，代表「照原本的方式開」。
 *
 * 常見的兩種寫法：
 * - 有參數的：`tubebrowser://open?url={url}`
 * - 換 scheme 的：`brave://open-url?url={url}`、`googlechrome://{nohttps}`
 */
export function applyScheme(template: string, url: string): string | null {
  const tpl = template.trim();
  if (!tpl || !url) return null;

  return tpl
    .replace(/\{url\}/g, encodeURIComponent(url))
    .replace(/\{rawurl\}/g, url)
    .replace(/\{nohttps\}/g, url.replace(/^https?:\/\//i, ''));
}

/** 這個連結是不是 YouTube —— 目前只有 YouTube 需要外送 */
export function isYouTube(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return /^(m\.)?youtube\.com$|^youtu\.be$|^youtube-nocookie\.com$/.test(host);
  } catch {
    return false;
  }
}
