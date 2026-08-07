import { MediaItem, STATUSES } from '@/types/media';

/**
 * Sheet A–O 欄對應到 MediaItem 的欄位順序。
 * ⚠️ 改動這裡必須同步 apps-script-code.gs 的 HEADERS 與 FIELD_COLUMN。
 */
export const COLUMN_ORDER = [
  'updatedAt',
  'title',
  'progress',
  'totalEp',
  'mainType',
  'country',
  'status',
  'rating',
  'platform',
  'watchUrl',
  'cover',
  'season',
  'genre',
  'note',
  'addedDate',
] as const satisfies readonly (keyof MediaItem)[];

const cell = (raw: unknown[], index: number): string => {
  const v = raw[index];
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return formatDate(v);
  return String(v).trim();
};

function formatDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
}

/**
 * GAS 回傳的原始列 → MediaItem。
 *
 * 舊追番帳號的 D、E 欄放的是「最新進度(AI)」與「追蹤 TRUE/FALSE」，
 * 升級後這兩格會落在 totalEp 與 mainType 上。這裡把不合法的殘留值濾掉，
 * 使用者只會看到空欄位而不是髒資料。
 */
export function rowToItem(raw: unknown[], rowNumber: number): MediaItem {
  const item = {} as MediaItem;
  COLUMN_ORDER.forEach((key, i) => {
    item[key] = cell(raw, i);
  });
  item.rowNumber = rowNumber;

  // D 欄殘留的 AI 集數多半是純數字，是合法的 totalEp，留著無妨；
  // E 欄殘留的 TRUE/FALSE 絕不會是合法的「類型」，濾掉。
  const legacyBool = /^(TRUE|FALSE)$/i;
  if (legacyBool.test(item.mainType)) item.mainType = '';
  if (legacyBool.test(item.totalEp)) item.totalEp = '';

  if (!item.status) item.status = STATUSES[0];
  if (!item.progress) item.progress = '0';

  return item;
}

/** 整份 sheet（含表頭列）→ MediaItem[]，跳過表頭與無名稱的空列 */
export function sheetToItems(rows: unknown[][]): MediaItem[] {
  if (!Array.isArray(rows) || rows.length < 2) return [];
  const items: MediaItem[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const title = cell(row, 1);
    if (!title) continue; // 空列
    items.push(rowToItem(row, i + 1)); // Sheet 列號從 1 起算，陣列從 0
  }
  return items;
}
