/** 大分類 —— 沿用 watchlist 的六分類 */
export const MAIN_TYPES = ['電影', '影集', '綜藝', '動漫', '小說', '漫畫'] as const;
export type MainType = (typeof MAIN_TYPES)[number];

export const COUNTRIES = ['日本', '韓國', '大陸', '台灣', '歐美', '其他'] as const;
export type Country = (typeof COUNTRIES)[number];

export const STATUSES = ['未觀看', '觀看中', '已完成', '棄劇'] as const;
export type WatchStatus = (typeof STATUSES)[number];

/**
 * 來源平台選項。
 *
 * 兩件事必須守住：
 * 1. **既有字串只能新增、不能改字或刪除** —— Sheet 存的是這裡的字面值，
 *    改字等於讓舊資料對不上選項（ItemForm 會把對不上的值當成空的存回去）。
 * 2. 這也是 `src/lib/watchUrl.ts` 網址辨識結果的值域：`detectPlatform()`
 *    回傳的一定是這個清單裡的字串，型別會擋住寫錯的情況。
 *
 * 排序照「能站內播 → 台灣常見訂閱制 → 國際訂閱制 → 動漫 → 其他影音站」，
 * `自架 / 直鏈` 與 `其他` 固定收尾。
 */
export const PLATFORMS = [
  'YouTube',
  'BiliBili',
  'Vimeo',
  'Dailymotion',
  'Twitch',
  'niconico',
  'Internet Archive',
  'Google Drive',
  'Streamable',
  'Netflix',
  'Disney+',
  'Prime Video',
  'Max',
  'Apple TV+',
  'CATCHPLAY+',
  'KKTV',
  'LINE TV',
  'LiTV',
  'MyVideo',
  'Fridays影音',
  'Hami Video',
  'IQiyi',
  'Viu',
  'WeTV',
  '巴哈姆特動畫瘋',
  'Crunchyroll',
  '自架 / 直鏈',
  '其他',
] as const;

export type Platform = (typeof PLATFORMS)[number];

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

  /**
   * 以下四欄由 Apps Script 的每日觸發器維護，前端只讀不寫
   * （綁定當下會寫一次 tvmazeId，之後就交給後端）。
   * 放進 Sheet 而不是 localStorage 的理由：排程要所有裝置一致，
   * 在手機綁完換電腦看得到。
   */
  tvmazeId: string;
  /** 到今天為止已播出幾集；拿來當進度分母 */
  airedEp: string;
  nextAirDate: string;
  /** 例：第 188 集（S8E12） */
  nextEpLabel: string;
  /** 片長，例：23:11。YouTube 搜尋會自己帶進來，其餘可手動填 */
  duration: string;
}

/** 新增時可填的欄位（rowNumber 與 updatedAt 由後端產生） */
export type NewMediaItem = Omit<MediaItem, 'rowNumber' | 'updatedAt'>;

/** 部分更新的 payload */
export type MediaPatch = Partial<NewMediaItem>;

export type SortKey = 'updated' | 'title' | 'rating' | 'added';
