'use client';

import { MAIN_TYPES, SortKey, STATUSES } from '@/types/media';

interface Props {
  tab: string;
  setTab: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  search: string;
  setSearch: (v: string) => void;
  sortKey: SortKey;
  setSortKey: (v: SortKey) => void;
  counts: Record<string, number>;
}

const SORT_LABEL: Record<SortKey, string> = {
  updated: '最近更新',
  added: '加入日期',
  title: '名稱',
  rating: '評分',
};

export default function FilterBar({
  tab,
  setTab,
  statusFilter,
  setStatusFilter,
  search,
  setSearch,
  sortKey,
  setSortKey,
  counts,
}: Props) {
  const tabs = ['全部', ...MAIN_TYPES];

  return (
    <div className="space-y-3">
      {/* 大分類 */}
      <div className="custom-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {tabs.map((t) => {
          const active = tab === t;
          const n = counts[t] ?? 0;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs transition ${
                active
                  ? 'border-moon-soft bg-moon/10 text-moon'
                  : 'border-ink-border text-mist-silver hover:border-ink-border-strong hover:text-mist'
              }`}
            >
              {t}
              {n > 0 && <span className="font-num ml-1 text-[10px] opacity-60">{n}</span>}
            </button>
          );
        })}
      </div>

      {/* 搜尋 + 狀態 + 排序 */}
      <div className="flex flex-wrap gap-2">
        <input
          className="field min-w-[10rem] flex-1"
          id="library-search"
          placeholder="搜尋名稱、備註、平台…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
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
