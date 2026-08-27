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
  const today = new Date().toISOString().slice(0, 10);
  saveBlob(new Blob([data], { type: 'application/json' }), `片庫備份-${account}-${today}.json`);
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);

  // 必須先掛進 DOM 再點：脫離文件的 <a> 在部分瀏覽器會忽略 download 屬性，
  // 結果是檔案存成「download」而不是有意義的檔名
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();

  // 立刻釋放會讓部分瀏覽器來不及下載，延後一輪再收
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 匯出 CSV，給試算表用。
 *
 * 跟 JSON 備份的分工：JSON 是**還原用**的（欄位原封不動，匯得回來），
 * CSV 是**看的**（丟進 Excel／Google 試算表自己排序統計）。
 * CSV 沒辦法無損還原，所以兩個都留著。
 */
export function downloadCsv(account: string, items: MediaItem[]) {
  const header = COLUMN_ORDER.filter((k) => k !== 'updatedAt');
  const rows = items.map((it) => header.map((k) => it[k] ?? ''));

  const body = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');

  // BOM 是必要的：Windows 版 Excel 沒有它會把 UTF-8 當成 Big5，中文全變亂碼
  const blob = new Blob(['\uFEFF' + body], { type: 'text/csv;charset=utf-8' });
  saveBlob(blob, `片庫-${account}-${new Date().toISOString().slice(0, 10)}.csv`);
}

/** 逗號、引號、換行都得包起來，否則欄位會在試算表裡爆開 */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * 找出重複的作品。
 *
 * 判重不能只看標題：同一支 YouTube 影片被加兩次時，標題可能因為來源不同
 * 而長得不一樣；也不能只看連結，因為手動加的常常沒填連結。
 * 所以「連結相同」或「標題相同」其中一個成立就算同一部，用聯集串起來。
 */
export function findDuplicates(items: MediaItem[]): MediaItem[][] {
  const byKey = new Map<string, MediaItem[]>();

  for (const item of items) {
    const keys = [`t:${item.title.trim().toLowerCase()}`];
    const url = item.watchUrl.trim();
    if (url) keys.push(`u:${url}`);
    for (const key of keys) {
      const bucket = byKey.get(key);
      if (bucket) bucket.push(item);
      else byKey.set(key, [item]);
    }
  }

  // 同一部可能同時因為標題與連結被收進兩個 bucket，用成員集合去掉重複的組
  const seen = new Set<string>();
  const groups: MediaItem[][] = [];
  for (const bucket of byKey.values()) {
    if (bucket.length < 2) continue;
    const signature = bucket.map((i) => i.rowNumber).sort((a, b) => a - b).join(',');
    if (seen.has(signature)) continue;
    seen.add(signature);
    groups.push(bucket);
  }
  return groups;
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
