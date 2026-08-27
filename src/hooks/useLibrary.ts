'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '@/lib/api';
import { itemKey } from '@/lib/itemKey';
import { sheetToItems } from '@/lib/schema';
import { BEHIND_TAB, episodesBehind } from '@/lib/schedule';
import { MediaItem, MediaPatch, NewMediaItem, SortKey } from '@/types/media';

/** 連按進度鍵時的合併視窗 */
const DEBOUNCE_MS = 1200;

/** 樂觀新增用的暫時列號。真實列號從 2 起算，負數不可能撞到 */
let tempRowSeq = 0;
const nextTempRow = () => --tempRowSeq;

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

  /**
   * 直接設定進度。跟 bumpProgress 走同一條 debounce ——
   * 輸入框每打一個字就送一次會很吵，而且最後一次才是真的
   */
  const setProgress = (item: MediaItem, value: number) => {
    const next = Math.max(0, Math.floor(value));
    const current = Number.parseInt(item.progress.replace(/[^\d]/g, ''), 10) || 0;
    if (next === current) return;
    queuePatch(item.rowNumber, { progress: String(next) });
  };

  /**
   * 樂觀新增。
   *
   * GAS 一個來回要一兩秒，等它回來才把卡片畫出來，按下「加入」之後畫面
   * 會像沒反應。所以先用一個**暫時的負數列號**把卡片放上去，POST 回來
   * 再換成真的列號。
   *
   * 為什麼是負數：真實列號從 2 起算，負數不可能撞到，而且卡片只要看到
   * 負數就知道這筆還在路上，先把編輯與刪除鎖住 —— 那些操作要靠列號定位，
   * 在真列號回來之前做會寫到別人身上。
   */
  const addOptimistic = async (list: NewMediaItem[]) => {
    if (list.length === 0) return 0;

    setError('');
    setBusy(true);
    const today = stamp();
    const pendingRows = list.map(() => nextTempRow());
    setItems((prev) => [
      ...prev,
      ...list.map((item, i) => ({
        ...item,
        rowNumber: pendingRows[i],
        updatedAt: today,
        addedDate: item.addedDate || today,
      })),
    ]);

    // 逐筆送，不能並行 —— 後端每次 append 都會改變列號
    let added = 0;
    try {
      for (let i = 0; i < list.length; i++) {
        const rowNumber = await api.addItem(account, list[i]);
        setItems((prev) =>
          prev.map((it) => (it.rowNumber === pendingRows[i] ? { ...it, rowNumber } : it)),
        );
        added += 1;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '新增失敗');
      // 沒送成功的那幾張要收回去，否則畫面上會留著一筆後端根本沒有的資料
      const stale = new Set(pendingRows.slice(added));
      setItems((prev) => prev.filter((it) => !stale.has(it.rowNumber)));
    } finally {
      setBusy(false);
    }
    return added;
  };

  const addItem = async (item: NewMediaItem) => (await addOptimistic([item])) > 0;

  const addMany = (list: NewMediaItem[]) => addOptimistic(list);


  /**
   * 批次刪除。
   *
   * **用「名稱::連結」指定要刪誰，不是列號。** 列號會過期 —— 別台裝置刪過
   * 一列、或先前有一次寫入失敗沒同步，本地記的列號就跟 Sheet 對不上；
   * 照過期的列號刪會刪到隔壁那部作品，或直接撞上「列號超出範圍」。
   *
   * 所以先跟後端對一次答案拿到當下真正的列號，再**由大到小**刪 ——
   * Sheet 刪掉一列會讓後面每一列往前移一位。
   * 刪完不自己推算新的列號，一律重抓：後端才是真相。
   */
  const removeMany = async (keys: string[]) => {
    if (keys.length === 0) return 0;

    setBusy(true);
    setError('');
    let done = 0;
    try {
      const fresh = sheetToItems(await api.fetchSheet(account));
      const wanted = new Set(keys);
      const targets = fresh
        .filter((it) => wanted.has(itemKey(it)))
        .map((it) => it.rowNumber)
        .sort((a, b) => b - a);

      for (const row of targets) {
        await api.deleteItem(account, row);
        done += 1;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗');
    } finally {
      await reload(true);
      setBusy(false);
    }
    return done;
  };

  const removeItem = async (row: number) => {
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
      // 失敗多半是本地列號已經過期，還原一份同樣過期的快照沒有意義，重抓
      setError(err instanceof Error ? err.message : '刪除失敗，已重新載入');
      reload(true);
    }
  };

  // ─── 衍生資料 ───────────────────────────────────────────────

  const keyword = search.trim().toLowerCase();
  const visible = items
    // 「待追」不是分類而是狀態：已經播了但我還沒追上的
    .filter((it) =>
      tab === '全部' ? true : tab === BEHIND_TAB ? episodesBehind(it) > 0 : it.mainType === tab,
    )
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
    setProgress,
    addItem,
    addMany,
    removeItem,
    removeMany,
  };
}
