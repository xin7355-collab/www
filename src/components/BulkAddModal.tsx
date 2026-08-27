'use client';

import { useState } from 'react';
import Modal from './Modal';
import { emptyItem } from '@/lib/schema';
import { detectPlatform } from '@/lib/watchUrl';
import { MAIN_TYPES, NewMediaItem } from '@/types/media';

interface Props {
  /** 從「自動填」帶過來的分集清單 */
  initialText?: string;
  busy?: boolean;
  onSubmit: (items: NewMediaItem[]) => Promise<number>;
  onClose: () => void;
}

interface Row {
  title: string;
  url: string;
  platform: string;
}

const URL_LINE = /^https?:\/\/\S+$/i;

/** 純網址時給一個暫定名稱，總比空白好 —— 靜態站抓不到對方網頁的標題 */
function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const id = u.searchParams.get('v') || u.pathname.split('/').filter(Boolean).pop() || '';
    const site = u.hostname.replace(/^www\./, '').split('.')[0];
    return id ? `${site} ${decodeURIComponent(id).slice(0, 40)}` : site;
  } catch {
    return url.slice(0, 40);
  }
}

/**
 * 一行一筆。支援三種寫法，因為實際貼上來的東西不會只有一種樣子：
 *   進擊的巨人 | https://…     ← 名稱與連結都有
 *   https://…                  ← 只有連結，名稱先用網址推一個
 *   進擊的巨人                  ← 只有名稱，之後再補連結
 */
export function parseLines(text: string): Row[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const bar = line.lastIndexOf('|');
      let title = '';
      let url = '';

      if (bar > 0) {
        title = line.slice(0, bar).trim();
        url = line.slice(bar + 1).trim();
      } else if (URL_LINE.test(line)) {
        url = line;
        title = titleFromUrl(line);
      } else {
        title = line;
      }

      return { title, url, platform: url ? detectPlatform(url) : '' };
    })
    .filter((r) => r.title);
}

export default function BulkAddModal({ initialText, busy, onSubmit, onClose }: Props) {
  const [text, setText] = useState(initialText ?? '');
  const [mainType, setMainType] = useState('');
  const [status, setStatus] = useState('');

  const rows = parseLines(text);

  const submit = async () => {
    if (rows.length === 0) return;
    setStatus(`加入中… 0 / ${rows.length}`);
    const added = await onSubmit(
      rows.map((r) => ({
        ...emptyItem(),
        title: r.title,
        mainType,
        platform: r.platform,
        watchUrl: r.url,
      })),
    );
    if (added === rows.length) onClose();
    else setStatus(`加入了 ${added} / ${rows.length} 筆，其餘失敗了，請重試`);
  };

  return (
    <Modal
      title="批次加入"
      onClose={onClose}
      footer={
        <div className="flex items-center gap-2">
          <span className="flex-1 text-[11px] text-mist-shadow">
            {status || (rows.length ? `解析出 ${rows.length} 筆` : '一行一筆')}
          </span>
          <button
            onClick={onClose}
            className="rounded-lg border border-ink-border-strong px-4 py-2 text-sm text-mist-silver transition hover:text-mist"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={rows.length === 0 || busy}
            className="rounded-lg bg-moon px-4 py-2 text-sm font-medium text-ink-black transition hover:bg-moon-soft disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? '加入中…' : `加入 ${rows.length || ''} 筆`}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <span className="mb-1 block text-[11px] tracking-wider text-mist-shadow">
            一行一筆，三種寫法都吃
          </span>
          <textarea
            className="field h-40 resize-y font-num text-xs leading-relaxed"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'進擊的巨人 | https://…\nhttps://…\n葬送的芙莉蓮'}
            autoFocus
          />
          <p className="mt-1.5 text-[11px] leading-relaxed text-mist-shadow">
            有 <span className="text-mist-silver">|</span> 就是「名稱 | 連結」；
            整行是網址就自動推一個暫定名稱；純文字就當成只有名稱，連結之後再補。
          </p>
        </div>

        <div>
          <span className="mb-1 block text-[11px] tracking-wider text-mist-shadow">
            這批的分類（可留空）
          </span>
          <select
            className="field w-auto"
            value={mainType}
            onChange={(e) => setMainType(e.target.value)}
          >
            <option value="">不指定</option>
            {MAIN_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {rows.length > 0 && (
          <div className="max-h-52 overflow-y-auto rounded-lg border border-ink-border">
            {rows.map((r, i) => (
              <div
                key={i}
                className="flex items-center gap-2 border-b border-ink-border px-3 py-2 text-[11px] last:border-0"
              >
                <span className="flex-1 truncate text-mist">{r.title}</span>
                {r.platform && <span className="shrink-0 text-mist-shadow">{r.platform}</span>}
                <span className={`shrink-0 ${r.url ? 'text-jade' : 'text-mist-shadow'}`}>
                  {r.url ? '有連結' : '無連結'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
