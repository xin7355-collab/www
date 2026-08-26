'use client';

import { useState } from 'react';
import Modal from './Modal';
import { searchWorks } from '@/lib/api';
import { MAIN_TYPES, NewMediaItem } from '@/types/media';
import { SearchResult } from '@/types/search';

interface Props {
  onPick: (prefill: Partial<NewMediaItem>) => void;
  onClose: () => void;
}

/** 可搜尋的分類 —— 綜藝沒有合適的公開資料來源，不放進來假裝有 */
const KINDS = ['電影', '影集', '動漫', '漫畫', '小說'] as const;

/**
 * 站內搜尋作品資料。
 *
 * 後端問的是不需要 API key 的公開來源，所以查到的是**作品資料**
 * （名稱、封面、集數），不是觀看連結 —— 連結還是要你自己貼，
 * 因為每個人能看的平台不一樣。
 */
export default function SearchModal({ onPick, onClose }: Props) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);

  const run = async () => {
    const keyword = q.trim();
    if (!keyword) return;

    setBusy(true);
    setError('');
    try {
      setResults(await searchWorks(keyword, kind));
    } catch (err) {
      setResults([]);
      setError(err instanceof Error ? err.message : '搜尋失敗');
    } finally {
      setBusy(false);
      setSearched(true);
    }
  };

  const pick = (r: SearchResult) => {
    onPick({
      title: r.title,
      cover: r.cover,
      totalEp: r.totalEp,
      mainType: MAIN_TYPES.includes(r.mainType as (typeof MAIN_TYPES)[number]) ? r.mainType : '',
      country: r.country,
      note: r.url ? `資料來源：${r.url}` : '',
    });
  };

  return (
    <Modal title="搜尋作品" onClose={onClose}>
      <div className="space-y-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
        >
          <input
            className="field min-w-0 flex-1"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="作品名稱，中英日文都可以"
            autoFocus
          />
          <select
            className="field w-auto shrink-0"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="">全部</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={!q.trim() || busy}
            className="shrink-0 rounded-lg bg-moon px-4 text-sm font-medium text-ink-black transition hover:bg-moon-soft disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? '搜尋中…' : '搜尋'}
          </button>
        </form>

        <p className="text-[11px] leading-relaxed text-mist-shadow">
          查到的是作品資料（名稱、封面、集數），
          <span className="text-mist-silver">不含觀看連結</span> ——
          每個人能看的平台不一樣，連結還是要你自己貼。
        </p>

        {error && (
          <p className="rounded-lg border border-cinnabar/40 bg-cinnabar/10 px-3 py-2 text-[11px] leading-relaxed text-cinnabar">
            {error}
          </p>
        )}

        {searched && !busy && !error && results.length === 0 && (
          <p className="py-8 text-center text-xs text-mist-shadow">沒有結果</p>
        )}

        {results.length > 0 && (
          <div className="space-y-1.5">
            {results.map((r, i) => (
              <div
                key={`${r.source}-${i}-${r.title}`}
                className="flex items-center gap-3 rounded-lg border border-ink-border p-2"
              >
                {r.cover ? (
                  // 靜態輸出關閉了 next/image 最佳化，直接用 img 更單純
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.cover}
                    alt=""
                    className="h-16 w-12 shrink-0 rounded object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded bg-ink-mist text-[10px] text-mist-shadow">
                    無圖
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-mist">{r.title}</p>
                  {r.subtitle && (
                    <p className="truncate text-[11px] text-mist-shadow">{r.subtitle}</p>
                  )}
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-mist-shadow">
                    <span className="rounded border border-ink-border-strong px-1">{r.source}</span>
                    {r.mainType && <span>{r.mainType}</span>}
                    {r.totalEp && <span>{r.totalEp} 集</span>}
                    {r.url && (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-mist-shadow underline-offset-2 hover:text-moon hover:underline"
                      >
                        來源頁 ↗
                      </a>
                    )}
                  </p>
                </div>

                <button
                  onClick={() => pick(r)}
                  className="shrink-0 rounded-lg border border-moon-soft/50 px-3 py-1.5 text-xs text-moon transition hover:bg-moon/10"
                >
                  加入
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
