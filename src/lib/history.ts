'use client';

import { itemKey } from './itemKey';
import { readStored, setStored, useStored } from './localStore';
import { MediaItem } from '@/types/media';

/**
 * 觀看紀錄 —— 「我上次看的是哪部、什麼時候、看到幾分幾秒」。
 *
 * 跟 useSettings 的 `myStream.pos.${url}` 分工不同，兩者都留著：
 * - `pos.${url}` 是**這支影片的續播點**，鍵是網址，換一集就是另一筆
 * - 這裡是**這部作品的觀看紀錄**，鍵見 `itemKey`，用來排「繼續觀看」
 *
 * 存 localStorage 而不是 Sheets：這是「這台裝置上我看到哪」，
 * 換裝置本來就該重新算；而且每次開播都寫一次雲端太吵。
 */

export interface HistoryEntry {
  key: string;
  title: string;
  /** 上次觀看的時間（epoch 毫秒） */
  at: number;
  /** 看到第幾秒；只有直鏈影片量得到，內嵌 iframe 一律是 0 */
  position: number;
  /** 影片總長度（秒），用來算百分比 */
  duration: number;
  /** 當下的集數進度，讓卡片能顯示「上次看到第 12 集」 */
  progress: string;
}

const KEY = 'myStream.history';
const LIMIT = 60;

export const historyKey = itemKey;

function parse(raw: string): HistoryEntry[] {
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (x): x is HistoryEntry =>
        Boolean(x) && typeof x === 'object' && typeof (x as HistoryEntry).key === 'string',
    );
  } catch {
    // 手動改壞了就當作沒有紀錄，不要讓整個片庫開不起來
    return [];
  }
}

export function useHistory(): HistoryEntry[] {
  return parse(useStored(KEY, '[]'));
}

/** 讀目前的紀錄（非 hook 場合用，例如事件處理器裡） */
function read(): HistoryEntry[] {
  return parse(readStored(KEY) ?? '[]');
}

/**
 * 記一筆觀看。同一部作品只留最新一筆，並移到最前面。
 * position/duration 沒給就沿用舊值 —— 開播當下還不知道長度，
 * 不能用 0 把上次的紀錄洗掉。
 */
export function recordWatch(
  item: Pick<MediaItem, 'title' | 'watchUrl' | 'progress'>,
  position?: number,
  duration?: number,
) {
  const key = historyKey(item);
  const previous = read();
  const old = previous.find((e) => e.key === key);

  const entry: HistoryEntry = {
    key,
    title: item.title,
    at: Date.now(),
    position: position ?? old?.position ?? 0,
    duration: duration ?? old?.duration ?? 0,
    progress: item.progress,
  };

  setStored(KEY, JSON.stringify([entry, ...previous.filter((e) => e.key !== key)].slice(0, LIMIT)));
}

export function forgetWatch(key: string) {
  setStored(KEY, JSON.stringify(read().filter((e) => e.key !== key)));
}

export function clearHistory() {
  setStored(KEY, '[]');
}

/** 把紀錄整理成 key → entry，卡片查自己那筆時不必每次掃全表 */
export function indexHistory(entries: HistoryEntry[]): Map<string, HistoryEntry> {
  return new Map(entries.map((e) => [e.key, e]));
}

// ─── 顯示用 ───────────────────────────────────────────────────

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/**
 * 「剛剛 / 3 小時前 / 昨天 / 5 天前 / 2026/08/01」
 *
 * `now` 是渲染那一刻取的固定值，所以「剛剛看完的東西」時間會比它還新、
 * 差值為負。那種情況就是字面上的剛剛，不能當成錯誤丟掉。
 */
export function formatAgo(at: number, now: number): string {
  if (!Number.isFinite(at) || at <= 0) return '';
  const diff = now - at;
  if (!Number.isFinite(diff)) return '';
  if (diff < 0) return '剛剛';

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < 5 * minute) return '剛剛';
  if (diff < hour) return `${Math.floor(diff / minute)} 分鐘前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小時前`;
  if (diff < 2 * day) return '昨天';
  if (diff < 30 * day) return `${Math.floor(diff / day)} 天前`;

  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}
