'use client';

import { useEffect, useState } from 'react';
import Modal from './Modal';
import { searchWorks } from '@/lib/api';
import { MediaItem } from '@/types/media';
import { SearchResult } from '@/types/search';

interface Props {
  item: MediaItem;
  tmdbKey: string;
  onRename: (title: string) => void;
  onClose: () => void;
}

/**
 * 反查中文名。
 *
 * 為什麼需要：從 MangaDex、YouTube 或手動加進來的作品，標題常常是日文或英文
 * （邪風のストラ、Frieren…），一整排掃過去認不出是什麼。
 *
 * **這不是翻譯** —— 翻譯要金鑰要錢，而且機翻的作品名通常是錯的。
 * 這裡是拿現有標題去查資料庫，把人家**已經登記好的中文名**撈回來：
 * Bangumi 的 `name_cn`、TMDB 的正式繁中片名。查不到就查不到，不會亂猜。
 *
 * 搜出來的標題已經在 `searchWorks` 裡轉過繁體了，這裡不必再轉一次。
 */
export default function RenameModal({ item, tmdbKey, onRename, onClose }: Props) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [manual, setManual] = useState(item.title);

  /**
   * 一開啟就查，不用再按一次搜尋 —— 使用者點「查中文名」的當下
   * 意圖已經很明確了。這裡是呼叫外部 API 不是 setState 迴圈，
   * 相依只有開啟當下的標題與分類，不會重跑。
   */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const found = await searchWorks(item.title, item.mainType, { tmdbKey });
        if (!alive) return;
        // 跟現在一模一樣的沒有意義，不要佔位置
        setResults(found.filter((r) => r.title && r.title !== item.title).slice(0, 8));
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : '查不到');
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [item.title, item.mainType, tmdbKey]);

  return (
    <Modal title="查中文名" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <p className="mb-1 text-[11px] text-mist-shadow">目前的名稱</p>
          <p className="font-display text-sm text-mist">{item.title}</p>
        </div>

        <div className="border-t border-ink-border pt-3">
          <p className="mb-2 text-[11px] leading-relaxed text-mist-shadow">
            這是拿現有名稱去 Bangumi 與 TMDB 查<span className="text-mist-silver">人家登記好的中文名</span>，
            不是機器翻譯 —— 查不到就是查不到，不會亂編一個給你。
          </p>

          {busy && <p className="py-6 text-center text-xs text-mist-shadow">查詢中…</p>}

          {error && (
            <p className="rounded-lg border border-cinnabar/40 bg-cinnabar/10 px-3 py-2 text-[11px] leading-relaxed text-cinnabar">
              {error}
            </p>
          )}

          {!busy && !error && results.length === 0 && (
            <p className="py-6 text-center text-xs text-mist-shadow">
              沒查到別的名稱，可以在下面自己改
            </p>
          )}

          <div className="space-y-1.5">
            {results.map((r, i) => (
              <button
                key={`${r.source}-${i}`}
                onClick={() => onRename(r.title)}
                className="flex w-full items-center gap-2.5 rounded-lg border border-ink-border p-2 text-left transition hover:border-moon-soft"
              >
                {r.cover && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.cover} alt="" className="h-12 w-9 shrink-0 rounded object-cover" loading="lazy" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-mist">{r.title}</span>
                  {r.subtitle && (
                    <span className="block truncate text-[11px] text-mist-shadow">{r.subtitle}</span>
                  )}
                </span>
                <span className="shrink-0 rounded border border-ink-border-strong px-1 text-[10px] text-mist-shadow">
                  {r.source}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-ink-border pt-3">
          <p className="mb-1.5 text-[11px] text-mist-shadow">或直接改成</p>
          <div className="flex gap-2">
            <input
              className="field min-w-0 flex-1"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
            />
            <button
              onClick={() => onRename(manual.trim())}
              disabled={!manual.trim() || manual.trim() === item.title}
              className="shrink-0 rounded-lg bg-moon px-4 text-sm font-medium text-ink-black transition hover:bg-moon-soft disabled:cursor-not-allowed disabled:opacity-40"
            >
              改名
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
