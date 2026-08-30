'use client';

import Modal from './Modal';
import { deriveCover, resolveWatch, watchUrlOf } from '@/lib/watchUrl';
import { MediaItem } from '@/types/media';

interface Props {
  work: MediaItem;
  episodes: MediaItem[];
  gimyDomain: string;
  onPlay: (item: MediaItem) => void;
  onEdit: (item: MediaItem) => void;
  onClose: () => void;
}

/**
 * 一部作品底下的分集清單。
 *
 * 為什麼要有這一層：一份 279 集的播放清單如果每集都變成一張卡片，
 * 片庫就毀了。分集歸到作品底下，網格上只留一張，點進來才看到各集。
 */
export default function EpisodesModal({
  work,
  episodes,
  gimyDomain,
  onPlay,
  onEdit,
  onClose,
}: Props) {
  const done = Number.parseInt(work.progress.replace(/[^\d]/g, ''), 10) || 0;

  return (
    <Modal title={work.title} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-[11px] text-mist-shadow">
          共 {episodes.length} 集 ・ 目前進度 {done}
        </p>

        <div className="space-y-1.5">
          {episodes.map((ep, i) => {
            const watch = resolveWatch(watchUrlOf(ep), ep.progress, gimyDomain);
            const cover = ep.cover || deriveCover(ep.watchUrl);
            // 已經看過的集數壓暗，一眼看得出追到哪
            const watched = i + 1 <= done;

            return (
              <div
                key={ep.rowNumber}
                className={`flex items-center gap-2.5 rounded-lg border border-ink-border p-2 transition ${
                  watched ? 'opacity-50' : ''
                }`}
              >
                <span className="font-num w-8 shrink-0 text-center text-[11px] text-mist-shadow">
                  {i + 1}
                </span>

                <button
                  onClick={() => watch.kind !== 'none' && onPlay(ep)}
                  disabled={watch.kind === 'none'}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:cursor-default"
                >
                  {cover ? (
                    // 靜態輸出關閉了 next/image 最佳化，直接用 img 更單純
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover} alt="" className="h-10 w-16 shrink-0 rounded object-cover" loading="lazy" />
                  ) : (
                    <span className="h-10 w-16 shrink-0 rounded bg-ink-mist" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-xs leading-snug text-mist">{ep.title}</span>
                    {ep.duration && (
                      <span className="font-num mt-0.5 block text-[10px] text-mist-shadow">
                        {ep.duration}
                      </span>
                    )}
                  </span>
                </button>

                <button
                  onClick={() => onEdit(ep)}
                  className="shrink-0 rounded border border-ink-border-strong px-2 py-1 text-[10px] text-mist-silver transition hover:text-mist"
                >
                  編輯
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
