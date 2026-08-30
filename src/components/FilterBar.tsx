'use client';

import { BEHIND_TAB } from '@/lib/schedule';
import { MAIN_TYPES, SortKey, STATUSES } from '@/types/media';

interface Props {
  tab: string;
  setTab: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  sortKey: SortKey;
  setSortKey: (v: SortKey) => void;
  counts: Record<string, number>;
}

const SORT_LABEL: Record<SortKey, string> = {
  updated: '最近更新',
  added: '加入日期',
  title: '名稱',
};

export default function FilterBar({
  tab,
  setTab,
  statusFilter,
  setStatusFilter,
  sortKey,
  setSortKey,
  counts,
}: Props) {
  // 「待追」排在最前面 —— 打開 App 最想知道的就是「有哪幾部積著沒追」
  const tabs = [BEHIND_TAB, '全部', ...MAIN_TYPES];

  return (
    <div className="space-y-3">
      {/* 大分類 */}
      <div className="custom-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {tabs.map((t) => {
          const active = tab === t;
          const n = counts[t] ?? 0;
          // 沒有落後的作品時不顯示「待追」，免得多一個永遠是 0 的分頁
          if (t === BEHIND_TAB && n === 0 && !active) return null;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs transition ${
                active
                  ? 'border-moon-soft bg-moon/10 text-moon'
                  : t === BEHIND_TAB
                    ? 'border-moon-soft/40 text-moon-soft hover:border-moon-soft'
                    : 'border-ink-border text-mist-silver hover:border-ink-border-strong hover:text-mist'
              }`}
            >
              {t}
              {n > 0 && <span className="font-num ml-1 text-[10px] opacity-60">{n}</span>}
            </button>
          );
        })}
      </div>

      {/* 狀態 + 排序。搜尋框搬到頁首了 —— 那裡本來就是空的 */}
      <div className="flex flex-wrap gap-2">
          <select
          className="field w-auto"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="全部">所有狀態</option>
          {STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          className="field w-auto"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
        >
          {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
            <option key={k} value={k}>
              依{SORT_LABEL[k]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
