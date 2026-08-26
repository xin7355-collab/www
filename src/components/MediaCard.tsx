'use client';

import { useState } from 'react';
import { deriveCover, resolveWatch } from '@/lib/watchUrl';
import { MediaItem } from '@/types/media';

interface Props {
  item: MediaItem;
  gimyDomain: string;
  onPlay: (item: MediaItem) => void;
  onEdit: (item: MediaItem) => void;
  onDelete: (item: MediaItem) => void;
  onBump: (item: MediaItem, delta: number) => void;
}

const STATUS_STYLE: Record<string, string> = {
  觀看中: 'text-moon border-moon-soft/50 bg-moon/10',
  已完成: 'text-jade border-jade/40 bg-jade/10',
  棄劇: 'text-mist-shadow border-ink-border-strong',
  未觀看: 'text-star border-star-soft/50 bg-star/10',
};

export default function MediaCard({
  item,
  gimyDomain,
  onPlay,
  onEdit,
  onDelete,
  onBump,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);

  const watch = resolveWatch(item.watchUrl, item.progress, gimyDomain);
  const rating = Number(item.rating) || 0;

  const done = Number.parseInt(item.progress.replace(/[^\d]/g, ''), 10) || 0;
  const total = Number.parseInt(item.totalEp.replace(/[^\d]/g, ''), 10) || 0;
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  // 自己填的封面優先；沒填就看能不能從連結推一張出來（YouTube 等）
  const cover = item.cover || deriveCover(item.watchUrl);
  const showCover = Boolean(cover) && !coverFailed;

  return (
    <article className="star-rise group flex flex-col overflow-hidden rounded-xl border border-ink-border bg-ink-deep transition hover:border-ink-border-strong">
      {/* 封面 */}
      <button
        onClick={() => watch.kind !== 'none' && onPlay(item)}
        disabled={watch.kind === 'none'}
        className="relative block aspect-[16/10] w-full overflow-hidden bg-ink-mist disabled:cursor-default"
        aria-label={watch.kind === 'none' ? item.title : `播放 ${item.title}`}
      >
        {showCover ? (
          // 靜態輸出關閉了 next/image 最佳化，直接用 img 更單純
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            onError={() => setCoverFailed(true)}
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="font-display text-3xl text-mist-shadow">
              {item.title.slice(0, 2)}
            </span>
          </div>
        )}

        {watch.kind !== 'none' && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition group-hover:opacity-100">
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-moon/70 bg-ink-black/70 text-lg text-moon">
              {watch.icon}
            </span>
          </span>
        )}

        {item.mainType && (
          <span className="absolute left-2 top-2 rounded bg-ink-black/80 px-1.5 py-0.5 text-[10px] tracking-wider text-mist-silver">
            {item.mainType}
          </span>
        )}

        {rating > 0 && (
          <span className="absolute right-2 top-2 rounded bg-ink-black/80 px-1.5 py-0.5 text-[10px] text-moon">
            {'★'.repeat(rating)}
          </span>
        )}
      </button>

      {/* 進度條 */}
      {percent > 0 && (
        <div className="h-0.5 w-full bg-ink-mist">
          <div className="h-full bg-moon transition-all" style={{ width: `${percent}%` }} />
        </div>
      )}

      {/* 內容 */}
      <div className="flex flex-1 flex-col gap-2.5 p-3">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-left"
          title="點擊展開完整名稱"
        >
          <h3
            className={`font-display text-sm leading-snug text-mist ${
              expanded ? '' : 'line-clamp-2'
            }`}
          >
            {item.title}
          </h3>
        </button>

        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-mist-shadow">
          <span className={`rounded border px-1.5 py-0.5 ${STATUS_STYLE[item.status] ?? ''}`}>
            {item.status}
          </span>
          {item.season && <span>{item.season}</span>}
          {item.country && <span>{item.country}</span>}
          {item.platform && <span>{item.platform}</span>}
        </div>

        {/* 進度控制 */}
        <div className="mt-auto flex items-center gap-1.5">
          <button
            onClick={() => onBump(item, -1)}
            className="h-7 w-7 shrink-0 rounded border border-ink-border-strong text-mist-silver transition hover:border-moon-soft hover:text-moon"
            aria-label="減一集"
          >
            −
          </button>
          <span className="font-num flex-1 text-center text-xs text-mist">
            {done}
            {total > 0 && <span className="text-mist-shadow"> / {total}</span>}
          </span>
          <button
            onClick={() => onBump(item, 1)}
            className="h-7 w-7 shrink-0 rounded border border-ink-border-strong text-mist-silver transition hover:border-moon-soft hover:text-moon"
            aria-label="加一集"
          >
            +
          </button>
        </div>

        {/* 動作列 */}
        <div className="flex items-center gap-1.5 border-t border-ink-border pt-2">
          <button
            onClick={() => onPlay(item)}
            disabled={watch.kind === 'none'}
            className="flex-1 rounded border border-moon-soft/50 py-1 text-[11px] text-moon transition hover:bg-moon/10 disabled:cursor-not-allowed disabled:border-ink-border disabled:text-mist-shadow"
            title={watch.hint || '尚未設定觀看連結'}
          >
            {watch.kind === 'none' ? '無連結' : `${watch.icon} 開播`}
          </button>
          <button
            onClick={() => onEdit(item)}
            className="rounded border border-ink-border-strong px-2 py-1 text-[11px] text-mist-silver transition hover:text-mist"
            aria-label="編輯"
          >
            編輯
          </button>
          <button
            onClick={() => onDelete(item)}
            className="rounded border border-ink-border-strong px-2 py-1 text-[11px] text-mist-silver transition hover:border-cinnabar/60 hover:text-cinnabar"
            aria-label="刪除"
          >
            刪
          </button>
        </div>
      </div>
    </article>
  );
}
