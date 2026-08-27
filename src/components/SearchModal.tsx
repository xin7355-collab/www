'use client';

import { useState } from 'react';
import Modal from './Modal';
import YouTubeSearch from './YouTubeSearch';
import { searchWorks } from '@/lib/api';
import { resolveVideoUrl } from '@/lib/archive';
import { emptyItem } from '@/lib/schema';
import { forgetSearch, rememberSearch, useSearchHistory } from '@/lib/searchHistory';
import { fetchEpisodeCount, fetchWatchProviders } from '@/lib/tmdb';
import { MAIN_TYPES, NewMediaItem } from '@/types/media';
import { SearchResult } from '@/types/search';

interface Props {
  /** 直接寫進片庫，回傳實際成功筆數。單筆與批次共用同一條路 */
  onAdd: (items: NewMediaItem[]) => Promise<number>;
  onClose: () => void;
  youtubeKey: string;
  tmdbKey: string;
  onOpenSettings: () => void;
}

/**
 * 結果的識別鍵。不能只用 url —— 同一部作品在不同來源會給同一個來源頁，
 * 而 Bangumi 的搜尋偶爾也會回重複條目，只用 url 會一起被勾選。
 */
const resultKey = (r: SearchResult) => `${r.source}::${r.url}::${r.title}`;

/** 可搜尋的分類 —— 綜藝沒有合適的公開資料來源，不放進來假裝有 */
const KINDS = ['電影', '影集', '動漫', '漫畫', '小說'] as const;

/**
 * 站內搜尋作品資料。
 *
 * 後端問的是不需要 API key 的公開來源，所以查到的是**作品資料**
 * （名稱、封面、集數），不是觀看連結 —— 連結還是要你自己貼，
 * 因為每個人能看的平台不一樣。
 */
