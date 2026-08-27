'use client';

import { useState } from 'react';
import { formatAirdate, scheduleFrom } from '@/lib/schedule';
import { fetchSchedule, searchShows, showUrl, ShowHit } from '@/lib/tvmaze';
import { MediaItem, MediaPatch } from '@/types/media';

interface Props {
  item: MediaItem;
  /** 寫回 Sheet；排程要跨裝置一致，不能只存在本機 */
  onPatch: (fields: MediaPatch) => void;
}

/**
 * 綁定 TVmaze 播出排程。
 *
 * 綁定之後卡片的進度分母會改用「已播集數」，並顯示下一集的日期 ——
 * 追連載作品時真正想知道的是「我離最新一集差幾集」，而不是「離完結差幾集」。
 */
export default function ScheduleBinder({ item, onPatch }: Props) {
  const title = item.title;
  const bound = item.tvmazeId.trim();
  const schedule = scheduleFrom(item);
  const [hits, setHits] = useState<ShowHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [searched, setSearched] = useState(false);

  const search = async () => {
    setBusy(true);
    setMessage('');
    try {
      const found = await searchShows(title);
      setHits(found.slice(0, 6));
      if (found.length === 0) setMessage('TVmaze 查不到這部，可能它沒收錄');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'TVmaze 搜尋失敗');
    } finally {
      setBusy(false);
      setSearched(true);
    }
  };

  const pick = async (hit: ShowHit) => {
    setHits([]);
    setBusy(true);
    setMessage('');
    try {
      const fresh = await fetchSchedule(hit.id, title);
      onPatch({
        tvmazeId: String(hit.id),
        airedEp: String(fresh.aired),
        nextAirDate: fresh.nextDate,
        nextEpLabel: fresh.nextLabel,
      });
    } catch {
      // 排程抓不到也先把綁定記起來，後端的每日更新會補上
      onPatch({ tvmazeId: String(hit.id), airedEp: '', nextAirDate: '', nextEpLabel: '' });
      setMessage('已綁定，但排程沒抓到 —— 明天的自動更新會補上');
    } finally {
      setBusy(false);
    }
  };

  const unbind = () =>
    onPatch({ tvmazeId: '', airedEp: '', nextAirDate: '', nextEpLabel: '' });

  if (bound) {
    const s = schedule;
    return (
      <div className="rounded-lg border border-ink-border p-2.5">
        <div className="flex items-center gap-2">
          <span className="flex-1 truncate text-xs text-mist">TVmaze #{bound}</span>
          <a
            href={showUrl(Number(bound))}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-[10px] text-mist-shadow underline-offset-2 hover:text-moon hover:underline"
          >
            TVmaze ↗
          </a>
          <button
            type="button"
            onClick={unbind}
            className="shrink-0 text-[10px] text-mist-shadow transition hover:text-cinnabar"
          >
            解除
          </button>
        </div>

        <p className="mt-1 text-[11px] text-mist-shadow">
          {busy && '抓取排程中…'}
          {!busy && s && (
            <>
              已播 {s.aired} 集
              {s.nextDate && ` ・ 下一集 ${formatAirdate(s.nextDate)} ${s.nextLabel}`}
              {!s.nextDate && ' ・ 沒有排定中的下一集'}
            </>
          )}
          {!busy && !s && (message || '尚未取得排程')}
        </p>
        {message && s && <p className="mt-1 text-[11px] text-cinnabar">{message}</p>}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={search}
        disabled={busy}
        className="w-full rounded-lg border border-ink-border-strong py-1.5 text-xs text-mist-silver transition hover:border-moon-soft hover:text-moon disabled:opacity-40"
      >
        {busy ? '搜尋中…' : '綁定播出排程'}
      </button>

      {message && <p className="mt-1.5 text-[11px] text-mist-shadow">{message}</p>}

      {hits.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {hits.map((hit) => (
            <button
              key={hit.id}
              type="button"
              onClick={() => pick(hit)}
              className="flex w-full items-center gap-2 rounded-lg border border-ink-border px-2.5 py-1.5 text-left transition hover:border-moon-soft"
            >
              <span className="flex-1 truncate text-xs text-mist">{hit.name}</span>
              <span className="shrink-0 text-[10px] text-mist-shadow">
                {[hit.premiered.slice(0, 4), hit.channel, hit.status].filter(Boolean).join(' · ')}
              </span>
            </button>
          ))}
        </div>
      )}

      {searched && hits.length > 0 && (
        <p className="mt-1.5 text-[10px] text-mist-shadow">
          選錯了可以之後解除重綁。資料來源 TVmaze（CC BY-SA）。
        </p>
      )}
    </div>
  );
}
