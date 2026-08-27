'use client';

import { useState } from 'react';
import {
  fetchPlaylist,
  parsePlaylistId,
  searchVideos,
  watchUrlFor,
  withDurations,
  YouTubeVideo,
} from '@/lib/youtube';
import { emptyItem } from '@/lib/schema';
import { NewMediaItem } from '@/types/media';

interface Props {
  apiKey: string;
  /** 直接寫進片庫，回傳實際成功筆數。單支與整份清單共用同一條路 */
  onAdd: (items: NewMediaItem[]) => Promise<number>;
  onOpenSettings: () => void;
}

function toItem(video: YouTubeVideo): NewMediaItem {
  return {
    ...emptyItem(),
    title: video.title,
    platform: 'YouTube',
    watchUrl: watchUrlFor(video.id),
    cover: video.thumb,
    note: video.channel ? `頻道：${video.channel}` : '',
  };
}

/**
 * 直接搜 YouTube 挑片。
 *
 * 跟「搜尋作品資料」的差別：那邊查的是作品本身的名稱與集數，
 * 這裡查的是**實際能播的影片**，所以加入時連觀看連結一起帶進去。
 */
export default function YouTubeSearch({ apiKey, onAdd, onOpenSettings }: Props) {
  const [q, setQ] = useState('');
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [tokens, setTokens] = useState<{ next?: string; prev?: string }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [playlist, setPlaylist] = useState('');
  const [note, setNote] = useState('');
  /** 這次搜尋已經加進片庫的影片 id，避免重複按 */
  const [added, setAdded] = useState<string[]>([]);
  const [adding, setAdding] = useState('');

  const run = async (pageToken = '') => {
    const keyword = q.trim();
    if (!keyword) return;

    setBusy(true);
    setError('');
    setAdded([]);
    try {
      const page = await searchVideos(apiKey, keyword, pageToken);
      setTokens({ next: page.nextPageToken, prev: page.prevPageToken });
      // 先把結果放上來，長度慢一步補 —— 不要為了秒數讓整頁等
      setVideos(page.items);
      setVideos(await withDurations(apiKey, page.items));
    } catch (err) {
      setVideos([]);
      setError(err instanceof Error ? err.message : 'YouTube 搜尋失敗');
    } finally {
      setBusy(false);
      setSearched(true);
    }
  };

  const importPlaylist = async () => {
    const id = parsePlaylistId(playlist);
    if (!id) {
      setNote('看不懂這個播放清單網址，要含 ?list=… 的那種');
      return;
    }

    setBusy(true);
    setNote('讀取播放清單…');
    setError('');
    try {
      const list = await fetchPlaylist(apiKey, id);
      if (list.length === 0) {
        setNote('這份清單是空的，或裡面的影片都被刪除／設為私人了');
        return;
      }
      setNote(`匯入 ${list.length} 支影片…`);
      const ok = await onAdd(list.map(toItem));
      setNote(ok === list.length ? `匯入了 ${ok} 支` : `匯入了 ${ok} / ${list.length} 支，其餘失敗`);
      setPlaylist('');
    } catch (err) {
      setNote('');
      setError(err instanceof Error ? err.message : '播放清單匯入失敗');
    } finally {
      setBusy(false);
    }
  };

  if (!apiKey) {
    return (
      <div className="space-y-3 py-6 text-center">
        <p className="text-sm text-mist">還沒設定 YouTube 金鑰</p>
        <p className="mx-auto max-w-xs text-[11px] leading-relaxed text-mist-shadow">
          填了之後就能在這裡直接搜 YouTube、看縮圖挑片，一鍵加進片庫，
          連觀看連結都自動填好。免費額度每天約 100 次搜尋。
        </p>
        <button
          onClick={onOpenSettings}
          className="rounded-lg border border-moon-soft/50 px-4 py-2 text-xs text-moon transition hover:bg-moon/10"
        >
          去設定填金鑰
        </button>
      </div>
    );
  }

  return (
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
          placeholder="搜尋 YouTube 影片…"
          autoFocus
        />
        <button
          type="submit"
          disabled={!q.trim() || busy}
          className="shrink-0 rounded-lg bg-moon px-4 text-sm font-medium text-ink-black transition hover:bg-moon-soft disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? '搜尋中…' : '搜尋'}
        </button>
      </form>

      {error && (
        <p className="rounded-lg border border-cinnabar/40 bg-cinnabar/10 px-3 py-2 text-[11px] leading-relaxed text-cinnabar">
          {error}
        </p>
      )}

      {searched && !busy && !error && videos.length === 0 && (
        <p className="py-6 text-center text-xs text-mist-shadow">沒有結果</p>
      )}

      {videos.length > 0 && (
        <>
          <div className="space-y-1.5">
            {videos.map((video) => (
              <div
                key={video.id}
                className="flex items-center gap-3 rounded-lg border border-ink-border p-2"
              >
                <div className="relative shrink-0">
                  {/* 靜態輸出關閉了 next/image 最佳化，直接用 img 更單純 */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={video.thumb}
                    alt=""
                    className="h-14 w-24 rounded object-cover"
                    loading="lazy"
                  />
                  {video.duration && (
                    <span className="absolute bottom-0.5 right-0.5 rounded bg-ink-black/85 px-1 text-[10px] text-mist">
                      {video.duration}
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-xs leading-snug text-mist">{video.title}</p>
                  <p className="mt-0.5 truncate text-[10px] text-mist-shadow">
                    {[video.channel, video.publishedAt].filter(Boolean).join(' · ')}
                  </p>
                </div>

                {added.includes(video.id) ? (
                  <span className="shrink-0 rounded-lg border border-jade/40 px-3 py-1.5 text-xs text-jade">
                    ✓ 已加入
                  </span>
                ) : (
                  <button
                    onClick={async () => {
                      setAdding(video.id);
                      try {
                        if ((await onAdd([toItem(video)])) > 0) {
                          setAdded((prev) => [...prev, video.id]);
                        }
                      } finally {
                        setAdding('');
                      }
                    }}
                    disabled={Boolean(adding)}
                    className="shrink-0 rounded-lg border border-moon-soft/50 px-3 py-1.5 text-xs text-moon transition hover:bg-moon/10 disabled:opacity-40"
                  >
                    {adding === video.id ? '加入中…' : '加入'}
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => run(tokens.prev)}
              disabled={!tokens.prev || busy}
              className="rounded-lg border border-ink-border-strong px-3 py-1.5 text-xs text-mist-silver transition hover:text-mist disabled:opacity-30"
            >
              ← 上一頁
            </button>
            <button
              onClick={() => run(tokens.next)}
              disabled={!tokens.next || busy}
              className="rounded-lg border border-ink-border-strong px-3 py-1.5 text-xs text-mist-silver transition hover:text-mist disabled:opacity-30"
            >
              下一頁 →
            </button>
            <span className="ml-auto text-[10px] text-mist-shadow">
              一次搜尋約用掉 100 單位額度
            </span>
          </div>
        </>
      )}

      <div className="border-t border-ink-border pt-3">
        <p className="mb-1.5 text-[11px] leading-relaxed text-mist-shadow">
          整份播放清單匯入（每頁只花 1 單位額度，上限 200 支）
        </p>
        <div className="flex gap-2">
          <input
            className="field min-w-0 flex-1"
            value={playlist}
            onChange={(e) => setPlaylist(e.target.value)}
            placeholder="貼上含 ?list=… 的網址"
          />
          <button
            onClick={importPlaylist}
            disabled={!playlist.trim() || busy}
            className="shrink-0 rounded-lg border border-ink-border-strong px-3 text-xs text-mist-silver transition hover:border-moon-soft hover:text-moon disabled:opacity-40"
          >
            匯入
          </button>
        </div>
        {note && <p className="mt-1.5 text-[11px] text-mist-silver">{note}</p>}
      </div>
    </div>
  );
}
