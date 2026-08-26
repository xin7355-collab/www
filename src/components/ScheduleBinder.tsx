'use client';

import { useState } from 'react';
import { Binding, bindShow, formatAirdate, saveSchedule, unbindShow } from '@/lib/schedule';
import { fetchSchedule, searchShows, ShowHit } from '@/lib/tvmaze';

/** 取現在時間。定義在元件外：Date.now 是不純函式，寫在元件內會被 React Compiler 擋下 */
const stamp = () => Date.now();

interface Props {
  /** 這筆作品的排程鍵（名稱＋連結） */
  itemKey: string;
  title: string;
  binding?: Binding;
}

/**
 * 綁定 TVmaze 播出排程。
 *
 * 綁定之後卡片的進度分母會改用「已播集數」，並顯示下一集的日期 ——
 * 追連載作品時真正想知道的是「我離最新一集差幾集」，而不是「離完結差幾集」。
 */
export default function ScheduleBinder({ itemKey, title, binding }: Props) {
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
    bindShow(itemKey, { showId: hit.id, showName: hit.name, url: hit.url });
    setHits([]);
    setBusy(true);
    setMessage('');
    try {
      saveSchedule(itemKey, await fetchSchedule(hit.id, title), stamp());
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '排程抓取失敗，稍後會自動重試');
    } finally {
      setBusy(false);
    }
  };

  if (binding) {
    const s = binding.schedule;
    return (
      <div className="rounded-lg border border-ink-border p-2.5">
        <div className="flex items-center gap-2">
          <span className="flex-1 truncate text-xs text-mist">{binding.showName}</span>
          <a
            href={binding.url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-[10px] text-mist-shadow underline-offset-2 hover:text-moon hover:underline"
          >
            TVmaze ↗
          </a>
          <button
            type="button"
            onClick={() => unbindShow(itemKey)}
            className="shrink-0 text-[10px] text-mist-shadow transition hover:text-cinnabar"
          >
            解除
          </button>
        </div>

        <p className="mt-1 text-[11px] text-mist-shadow">
          {busy && '抓取排程中…'}
          {!busy && s && (
            <>
              已播 {s.aired} 集{s.seasonTotal > 0 && ` / 本季排定 ${s.seasonTotal} 集`}
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
