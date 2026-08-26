'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '@/lib/api';
import { sheetToItems } from '@/lib/schema';
import { MediaItem, MediaPatch, NewMediaItem, SortKey } from '@/types/media';

/** 連按進度鍵時的合併視窗 */
const DEBOUNCE_MS = 1200;

const stamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
};

/**
 * 片庫狀態。
 *
 * 更新策略沿用追番 app 的「本地樂觀更新 + 背景 POST」：
 * 使用者的操作立刻反映在 UI，失敗才重抓蓋回真實狀態。
 * 唯獨新增項目要等後端回傳 rowNumber 才能定位，所以是先 POST 再插入。
 */
export function useLibrary(account: string) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // 已載入哪個帳號的資料。把 loading 做成衍生值，
  // 就不必在 effect 裡同步 setState 切換載入狀態。
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const loading = Boolean(account) && loadedFor !== account;

  // 篩選 / 排序
  const [tab, setTab] = useState('全部');
  const [statusFilter, setStatusFilter] = useState('全部');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('updated');

  useEffect(() => {
    if (!account) return;
    let cancelled = false;

    async function load() {
      try {
        const rows = await api.fetchSheet(account);
        if (cancelled) return;
        setItems(sheetToItems(rows));
        setError('');
      } catch (err) {
        if (cancelled) return;
        setItems([]);
        setError(err instanceof Error ? err.message : '讀取失敗');
      } finally {
        // 即使失敗也要標記，否則畫面會永遠停在「載入片庫…」
        if (!cancelled) setLoadedFor(account);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [account]);

  /** 重新抓雲端資料（手動重新整理，或樂觀更新失敗時的還原） */
  const reload = useCallback(
    async (silent = false) => {
      if (!account) return;
      if (!silent) setRefreshing(true);
      try {
        const rows = await api.fetchSheet(account);
        setItems(sheetToItems(rows));
        if (!silent) setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : '讀取失敗');
      } finally {
        if (!silent) setRefreshing(false);
      }
    },
    [account],
  );

  // ─── 寫入 ───────────────────────────────────────────────────

  /**
   * 待送出的欄位更新。
   *
   * 連按 `＋` 五下不該打五次 API —— 畫面早就樂觀更新過了，後端只需要知道
   * 最後的結果。每按一下就送一次除了浪費配額，還可能因為到達順序顛倒
   * 讓 Sheet 停在中間的值。
   */
  const pending = useRef(new Map<number, { timer: number; fields: MediaPatch }>());

  const flushRow = useCallback(
    async (row: number) => {
      const entry = pending.current.get(row);
      if (!entry) return;

      window.clearTimeout(entry.timer);
      pending.current.delete(row);

      try {
        await api.updateItem(account, row, entry.fields);
      } catch (err) {
        setError(err instanceof Error ? err.message : '更新失敗，已重新載入');
        reload(true);
      }
    },
    [account, reload],
  );

  // 分頁關閉時把還沒送出的補送掉，否則剛按的那幾下會憑空消失
  useEffect(() => {
    const queue = pending.current;
    const flushAll = () => {
      for (const [row, entry] of queue) {
        window.clearTimeout(entry.timer);
        api.beaconUpdate(account, row, entry.fields);
      }
      queue.clear();
    };

    window.addEventListener('pagehide', flushAll);
    return () => {
      window.removeEventListener('pagehide', flushAll);
      flushAll();
    };
  }, [account]);

  /** 樂觀更新單筆欄位，失敗時重抓蓋回真實狀態 */
  const patchItem = async (row: number, fields: MediaPatch) => {
    setItems((prev) =>
      prev.map((it) => (it.rowNumber === row ? { ...it, ...fields, updatedAt: stamp() } : it)),
    );
    try {
      await api.updateItem(account, row, fields);
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新失敗，已重新載入');
      reload(true);
    }
  };

  /** 樂觀更新畫面，實際送出延後併成一次 */
  const queuePatch = (row: number, fields: MediaPatch) => {
    setItems((prev) =>
      prev.map((it) => (it.rowNumber === row ? { ...it, ...fields, updatedAt: stamp() } : it)),
    );

    const queue = pending.current;
    const entry = queue.get(row);
    if (entry) window.clearTimeout(entry.timer);

    queue.set(row, {
      fields: { ...(entry?.fields ?? {}), ...fields },
      timer: window.setTimeout(() => flushRow(row), DEBOUNCE_MS),
    });
  };

  const bumpProgress = (item: MediaItem, delta: number) => {
    const current = Number.parseInt(item.progress.replace(/[^\d]/g, ''), 10) || 0;
    const next = Math.max(0, current + delta);
    if (next === current) return;
    queuePatch(item.rowNumber, { progress: String(next) });
  };

  const addItem = async (item: NewMediaItem) => {
    setBusy(true);
    setError('');
    try {
      const rowNumber = await api.addItem(account, item);
      const today = stamp();
      setItems((prev) => [
        ...prev,
        { ...item, rowNumber, updatedAt: today, addedDate: item.addedDate || today },
      ]);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : '新增失敗');
      return false;
    } finally {
      setBusy(false);
    }
  };

  /**
   * 批次新增。刻意一筆一筆送而不並行 —— 後端每次 append 都會改變列號，
   * 並行的話回傳的 rowNumber 會互相踩到，本地清單就對不上真實列。
   * 中途失敗就停下並回報已成功的筆數，不假裝全部成功。
   */
  const addMany = async (list: NewMediaItem[]) => {
    setBusy(true);
    setError('');
    let added = 0;
    try {
      for (const item of list) {
        const rowNumber = await api.addItem(account, item);
        const today = stamp();
        setItems((prev) => [
          ...prev,
          { ...item, rowNumber, updatedAt: today, addedDate: item.addedDate || today },
        ]);
        added += 1;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '批次新增中斷');
    } finally {
      setBusy(false);
    }
    return added;
  };

  const removeItem = async (row: number) => {
    const snapshot = items;
    // 刪除會讓後面每一列的 rowNumber 往前移一位，本地要跟著調整，
    // 否則接下來的編輯會寫到錯的列
    setItems((prev) =>
      prev
        .filter((it) => it.rowNumber !== row)
        .map((it) => (it.rowNumber > row ? { ...it, rowNumber: it.rowNumber - 1 } : it)),
    );
    try {
      await api.deleteItem(account, row);
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗，已還原');
      setItems(snapshot);
    }
  };

  // ─── 衍生資料 ───────────────────────────────────────────────

  const keyword = search.trim().toLowerCase();
  const visible = items
    .filter((it) => tab === '全部' || it.mainType === tab)
    .filter((it) => statusFilter === '全部' || it.status === statusFilter)
    .filter((it) => {
      if (!keyword) return true;
      return [it.title, it.note, it.genre, it.platform, it.country]
        .join(' ')
        .toLowerCase()
        .includes(keyword);
    })
    .sort((a, b) => {
      switch (sortKey) {
        case 'title':
          return a.title.localeCompare(b.title, 'zh-Hant');
        case 'rating':
          return (Number(b.rating) || 0) - (Number(a.rating) || 0);
        case 'added':
          return b.addedDate.localeCompare(a.addedDate);
        default:
          return b.updatedAt.localeCompare(a.updatedAt);
      }
    });

  const stats = {
    total: items.length,
    watching: items.filter((it) => it.status === '觀看中').length,
    done: items.filter((it) => it.status === '已完成').length,
  };

  return {
    items,
    visible,
    stats,
    loading,
    refreshing,
    busy,
    error,
    setError,
    tab,
    setTab,
    statusFilter,
    setStatusFilter,
    search,
    setSearch,
    sortKey,
    setSortKey,
    reload,
    patchItem,
    bumpProgress,
    addItem,
    addMany,
    removeItem,
  };
}