export default function SearchModal({
  onAdd,
  onClose,
  youtubeKey,
  tmdbKey,
  onOpenSettings,
}: Props) {
  /**
   * 兩種搜尋解決的是不同問題：
   * 「作品資料」查的是作品本身（名稱、封面、集數），不含能播的連結；
   * 「YouTube」查的是實際的影片，加入時連觀看連結一起帶進去。
   */
  const [tab, setTab] = useState<'works' | 'youtube'>('works');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  /** 正在補查資料的那一筆（用 url 當識別），避免連點兩次 */
  const [picking, setPicking] = useState('');
  /** 已經勾選、以及已經加進片庫的（都用 resultKey 當識別） */
  const [chosen, setChosen] = useState<string[]>([]);
  const [added, setAdded] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const recent = useSearchHistory();

  /** @param override 從「最近搜尋」點進來的關鍵字；setQ 是非同步的，不能等它 */
  const run = async (override?: string) => {
    const keyword = (override ?? q).trim();
    if (!keyword) return;

    setBusy(true);
    setError('');
    setNote('');
    // 換一批結果，上一批的勾選與「已加入」標記就沒有意義了
    setChosen([]);
    setAdded([]);
    rememberSearch(keyword);
    try {
      const found = await searchWorks(keyword, kind, { tmdbKey });
      setResults(found);
      // 上架平台每部要各問一次，所以先把結果放上來再補 ——
      // 不要為了這個讓整頁多等好幾秒
      void hydrateProviders(found);
    } catch (err) {
      setResults([]);
      setError(err instanceof Error ? err.message : '搜尋失敗');
    } finally {
      setBusy(false);
      setSearched(true);
    }
  };

  /** 補上台灣的上架平台。只有 TMDB 的結果查得到，失敗就當作沒有，不打擾使用者 */
  const hydrateProviders = async (list: SearchResult[]) => {
    if (!tmdbKey) return;
    const targets = list.filter((r) => r.tmdbId && r.mediaType);
    if (targets.length === 0) return;

    const settled = await Promise.allSettled(
      targets.map((r) => fetchWatchProviders(tmdbKey, r.mediaType!, r.tmdbId!)),
    );

    const byId = new Map<number, { providers: string[]; link: string }>();
    settled.forEach((outcome, i) => {
      if (outcome.status !== 'fulfilled' || !outcome.value) return;
      byId.set(targets[i].tmdbId!, {
        providers: outcome.value.flatrate,
        link: outcome.value.link,
      });
    });
    if (byId.size === 0) return;

    setResults((prev) =>
      prev.map((r) => {
        const found = r.tmdbId ? byId.get(r.tmdbId) : undefined;
        return found ? { ...r, providers: found.providers, providerLink: found.link } : r;
      }),
    );
  };

  /**
   * 把一筆搜尋結果補成完整的片庫項目。
   *
   * 兩件事只在真的要加入時才查，不是每筆結果都查 —— 一次搜尋十筆，
   * 全查等於十倍的 API 呼叫，而使用者通常只加其中一兩筆。
   */
  const buildItem = async (r: SearchResult): Promise<NewMediaItem> => {
    let totalEp = r.totalEp;
    if (!totalEp && tmdbKey && r.tmdbId && r.mediaType === 'tv') {
      try {
        totalEp = await fetchEpisodeCount(tmdbKey, r.tmdbId);
      } catch {
        // 查不到就留空，使用者自己填
      }
    }

    // Internet Archive：把詳情頁換成影片直鏈，這樣站內播得起來又能記進度
    let watchUrl = r.watchUrl ?? '';
    if (r.archiveId) {
      try {
        watchUrl = await resolveVideoUrl(r.archiveId);
      } catch {
        // 找不到影片檔就維持詳情頁，至少連結不會壞
      }
    }

    // 小說與漫畫沒有「可播的連結」，但總得有個地方點得進去。
    // 退而求其次用來源頁 —— 至少卡片不會是一顆按不下去的「無連結」，
    // 之後找到真正在看的站再自己換掉。
    if (!watchUrl && r.url) watchUrl = r.url;

    return {
      ...emptyItem(),
      title: r.title,
      cover: r.cover,
      totalEp,
      mainType: MAIN_TYPES.includes(r.mainType as (typeof MAIN_TYPES)[number]) ? r.mainType : '',
      country: r.country,
      watchUrl,
      note: r.url ? `資料來源：${r.url}` : '',
    };
  };

  /**
   * 加入單筆。**直接寫進片庫，不開表單** —— 十筆裡有九筆是照抄搜尋結果，
   * 為了那一筆要改的每次都跳表單並不划算。要改細節從卡片的「編輯」進去。
   */
  const pick = async (r: SearchResult) => {
    const id = resultKey(r);
    setPicking(id);
    setError('');
    try {
      const ok = await onAdd([await buildItem(r)]);
      if (ok > 0) {
        setAdded((prev) => [...prev, id]);
        setChosen((prev) => prev.filter((x) => x !== id));
      }
    } finally {
      setPicking('');
    }
  };

  /** 一次加入所有勾選的。逐筆送是 addMany 的要求（列號會互相踩） */
  const addChecked = async () => {
    const targets = results.filter((r) => chosen.includes(resultKey(r)));
    if (targets.length === 0) return;

    setPicking('__batch__');
    setError('');
    setNote(`處理中…（${targets.length} 筆）`);
    try {
      const items = await Promise.all(targets.map(buildItem));
      const ok = await onAdd(items);
      setAdded((prev) => [...prev, ...targets.slice(0, ok).map(resultKey)]);
      setChosen([]);
      setNote(ok === targets.length ? `已加入 ${ok} 筆` : `已加入 ${ok} / ${targets.length} 筆，其餘失敗`);
    } finally {
      setPicking('');
    }
  };

  const toggle = (id: string) =>
    setChosen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const selectable = results.filter((r) => !added.includes(resultKey(r)));
  const allChosen = selectable.length > 0 && selectable.every((r) => chosen.includes(resultKey(r)));

  return (
    <Modal title="搜尋" onClose={onClose}>
      <div className="mb-4 flex gap-1.5">
        {([
          ['works', '作品資料'],
          ['youtube', 'YouTube 影片'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              tab === value
                ? 'border-moon-soft bg-moon/10 text-moon'
                : 'border-ink-border text-mist-silver hover:border-moon-soft hover:text-moon'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'youtube' ? (
        <YouTubeSearch apiKey={youtubeKey} onAdd={onAdd} onOpenSettings={onOpenSettings} />
      ) : (
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

        {recent.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-mist-shadow">最近搜尋</span>
            {recent.map((word) => (
              <span
                key={word}
                className="group flex items-center rounded-full border border-ink-border text-[11px] text-mist-silver transition hover:border-moon-soft"
              >
                <button
                  onClick={() => {
                    setQ(word);
                    void run(word);
                  }}
                  className="py-0.5 pl-2.5 pr-1 transition hover:text-moon"
                >
                  {word}
                </button>
                <button
                  onClick={() => forgetSearch(word)}
                  className="py-0.5 pr-2 pl-0.5 text-mist-shadow transition hover:text-cinnabar"
                  aria-label={`忘掉「${word}」`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-mist-shadow">
          查到的是作品資料（名稱、封面、集數），
          <span className="text-mist-silver">通常不含觀看連結</span> ——
          每個人能看的平台不一樣。沒有連結的會先指到來源頁，之後可以自己換掉。
        </p>

        {error && (
          <p className="rounded-lg border border-cinnabar/40 bg-cinnabar/10 px-3 py-2 text-[11px] leading-relaxed text-cinnabar">
            {error}
          </p>
        )}

        {searched && !busy && !error && results.length === 0 && (
          <p className="py-8 text-center text-xs text-mist-shadow">沒有結果</p>
        )}

        {note && <p className="text-[11px] text-mist-silver">{note}</p>}

        {selectable.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-ink-border bg-ink-deep/60 px-2.5 py-2">
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-mist-silver">
              <input
                type="checkbox"
                checked={allChosen}
                onChange={() => setChosen(allChosen ? [] : selectable.map(resultKey))}
                className="accent-[var(--moon-gold)]"
              />
              全選
            </label>
            <span className="text-[11px] text-mist-shadow">已勾 {chosen.length} 筆</span>
            <button
              onClick={addChecked}
              disabled={chosen.length === 0 || Boolean(picking)}
              className="ml-auto rounded-lg bg-moon px-3 py-1 text-xs font-medium text-ink-black transition hover:bg-moon-soft disabled:cursor-not-allowed disabled:opacity-40"
            >
              {picking === '__batch__' ? '加入中…' : `加入勾選的 ${chosen.length} 筆`}
            </button>
          </div>
        )}

        {results.length > 0 && (
          <div className="space-y-1.5">
            {results.map((r, i) => {
              const id = resultKey(r);
              const isAdded = added.includes(id);
              return (
              <div
                key={`${id}-${i}`}
                className={`flex items-center gap-3 rounded-lg border p-2 transition ${
                  isAdded
                    ? 'border-jade/40 bg-jade/5'
                    : chosen.includes(id)
                      ? 'border-moon-soft/60 bg-moon/5'
                      : 'border-ink-border'
                }`}
              >
                <input
                  type="checkbox"
                  checked={chosen.includes(id)}
                  onChange={() => toggle(id)}
                  disabled={isAdded}
                  className="shrink-0 accent-[var(--moon-gold)] disabled:opacity-30"
                  aria-label={`勾選 ${r.title}`}
                />
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
                    {r.archiveId && (
                      <span className="rounded border border-jade/40 px-1 text-jade">
                        可站內播・記進度
                      </span>
                    )}
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

                  {r.providers && r.providers.length > 0 && (
                    <p className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
                      <span className="text-mist-shadow">台灣可看</span>
                      {r.providers.slice(0, 4).map((name) => (
                        <span
                          key={name}
                          className="rounded border border-jade/40 px-1 text-jade"
                        >
                          {name}
                        </span>
                      ))}
                      {/* TMDB 條款要求標示 JustWatch 出處，這個連結不可以拿掉 */}
                      {r.providerLink && (
                        <a
                          href={r.providerLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-mist-shadow underline-offset-2 hover:text-moon hover:underline"
                        >
                          JustWatch ↗
                        </a>
                      )}
                    </p>
                  )}
                </div>

                {isAdded ? (
                  <span className="shrink-0 rounded-lg border border-jade/40 px-3 py-1.5 text-xs text-jade">
                    ✓ 已加入
                  </span>
                ) : (
                  <button
                    onClick={() => pick(r)}
                    disabled={Boolean(picking)}
                    className="shrink-0 rounded-lg border border-moon-soft/50 px-3 py-1.5 text-xs text-moon transition hover:bg-moon/10 disabled:opacity-40"
                  >
                    {picking === id ? '處理中…' : '加入'}
                  </button>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>
      )}
    </Modal>
  );
}
