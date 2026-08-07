/** 大分類 —— 沿用 watchlist 的六分類 */
export const MAIN_TYPES = ['電影', '影集', '綜藝', '動漫', '小說', '漫畫'] as const;
export type MainType = (typeof MAIN_TYPES)[number];

export const COUNTRIES = ['日本', '韓國', '大陸', '台灣', '歐美', '其他'] as const;
export type Country = (typeof COUNTRIES)[number];

export const STATUSES = ['未觀看', '觀看中', '已完成', '棄劇'] as const;
export type WatchStatus = (typeof STATUSES)[number];

export const PLATFORMS = [
  'Netflix',
  'Disney+',
  'YouTube',
  'BiliBili',
  'IQiyi',
  'Fridays影音',
  'Hami Video',
  '自架 / 直鏈',
  '其他',
] as const;

export const GENRES = ['動作', '劇情', '喜劇', '愛情', '科幻', '懸疑', '恐怖', '紀錄', '奇幻'] as const;

/**
 * 一筆作品。欄位順序對應 Google Sheet 的 A–O 欄，
 * 見 src/lib/schema.ts 的 COLUMN_ORDER。
 */
export interface MediaItem {
  /** Sheet 實際列號（從 2 起算）—— 所有更新的唯一定位鍵 */
  rowNumber: number;
  updatedAt: string;
  title: string;
  /** 目前看到第幾集 / 第幾章，字串保存以容納「12.5」「特別篇」這類值 */
  progress: string;
  totalEp: string;
  mainType: string;
  country: string;
  status: string;
  /** '' | '1'..'5' */
  rating: string;
  platform: string;
  watchUrl: string;
  cover: string;
  season: string;
  genre: string;
  note: string;
  addedDate: string;
}

/** 新增時可填的欄位（rowNumber 與 updatedAt 由後端產生） */
export type NewMediaItem = Omit<MediaItem, 'rowNumber' | 'updatedAt'>;

/** 部分更新的 payload */
export type MediaPatch = Partial<NewMediaItem>;

export type SortKey = 'updated' | 'title' | 'rating' | 'added';
