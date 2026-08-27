'use client';

import { useState } from 'react';
import { HistoryEntry } from '@/lib/history';
import { episodesBehind, scheduleFrom } from '@/lib/schedule';
import { deriveCover, resolveWatch, watchUrlOf } from '@/lib/watchUrl';
import { MediaItem } from '@/types/media';

interface Props {
  item: MediaItem;
  gimyDomain: string;
  /** 這部的觀看紀錄，沒看過就是 undefined */
  history?: HistoryEntry;
  onPlay: (item: MediaItem) => void;
  onEdit: (item: MediaItem) => void;
  onDelete: (item: MediaItem) => void;
  /** 直接把進度設成某個數字（點數字輸入用） */
  onSetProgress: (item: MediaItem, value: number) => void;
  /** 拿目前標題去反查中文名 */
  onFindName: (item: MediaItem) => void;
  /** 小說漫畫：帶去各平台找哪裡看得到 */
  onWhereToRead: (item: MediaItem) => void;
  /** 批次選取模式：點封面變成勾選而不是開播 */
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (item: MediaItem) => void;
}

/**
 * 片庫卡片。
 *
 * 設計取向是**封面優先**：一整排掃過去時真正在辨識的是圖，不是那些小標籤。
 * 所以卡片只留封面、標題、進度，其餘全部收起來：
 * - 「開播」不做成按鈕，**點封面就是開播**（十次操作有九次是這個）
 * - 編輯／刪除／查中文名收進封面右上的 ⋯，平常不佔位置
 * - 狀態、季別、國家、平台這些原本各佔一列的標籤拿掉了 ——
 *   狀態上方本來就有篩選器，其餘在編輯表單裡看得到，不值得每張卡都佔一行
 * - 「落後幾集」是追連載時唯一想知道的，收成封面上的一顆小標籤而不是一行字
 *
 * 卡片**只有一張封面的高度**：標題與進度疊在封面底部的漸層上，
 * 而不是排在圖片下面。改版前圖片下面還有標題、進度、提示三段，
 * 手機兩欄下每張卡都變成一座高塔。
 */
