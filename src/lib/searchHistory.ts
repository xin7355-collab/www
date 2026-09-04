'use client';

import { readStored, setStored, useStored } from './localStore';

/**
 * 搜尋關鍵字紀錄。
 *
 * 追連載時同一個關鍵字會反覆查（換季、補集數），每次重打很煩。
 * 存 localStorage 而不是 Sheet：這是「我在這台裝置查過什麼」，
 * 跟片庫資料無關，也不值得為它動 Sheet 的固定 schema。
 */

const KEY = 'myStream.searchHistory';
/** 只留這麼多筆 —— 再多也不會往下捲去找，只會佔畫面 */
const LIMIT = 12;

function parse(raw: string): string[] {
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
  } catch {
    // 手動改壞了就當作沒有紀錄
    return [];
  }
}

export function useSearchHistory(): string[] {
  return parse(useStored(KEY, '[]'));
}

/** 記一筆。重複的關鍵字移到最前面而不是再存一份 */
export function rememberSearch(keyword: string) {
  const word = keyword.trim();
  if (!word) return;

  const rest = parse(readStored(KEY) ?? '[]').filter((x) => x !== word);
  setStored(KEY, JSON.stringify([word, ...rest].slice(0, LIMIT)));
}

export function forgetSearch(keyword: string) {
  const rest = parse(readStored(KEY) ?? '[]').filter((x) => x !== keyword);
  setStored(KEY, JSON.stringify(rest));
}

export function clearSearchHistory() {
  setStored(KEY, '[]');
}
