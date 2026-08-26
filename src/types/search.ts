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
}
