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
  /** 有些來源給得出能播的連結（Internet Archive），加入時直接帶進觀看連結 */
  watchUrl?: string;
  /** Internet Archive 的項目 ID，用來在加入時換成影片直鏈 */
  archiveId?: string;
  /** 片長，例：23:11。目前只有 YouTube 給得出來 */
  duration?: string;

  // ── 以下只有 TMDB 的結果會有 ──
  /** 用來補查總集數 */
  tmdbId?: number;
  mediaType?: 'movie' | 'tv';
}
