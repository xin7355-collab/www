'use client';

import { useState } from 'react';
import { formatAgo, formatClock, HistoryEntry } from '@/lib/history';
import { episodesBehind, formatAirdate, scheduleFrom } from '@/lib/schedule';
import { deriveCover, resolveWatch, watchUrlOf } from '@/lib/watchUrl';
import { MediaItem } from '@/types/media';

interface Props {
  item: MediaItem;
  gimyDomain: string;
  /** 這部的觀看紀錄，沒看過就是 undefined */
  history?: HistoryEntry;
  /** 由上層一次算好的「現在」，避免每張卡各自呼叫 Date.now */
  now: number;
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
 *
 * 改版前是「封面 + 六個堆疊區塊」，手機兩欄下每張卡都變成一座高塔。
 */
export default function MediaCard({
  item,
  gimyDomain,
  history,
  now,
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
  const rating = Number(item.rating) || 0;

  const done = Number.parseInt(item.progress.replace(/[^\d]/g, ''), 10) || 0;

  /**
   * 分母優先用「已播集數」：追連載時想知道的是離最新一集差幾集，
   * 而不是離完結差幾集。沒綁排程才退回自己填的總集數。
   */
  const schedule = scheduleFrom(item);
  const aired = schedule?.aired ?? 0;
  const total = aired > 0 ? aired : Number.parseInt(item.totalEp.replace(/[^\d]/g, ''), 10) || 0;
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const caughtUp = aired > 0 && done >= aired;
  const behind = episodesBehind(item);
  const next = schedule?.nextDate ?? '';

  // 自己填的封面優先；沒填就看能不能從連結推一張出來（YouTube 等）
  const cover = item.cover || deriveCover(item.watchUrl);
  const showCover = Boolean(cover) && !coverFailed;

  // 看到幾分幾秒（只有直鏈量得到）與上次觀看時間
  const watchedRatio =
    history && history.duration > 0 ? Math.min(1, history.position / history.duration) : 0;
  const ago = history ? formatAgo(history.at, now) : '';

  const commitDraft = () => {
    if (draft === null) return;
    const value = Number.parseInt(draft.replace(/[^\d]/g, ''), 10);
    if (Number.isFinite(value) && value !== done) onSetProgress(item, Math.max(0, value));
    setDraft(null);
  };

  /**
   * 卡片底下那一行小字。**一次只講一件事** —— 全部排出來就回到改版前
   * 那種密密麻麻的樣子了，所以照重要性挑：落後幾集 > 下一集 > 上次看到哪。
   */
  const hint = (() => {
    if (behind > 0) return <span className="text-moon">落後 {behind} 集</span>;
    if (next) {
      return (
        <span>
          下一集 <span className="text-moon">{formatAirdate(next)}</span>
        </span>
      );
    }
    if (caughtUp) return <span className="text-jade">已追上最新</span>;
    if (history && history.position > 5) {
      return <span className="text-cinnabar/80">看到 {formatClock(history.position)}</span>;
    }
    return ago ? <span>{ago}看過</span> : null;
  })();

  return (
    <article
      className={`star-rise group relative flex flex-col overflow-hidden rounded-xl border bg-ink-deep transition ${
        selected ? 'border-moon' : 'border-ink-border hover:border-ink-border-strong'
      }`}
    >
      {/* 封面本身就是開播鍵 —— 這是最常做的事，不該藏在一顆小按鈕裡 */}
      <button
        onClick={() => (selectMode ? onToggleSelect?.(item) : playable && onPlay(item))}
        disabled={pending || (!selectMode && !playable)}
        className="relative block aspect-[16/10] w-full overflow-hidden bg-ink-mist disabled:cursor-default"
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

        {playable && !selectMode && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition group-hover:opacity-100">
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-moon/70 bg-ink-black/70 text-lg text-moon">
              {watch.icon}
            </span>
          </span>
        )}

        <span className="absolute left-2 top-2 flex items-center gap-1">
          {item.mainType && (
            <span className="rounded bg-ink-black/80 px-1.5 py-0.5 text-[10px] tracking-wider text-mist-silver">
              {item.mainType}
            </span>
          )}
          {rating > 0 && (
            <span className="rounded bg-ink-black/80 px-1.5 py-0.5 text-[10px] text-moon">
              {'★'.repeat(rating)}
            </span>
          )}
        </span>

        {!playable && (
          <span className="absolute bottom-2 left-2 rounded bg-ink-black/80 px-1.5 py-0.5 text-[10px] text-mist-shadow">
            無連結
          </span>
        )}

        {/* 影片播到哪（只有直鏈量得到），貼在封面最底 */}
        {watchedRatio > 0 && (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-ink-black/70">
            <span
              className="block h-full bg-cinnabar"
              style={{ width: `${Math.round(watchedRatio * 100)}%` }}
            />
          </span>
        )}
      </button>

      {/* ⋯ 疊在封面上，不佔內容高度。放在 button 外面才不會連帶觸發開播 */}
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
            ].filter((a) => a.show).map((action) => (
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

      {/* 集數進度條 */}
      {percent > 0 && (
        <div className="h-0.5 w-full bg-ink-mist">
          <div className="h-full bg-moon transition-all" style={{ width: `${percent}%` }} />
        </div>
      )}

      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <h3 className="font-display line-clamp-2 text-sm leading-snug text-mist" title={item.title}>
          {item.title}
        </h3>

        <div className="mt-auto">
          {draft !== null ? (
            <input
              className="font-num h-7 w-full rounded border border-moon-soft bg-ink-mist text-center text-xs text-mist outline-none"
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
              className="font-num h-7 w-full rounded text-center text-xs text-mist transition hover:bg-ink-mist disabled:opacity-50"
              title="點一下直接輸入集數"
            >
              {done}
              {total > 0 && (
                <span className={aired > 0 ? 'text-moon-soft' : 'text-mist-shadow'}> / {total}</span>
              )}
            </button>
          )}
        </div>

        {hint && <p className="text-[10px] leading-none text-mist-shadow">{hint}</p>}
      </div>
    </article>
  );
}
