'use client';

import { itemKey, titleFromKey } from './itemKey';
import { todayInTaipei } from './tvmaze';
import { MediaItem } from '@/types/media';

/**
 * 播出排程 —— 綁定與結果都存在 Sheet 的 P–S 欄。
 *
 * 原本存在 localStorage，但那是 per-device 的：在手機綁完，換到電腦
 * 什麼都看不到。改存 Sheet 之後所有裝置一致，而且 Apps Script 的每日
 * 觸發器會自己更新，開 App 時不必等 API。
 *
 * 為什麼要「綁定」而不是每次用名稱自動比對：作品名稱在 TVmaze 上常常
 * 對不準（季別後綴、譯名、同名作品），猜錯會讓進度分母完全錯誤。
 * 讓使用者選一次、記起來，比每次猜可靠得多。
 */

/** 「待追」分頁的識別字串。它不是 MAIN_TYPES 之一，是一個狀態篩選 */
export const BEHIND_TAB = '待追';

export interface Schedule {
  /** 到今天為止已播出幾集 */
  aired: number;
  nextDate: string;
  nextLabel: string;
}

export { itemKey as scheduleKey, titleFromKey };

/** 從一筆作品讀出排程；沒綁或還沒抓到資料就回 null */
export function scheduleFrom(item: MediaItem): Schedule | null {
  if (!item.tvmazeId.trim()) return null;

  const aired = Number.parseInt(item.airedEp.replace(/[^\d]/g, ''), 10) || 0;
  if (aired === 0 && !item.nextAirDate) return null;

  return { aired, nextDate: item.nextAirDate.trim(), nextLabel: item.nextEpLabel.trim() };
}

/**
 * 落後最新一集幾集。沒綁排程就是 0（沒有分母，談不上落後）。
 *
 * 卡片的提示、「待追」分頁的篩選與計數都用這一支 —— 各自算一份很容易
 * 在改動時漂掉，變成分頁裡有這部、卡片上卻說已追上。
 */
export function episodesBehind(item: MediaItem): number {
  const aired = scheduleFrom(item)?.aired ?? 0;
  if (aired <= 0) return 0;
  const done = Number.parseInt(item.progress.replace(/[^\d]/g, ''), 10) || 0;
  return Math.max(0, aired - done);
}

/**
 * 這筆的排程需不需要重抓。
 *
 * 判斷依據是「下一集是不是已經播了」，而不是時間戳 —— 播出表在下一集
 * 播出之前不會變，用時間去輪詢只是白打 API。
 *
 * 正常情況下 Apps Script 的每日觸發器會先一步更新好；這裡是給
 * 「還沒裝觸發器」或「剛好在觸發器跑之前打開」的情況用的補救。
 */
export function needsRefresh(item: MediaItem, today = todayInTaipei()): boolean {
  if (!item.tvmazeId.trim()) return false;
  // 綁了但完全沒資料 —— 剛綁定或後端還沒跑過
  if (!item.nextAirDate && !item.airedEp) return true;
  // 下一集已經播了，已播集數就變了
  return Boolean(item.nextAirDate) && item.nextAirDate <= today;
}

/** 「08.21」——卡片空間小，年份省略 */
export function formatAirdate(date: string): string {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[2]}.${m[3]}` : date;
}
