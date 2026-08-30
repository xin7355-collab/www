'use client';

import { useState } from 'react';
import Modal from './Modal';
import { emptyItem } from '@/lib/schema';
import { fetchPlaylist, parsePlaylistId, watchUrlFor } from '@/lib/youtube';
import { MediaItem, NewMediaItem } from '@/types/media';

interface Props {
  work: MediaItem;
  youtubeKey: string;
  /** 已經在這部底下的集數，用來略過重複 */
  existing: MediaItem[];
  onAdd: (items: NewMediaItem[]) => Promise<number>;
  onOpenSettings: () => void;
  onClose: () => void;
}

/**
 * 用 YouTube 播放清單一次補齊一部作品的集數。
 *
 * 為什麼是播放清單而不是「自動搜尋每一集」：搜尋一次要 100 單位額度，
 * 一部 279 集的作品搜完等於 27,900 單位 —— 一天的額度只有 10,000。
 * 播放清單一頁只要 1 單位，整季抓完通常不到 10 單位。
 */
export default function FillEpisodesModal({
  work,
  youtubeKey,
  existing,
  onAdd,
  onOpenSettings,
  onClose,
}: Props) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const run = async () => {
    const id = parsePlaylistId(url);
    if (!id) {
      setNote('看不懂這個網址，要含 ?list=… 的播放清單網址');
      return;
    }

    setBusy(true);
    setNote('讀取播放清單…');
    try {
      const list = await fetchPlaylist(youtubeKey, id);
      if (list.length === 0) {
        setNote('這份清單是空的，或裡面的影片都被刪或設為私人了');
        return;
      }

      // 同一支影片不要重複加 —— 補第二次時只補新出的那幾集
      const have = new Set(existing.map((it) => it.watchUrl));
      const fresh = list.filter((v) => !have.has(watchUrlFor(v.id)));
      if (fresh.length === 0) {
        setNote(`這 ${list.length} 集都已經在片庫裡了`);
        return;
      }

      setNote(`加入 ${fresh.length} 集…`);
      const ok = await onAdd(
        fresh.map((v) => ({
          ...emptyItem(),
          title: v.title,
          platform: 'YouTube',
          watchUrl: watchUrlFor(v.id),
          cover: v.thumb,
          duration: v.duration ?? '',
          mainType: work.mainType,
          country: work.country,
          // 這一行就是「掛到這部底下」的意思
          parent: work.title,
        })),
      );
      setNote(
        ok === fresh.length
          ? `加了 ${ok} 集${list.length > fresh.length ? `（略過 ${list.length - fresh.length} 集重複）` : ''}`
          : `加了 ${ok} / ${fresh.length} 集，其餘失敗`,
      );
      setUrl('');
    } catch (err) {
      setNote(err instanceof Error ? err.message : '匯入失敗');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`補齊集數 — ${work.title}`} onClose={onClose}>
      <div className="space-y-3">
        {!youtubeKey ? (
          <div className="space-y-3 py-4 text-center">
            <p className="text-sm text-mist">還沒設定 YouTube 金鑰</p>
            <p className="mx-auto max-w-xs text-[11px] leading-relaxed text-mist-shadow">
              補集數是讀 YouTube 的播放清單，需要金鑰。整季抓完通常不到 10 單位額度，
              跟搜尋的 100 單位差很多。
            </p>
            <button
              onClick={onOpenSettings}
              className="rounded-lg border border-moon-soft/50 px-4 py-2 text-xs text-moon transition hover:bg-moon/10"
            >
              去設定填金鑰
            </button>
          </div>
        ) : (
          <>
            <p className="text-[11px] leading-relaxed text-mist-shadow">
              貼上這部作品的 YouTube 播放清單網址，整季會一次加進來，
              <span className="text-mist-silver">全部掛在「{work.title}」底下</span>，
              不會變成一堆散落的卡片。重複的集數會自動略過。
            </p>
            <div className="flex gap-2">
              <input
                className="field min-w-0 flex-1"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="貼上含 ?list=… 的網址"
                autoFocus
              />
              <button
                onClick={run}
                disabled={!url.trim() || busy}
                className="shrink-0 rounded-lg bg-moon px-4 text-sm font-medium text-ink-black transition hover:bg-moon-soft disabled:opacity-40"
              >
                {busy ? '處理中…' : '補齊'}
              </button>
            </div>
          </>
        )}
        {note && <p className="text-[11px] text-mist-silver">{note}</p>}
      </div>
    </Modal>
  );
}
