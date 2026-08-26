'use client';

import { useStored, setStored } from './localStore';
import { MAIN_TYPES } from '@/types/media';

/**
 * 站點捷徑 —— 使用者自訂的「常去的來源站」清單。
 *
 * 為什麼放 localStorage 而不是 Sheets：這是「我習慣去哪找片」，
 * 屬於裝置層級的偏好，跟片庫資料本身無關；而且 Sheet 的 15 欄是固定 schema，
 * 為了捷徑改 schema 要動三個檔案，不划算。代價是換裝置要重設一次。
 */
export interface SiteShortcut {
  id: string;
  label: string;
  url: string;
  /** 綁哪個分類；空字串＝所有分類都顯示 */
  type: string;
}

const KEY = 'myStream.shortcuts';

function parse(raw: string): SiteShortcut[] {
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (x): x is SiteShortcut =>
        Boolean(x) &&
        typeof x === 'object' &&
        typeof (x as SiteShortcut).label === 'string' &&
        typeof (x as SiteShortcut).url === 'string',
    );
  } catch {
    // 手動改壞了就當作沒有，不要讓整個片庫開不起來
    return [];
  }
}

export function useShortcuts(): SiteShortcut[] {
  return parse(useStored(KEY, '[]'));
}

export function saveShortcuts(list: SiteShortcut[]) {
  setStored(KEY, JSON.stringify(list));
}

export function addShortcut(list: SiteShortcut[], label: string, url: string, type: string) {
  const clean = url.trim();
  const withProtocol = /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
  const next: SiteShortcut = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    label: label.trim() || hostLabel(withProtocol),
    url: withProtocol,
    type: MAIN_TYPES.includes(type as (typeof MAIN_TYPES)[number]) ? type : '',
  };
  saveShortcuts([...list, next]);
}

export function removeShortcut(list: SiteShortcut[], id: string) {
  saveShortcuts(list.filter((s) => s.id !== id));
}

/** 沒填名稱時，用網域當標籤（去掉 www.）*/
function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** 目前分類該顯示哪些捷徑：綁定該分類的，加上沒綁分類的 */
export function shortcutsFor(list: SiteShortcut[], tab: string): SiteShortcut[] {
  if (tab === '全部') return list;
  return list.filter((s) => !s.type || s.type === tab);
}
