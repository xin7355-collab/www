/**
 * 搜尋結果的共用型別。
 *
 * 獨立成一個檔案是為了斷開循環相依：`lib/api.ts` 會呼叫 `lib/bangumi.ts`，
 * 兩邊都需要這個型別，放在任一邊都會互相 import。
 */
export interface SearchResult {
  title: string;
  subtitle: string;
  cover: string;
  totalEp: string;
  mainType: string;
  country: string;
  /** 資料來源的頁面，不是觀看連結 */
  url: string;
  source: string;

  // ── 以下只有 TMDB 的結果會有 ──
  /** 用來補查總集數與上架平台 */
  tmdbId?: number;
  mediaType?: 'movie' | 'tv';
  /** 台灣可訂閱觀看的平台 */
  providers?: string[];
  /** JustWatch 頁面。TMDB 條款要求顯示 providers 時標示這個出處 */
  providerLink?: string;
}
