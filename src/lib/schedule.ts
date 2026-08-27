'use client';

import { itemKey, titleFromKey } from './itemKey';
import { setStored, useStored } from './localStore';
import { Schedule } from './tvmaze';

/**
 * 播出排程的綁定與快取。
 *
 * 為什麼要「綁定」而不是每次用名稱自動比對：作品名稱在 TVmaze 上常常
 * 對不準（季別後綴、譯名、同名作品），猜錯會讓進度條顯示完全錯誤的分母。
 * 讓使用者選一次、記起來，比每次猜可靠得多。
 *
 * 為什麼放 localStorage 而不是 Sheets：這是**衍生資料**，隨時可以重新抓，
 * 而 Sheet 的 15 欄是固定 schema，為它加欄位要同時改三個檔案。
 * 代價是換裝置要重綁一次。
 */

export interface Binding {
  showId: number;
  showName: string;
  /** TVmaze 作品頁 —— CC BY-SA 要求標示來源，不可省略 */
  url: string;
  schedule?: Schedule;
  /** 上次抓排程的時間，用來決定要不要重抓 */
  fetchedAt?: number;
}

const KEY = 'myStream.schedule';

/** 超過這個時間就重抓。播出表一天變不了幾次，半天足夠 */
export const STALE_MS = 12 * 60 * 60 * 1000;

/** 與觀看紀錄、片頭標記共用同一種鍵 */
export const scheduleKey = itemKey;

export { titleFromKey };

type Store = Record<string, Binding>;

function parse(raw: string): Store {
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    return data as Store;
  } catch {
    // 手動改壞了就當作沒綁過，不要讓整個片庫開不起來
    return {};
  }
}

export function useSchedules(): Store {
  return parse(useStored(KEY, '{}'));
}

function read(): Store {
  return parse(localStorage.getItem(KEY) ?? '{}');
}

/**
 * 給 effect 用的讀取。effect 裡直接讀 localStorage 而不是引用 hook 回傳的
 * 物件，是為了讓相依陣列只放一個字串簽章 —— 那個物件每次 render 都是新的，
 * 放進相依會無限重跑。
 */
export const readSchedules = read;

/** 只有「綁了誰」與「什麼時候抓的」會影響要不要重抓，拿它們當簽章 */
export function signature(store: Store): string {
  return Object.entries(store)
    .map(([key, b]) => `${key}#${b.showId}#${b.fetchedAt ?? 0}`)
    .sort()
    .join('|');
}

export function bindShow(key: string, binding: Omit<Binding, 'schedule' | 'fetchedAt'>) {
  const store = read();
  // 換綁不同作品時要丟掉舊排程，否則會短暫顯示上一部的集數
  store[key] = { ...binding };
  setStored(KEY, JSON.stringify(store));
}

export function unbindShow(key: string) {
  const store = read();
  delete store[key];
  setStored(KEY, JSON.stringify(store));
}

export function saveSchedule(key: string, schedule: Schedule, at: number) {
  const store = read();
  const existing = store[key];
  if (!existing) return; // 已經解除綁定就不要把資料寫回去
  store[key] = { ...existing, schedule, fetchedAt: at };
  setStored(KEY, JSON.stringify(store));
}

export const isStale = (binding: Binding, now: number) =>
  !binding.schedule || !binding.fetchedAt || now - binding.fetchedAt > STALE_MS;

/** 「08.21」——卡片空間小，年份省略 */
export function formatAirdate(date: string): string {
  const m = date.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return m ? `${m[1]}.${m[2]}` : date;
}