export default function MediaCard({
  item,
  gimyDomain,
  history,
  onPlay,
  onEdit,
  onDelete,
  onSetProgress,
  onFindName,
  onWhereToRead,
  selectMode = false,
  selected = false,
  onToggleSelect,
}: Props) {
  const [coverFailed, setCoverFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  /** 不是 null 就代表正在直接輸入集數 */
  const [draft, setDraft] = useState<string | null>(null);

  /**
   * 負數列號代表這筆還在送往後端的路上（見 useLibrary 的樂觀新增）。
   * 編輯、刪除、改進度都要靠列號定位，真列號回來之前先鎖住，
   * 否則會寫到隔壁那部作品身上。
   */
  const pending = item.rowNumber < 0;

  const watch = resolveWatch(watchUrlOf(item), item.progress, gimyDomain);
  const playable = watch.kind !== 'none';

  const done = Number.parseInt(item.progress.replace(/[^\d]/g, ''), 10) || 0;

  /**
   * 分母優先用「已播集數」：追連載時想知道的是離最新一集差幾集，
   * 而不是離完結差幾集。沒綁排程才退回自己填的總集數。
   */
  const schedule = scheduleFrom(item);
  const aired = schedule?.aired ?? 0;
  const total = aired > 0 ? aired : Number.parseInt(item.totalEp.replace(/[^\d]/g, ''), 10) || 0;
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const behind = episodesBehind(item);

  // 自己填的封面優先；沒填就看能不能從連結推一張出來（YouTube 等）
  const cover = item.cover || deriveCover(item.watchUrl);
  const showCover = Boolean(cover) && !coverFailed;

  // 影片播到幾分幾秒（只有直鏈量得到）
  const watchedRatio =
    history && history.duration > 0 ? Math.min(1, history.position / history.duration) : 0;

  const commitDraft = () => {
    if (draft === null) return;
    const value = Number.parseInt(draft.replace(/[^\d]/g, ''), 10);
    if (Number.isFinite(value) && value !== done) onSetProgress(item, Math.max(0, value));
    setDraft(null);
  };

  return (
    <article
      className={`star-rise group relative aspect-[16/10] overflow-hidden rounded-xl border bg-ink-deep transition ${
        selected ? 'border-moon' : 'border-ink-border hover:border-ink-border-strong'
      }`}
    >
      {/* 整張卡就是開播鍵 —— 這是最常做的事，不該藏在一顆小按鈕裡 */}
      <button
        onClick={() => (selectMode ? onToggleSelect?.(item) : playable && onPlay(item))}
        disabled={pending || (!selectMode && !playable)}
        className="absolute inset-0 block h-full w-full overflow-hidden bg-ink-mist disabled:cursor-default"
        title={selectMode ? '點一下選取' : watch.hint || '尚未設定觀看連結'}
        aria-label={selectMode ? `選取 ${item.title}` : playable ? `播放 ${item.title}` : item.title}
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
            <span className="font-display text-3xl text-mist-shadow">{item.title.slice(0, 2)}</span>
          </div>
        )}
      </button>

      {/* 標題與進度疊在封面上而不是排在下面 —— 卡片就只有一張圖的高度 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-black via-ink-black/85 to-transparent px-2.5 pb-2 pt-6">
        <h3 className="font-display line-clamp-2 text-xs leading-snug text-mist" title={item.title}>
          {item.title}
        </h3>

        <div className="mt-1">
          {draft !== null ? (
            <input
              className="font-num pointer-events-auto h-6 w-full rounded border border-moon-soft bg-ink-black/90 text-center text-[11px] text-mist outline-none"
              value={draft}
              autoFocus
              inputMode="numeric"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitDraft}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitDraft();
                if (e.key === 'Escape') setDraft(null);
              }}
              aria-label="直接輸入集數"
            />
          ) : (
            // 從 0 追到第 138 話用按的要按一百多次，點數字直接輸入才實際
            <button
              onClick={() => setDraft(String(done))}
              disabled={pending}
              className="font-num pointer-events-auto rounded px-1 text-[11px] text-mist-silver transition hover:bg-ink-mist hover:text-mist disabled:opacity-50"
              title="點一下直接輸入集數"
            >
              {done}
              {total > 0 && (
                <span className={aired > 0 ? 'text-moon-soft' : 'text-mist-shadow'}> / {total}</span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* 集數進度條，貼在卡片最底 */}
      {percent > 0 && (
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-ink-black/60">
          <div className="h-full bg-moon" style={{ width: `${percent}%` }} />
        </div>
      )}

      {/* 影片播到哪（只有直鏈量得到） */}
      {watchedRatio > 0 && (
        <span className="absolute inset-x-0 bottom-0.5 h-0.5 bg-ink-black/60">
          <span
            className="block h-full bg-cinnabar"
            style={{ width: `${Math.round(watchedRatio * 100)}%` }}
          />
        </span>
      )}

      {playable && !selectMode && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition group-hover:opacity-100">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-moon/70 bg-ink-black/70 text-lg text-moon">
            {watch.icon}
          </span>
        </span>
      )}

      <span className="pointer-events-none absolute left-2 top-2 flex items-center gap-1">
        {item.mainType && (
          <span className="rounded bg-ink-black/80 px-1.5 py-0.5 text-[10px] tracking-wider text-mist-silver">
            {item.mainType}
          </span>
        )}
        {/* 落後幾集本來是底下的一行字，收成一顆小標籤 —— 這是追連載時唯一想知道的 */}
        {behind > 0 && (
          <span className="rounded bg-moon/90 px-1.5 py-0.5 text-[10px] font-medium text-ink-black">
            落後 {behind}
          </span>
        )}
        {!playable && (
          <span className="rounded bg-ink-black/80 px-1.5 py-0.5 text-[10px] text-mist-shadow">
            無連結
          </span>
        )}
      </span>

      {pending ? (
        <span className="absolute right-1.5 top-1.5 z-20 rounded-full bg-ink-black/80 px-2 py-1 text-[10px] text-mist-shadow">
          加入中
        </span>
      ) : selectMode ? (
        <span
          className={`pointer-events-none absolute right-1.5 top-1.5 z-20 flex h-7 w-7 items-center justify-center rounded-full text-sm ${
            selected ? 'bg-moon text-ink-black' : 'bg-ink-black/70 text-mist-shadow'
          }`}
          aria-hidden
        >
          ✓
        </span>
      ) : (
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="absolute right-1.5 top-1.5 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-ink-black/70 text-mist-silver transition hover:bg-ink-black/90 hover:text-moon"
          aria-label="更多操作"
        >
          ⋯
        </button>
      )}

      {menuOpen && (
        <>
          {/* 點旁邊關掉 —— 手機沒有「滑鼠移開」這回事 */}
          <button
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => setMenuOpen(false)}
            aria-label="關閉選單"
          />
          <div className="absolute right-1.5 top-9 z-30 w-32 overflow-hidden rounded-lg border border-ink-border-strong bg-ink-deep shadow-lg">
            {[
              { label: '編輯', run: () => onEdit(item), danger: false, show: true },
              { label: '查中文名', run: () => onFindName(item), danger: false, show: true },
              // 只有小說漫畫需要 —— 影劇的連結本來就是能播的那一個
              {
                label: '去哪裡看',
                run: () => onWhereToRead(item),
                danger: false,
                show: item.mainType === '小說' || item.mainType === '漫畫',
              },
              { label: '刪除', run: () => onDelete(item), danger: true, show: true },
            ]
              .filter((a) => a.show)
              .map((action) => (
                <button
                  key={action.label}
                  onClick={() => {
                    setMenuOpen(false);
                    action.run();
                  }}
                  className={`block w-full px-3 py-2 text-left text-xs transition hover:bg-ink-mist ${
                    action.danger ? 'text-cinnabar' : 'text-mist-silver hover:text-mist'
                  }`}
                >
                  {action.label}
                </button>
              ))}
          </div>
        </>
      )}
    </article>
  );
}
