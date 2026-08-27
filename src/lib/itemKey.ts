import { MediaItem } from '@/types/media';

/**
 * 作品的識別鍵，給所有「存在瀏覽器本機的衍生資料」共用：
 * 觀看紀錄、播出排程、片頭片尾標記。
 *
 * 為什麼不用 rowNumber：刪除任何一列都會讓後面的列號整批位移，
 * 用列號當鍵，紀錄就會對到別部作品上。
 *
 * 名稱與連結都納入的代價是「改名或換連結會失去紀錄」——
 * 這比「紀錄悄悄對到另一部作品」好，前者看得出來，後者看不出來。
 */
export const itemKey = (item: Pick<MediaItem, 'title' | 'watchUrl'>) =>
  `${item.title.trim()}::${item.watchUrl.trim()}`;

/** 從鍵取回作品名稱（背景更新時不必為了名稱相依整份片庫） */
export const titleFromKey = (key: string) => key.split('::')[0] ?? '';
