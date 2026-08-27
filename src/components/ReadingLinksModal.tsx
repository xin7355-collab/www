'use client';

import Modal from './Modal';
import { readingLinks } from '@/lib/siteCatalog';
import { MediaItem } from '@/types/media';

interface Props {
  item: MediaItem;
  /** 選好之後把該站網址存回觀看連結 */
  onUse: (url: string) => void;
  onClose: () => void;
}

/**
 * 小說與漫畫的「去哪裡看」。
 *
 * 從 Bangumi 加進來的小說漫畫，連結指的是資料頁不是內文，點進去只會
 * 看到一個介紹頁。這裡把作品名帶到各平台的搜尋頁，找到之後把網址貼回來，
 * 之後點卡片就直接到那裡。
 *
 * 這個站不代管也不抓取任何內文 —— 它是連結目錄。
 */
export default function ReadingLinksModal({ item, onUse, onClose }: Props) {
  const links = readingLinks(item.title, item.mainType);

  return (
    <Modal title="去哪裡看" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-[11px] leading-relaxed text-mist-shadow">
          用「{item.title}」到各平台搜尋。找到之後把該站網址貼進下面，
          之後點卡片就直接到那裡。
        </p>

        <div className="space-y-1.5">
          {links.map((link) => (
            <a
              key={link.label}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg border border-ink-border px-3 py-2 transition hover:border-moon-soft"
            >
              <span className="flex-1 text-sm text-mist">{link.label}</span>
              {link.note && <span className="text-[10px] text-mist-shadow">{link.note}</span>}
              <span className="text-xs text-mist-shadow">↗</span>
            </a>
          ))}
        </div>

        <form
          className="flex gap-2 border-t border-ink-border pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            const url = new FormData(e.currentTarget).get('url');
            if (typeof url === 'string' && url.trim()) onUse(url.trim());
          }}
        >
          <input name="url" className="field min-w-0 flex-1" placeholder="貼上找到的網址" />
          <button
            type="submit"
            className="shrink-0 rounded-lg bg-moon px-4 text-sm font-medium text-ink-black transition hover:bg-moon-soft"
          >
            存起來
          </button>
        </form>
      </div>
    </Modal>
  );
}
