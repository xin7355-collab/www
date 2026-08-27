'use client';

import { itemKey } from './itemKey';
import { setStored, useStored } from './localStore';

/**
 * 片頭／片尾標記 —— 追番時每一集都要手動拉過 OP 很煩，標一次就一勞永逸。
 *
 * 標記是**整部作品共用**的：同一部番的每一集，片頭長度幾乎都一樣。
 * 所以鍵用 `itemKey`（名稱＋連結），跟觀看紀錄、播出排程同一套。
 *
 * 只對直鏈影片有效 —— 內嵌的 YouTube / BiliBili 是對方 iframe 裡的播放器，
 * 我們既讀不到它的播放時間，也沒辦法叫它跳轉。
 */

export interface SkipMarks {
  /** 片頭結束的秒數；0 代表沒設 */
  opEnd: number;
  /** 片尾開始的秒數；0 代表沒設 */
  edStart: number;
  /** 自動跳過，不用按按鈕 */
  auto: boolean;
}

export const EMPTY_MARKS: SkipMarks = { opEnd: 0, edStart: 0, auto: false };

const KEY = 'myStream.skip';

type Store = Record<string, SkipMarks>;

function parse(raw: string): Store {
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    return data as Store;
  } catch {
    // 手動改壞了就當作沒標記，不要讓播放器開不起來
    return {};
  }
}

export function useSkipMarks(): Store {
  return parse(useStored(KEY, '{}'));
}

export function marksFor(store: Store, key: string): SkipMarks {
  return store[key] ?? EMPTY_MARKS;
}

export function saveMarks(key: string, marks: SkipMarks) {
  const store = parse(localStorage.getItem(KEY) ?? '{}');

  // 三個值都回到預設就把整筆刪掉，不要在 localStorage 裡留空殼
  if (marks.opEnd <= 0 && marks.edStart <= 0 && !marks.auto) {
    delete store[key];
  } else {
    store[key] = {
      opEnd: Math.max(0, Math.floor(marks.opEnd)),
      edStart: Math.max(0, Math.floor(marks.edStart)),
      auto: marks.auto,
    };
  }

  setStored(KEY, JSON.stringify(store));
}

export { itemKey as skipKey };
