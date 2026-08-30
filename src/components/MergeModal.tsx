'use client';

import { useState } from 'react';
import Modal from './Modal';
import { deriveCover } from '@/lib/watchUrl';
import { MediaItem } from '@/types/media';

interface Props {
  /** 選取起來要合併的那幾筆 */
  candidates: MediaItem[];
  /** 選好之後：哪一筆是作品、其餘變成它的分集 */
  onMerge: (parentTitle: string, children: MediaItem[]) => void;
  onClose: () => void;
}

/**
 * 把選取的多筆歸成一部作品。
 *
 * 典型情境：同一部從不同來源加了好幾次（作品本體一筆、YouTube 上的各集
 * 又各一筆），片庫裡看起來是散的。挑一筆當「作品」，其餘變成它的分集，
 * 網格上就只留一張卡。
 *
 * 不會刪任何東西 —— 只是改「所屬作品」欄，隨時可以在編輯裡清掉還原。
 */
export default function MergeModal({ candidates, onMerge, onClose }: Props) {
  // 預設挑名稱最短的當作品：分集的標題通常是「作品名 + 第幾集 + 一堆贅字」
  const [parent, setParent] = useState(
    () => [...candidates].sort((a, b) => a.title.length - b.title.length)[0]?.title ?? '',
  );

  const children = candidates.filter((it) => it.title !== parent);

  return (
    <Modal title="合併為同一部" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-[11px] leading-relaxed text-mist-shadow">
          選一筆當<span className="text-mist-silver">作品</span>，其餘會變成它的分集，
          網格上只留一張卡。不會刪掉任何資料 —— 只是改「所屬作品」欄，
          之後在編輯裡清掉就還原了。
        </p>

        <div className="space-y-1.5">
          {candidates.map((it) => {
            const cover = it.cover || deriveCover(it.watchUrl);
            const isParent = it.title === parent;
            return (
              <button
                key={it.rowNumber}
                onClick={() => setParent(it.title)}
                className={`flex w-full items-center gap-2.5 rounded-lg border p-2 text-left transition ${
                  isParent ? 'border-moon bg-moon/10' : 'border-ink-border hover:border-moon-soft/60'
                }`}
              >
                {cover ? (
                  // 靜態輸出關閉了 next/image 最佳化，直接用 img 更單純
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt="" className="h-10 w-16 shrink-0 rounded object-cover" loading="lazy" />
                ) : (
                  <span className="h-10 w-16 shrink-0 rounded bg-ink-mist" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-xs leading-snug text-mist">{it.title}</span>
                </span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                    isParent ? 'bg-moon text-ink-black' : 'text-mist-shadow'
                  }`}
                >
                  {isParent ? '作品' : '分集'}
                </span>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => onMerge(parent, children)}
          disabled={!parent || children.length === 0}
          className="w-full rounded-lg bg-moon py-2 text-sm font-medium text-ink-black transition hover:bg-moon-soft disabled:opacity-40"
        >
          把其餘 {children.length} 筆歸到「{parent}」底下
        </button>
      </div>
    </Modal>
  );
}
