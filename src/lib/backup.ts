'use client';

import { MediaItem, NewMediaItem } from '@/types/media';
import { COLUMN_ORDER } from './schema';

/**
 * 片庫備份。
 *
 * 為什麼需要：所有資料只存在一份 Google 試算表裡。誤刪一張分頁、
 * 或哪天 Apps Script 部署掉了，就沒有第二份。匯出是離線的保命符。
 *
 * 格式刻意用最直白的 JSON：欄位名稱就是 MediaItem 的欄位名稱，
 * 人看得懂、也能用任何工具處理，不綁這個 app。
 */

const VERSION = 1;

export interface Backup {
  version: number;
  exportedAt: string;
  account: string;
  items: NewMediaItem[];
}

/** rowNumber 是 Sheet 的實際列號，換一份試算表就沒有意義，不放進備份 */
function strip(item: MediaItem): NewMediaItem {
  const out = {} as NewMediaItem;
  for (const key of COLUMN_ORDER) {
    if (key === 'updatedAt') continue;
    out[key] = item[key];
  }
  return out;
}

export function buildBackup(account: string, items: MediaItem[]): Backup {
  return {
    version: VERSION,
    exportedAt: new Date().toISOString(),
    account,
    items: items.map(strip),
  };
}

export function downloadBackup(account: string, items: MediaItem[]) {
  const data = JSON.stringify(buildBackup(account, items), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const today = new Date().toISOString().slice(0, 10);

  // 必須先掛進 DOM 再點：脫離文件的 <a> 在部分瀏覽器會忽略 download 屬性，
  // 結果是檔案存成「download」而不是有意義的檔名
  const a = document.createElement('a');
  a.href = url;
  a.download = `片庫備份-${account}-${today}.json`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();

  // 立刻釋放會讓部分瀏覽器來不及下載，延後一輪再收
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface ImportResult {
  items: NewMediaItem[];
  skipped: number;
  error?: string;
}

/** 同名同連結視為同一部，避免重複匯入時整份翻倍 */
const identity = (item: { title: string; watchUrl: string }) =>
  `${item.title.trim()} ${item.watchUrl.trim()}`;

export function parseBackup(text: string, existing: MediaItem[]): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { items: [], skipped: 0, error: '這不是有效的 JSON 檔' };
  }

  const raw = (data as Backup)?.items;
  if (!Array.isArray(raw)) {
    return { items: [], skipped: 0, error: '檔案裡找不到 items 陣列，可能不是片庫備份' };
  }

  const seen = new Set(existing.map(identity));
  const items: NewMediaItem[] = [];
  let skipped = 0;

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const source = entry as Partial<NewMediaItem>;
    const title = String(source.title ?? '').trim();
    if (!title) continue;

    const item = {} as NewMediaItem;
    for (const key of COLUMN_ORDER) {
      if (key === 'updatedAt') continue;
      item[key] = String(source[key] ?? '');
    }
    item.title = title;
    if (!item.status) item.status = '未觀看';
    if (!item.progress) item.progress = '0';

    if (seen.has(identity(item))) {
      skipped += 1;
      continue;
    }
    seen.add(identity(item));
    items.push(item);
  }

  return { items, skipped };
}
