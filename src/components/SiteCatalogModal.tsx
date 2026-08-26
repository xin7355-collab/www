'use client';

import { useState } from 'react';
import Modal from './Modal';
import { addShortcut, SiteShortcut } from '@/lib/shortcuts';
import { SITE_CATALOG } from '@/lib/siteCatalog';

interface Props {
  shortcuts: SiteShortcut[];
  onClose: () => void;
}

/**
 * 內建站點目錄：不用自己記網址，點一下前往，或加進捷徑列。
 * 已經在捷徑裡的站會標示出來，避免重複加。
 */
export default function SiteCatalogModal({ shortcuts, onClose }: Props) {
  const [filter, setFilter] = useState('');
  const [justAdded, setJustAdded] = useState('');

  const keyword = filter.trim().toLowerCase();
  const existing = new Set(shortcuts.map((s) => s.url.replace(/\/+$/, '')));

  const groups = SITE_CATALOG.map((g) => ({
    ...g,
    sites: g.sites.filter(
      (s) =>
        !keyword ||
        s.label.toLowerCase().includes(keyword) ||
        s.type.includes(keyword) ||
        (s.note ?? '').toLowerCase().includes(keyword) ||
        g.group.includes(keyword),
    ),
  })).filter((g) => g.sites.length > 0);

  return (
    <Modal title="站點目錄" onClose={onClose}>
      <div className="space-y-4">
        <input
          className="field"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="搜尋站名或分類…"
          autoFocus
        />

        <p className="text-[11px] leading-relaxed text-mist-shadow">
          點站名直接前往，按「＋ 捷徑」把它釘在片庫上方。
          標示「可站內播」的站，貼進來的連結能用站內播放器開；
          其餘平台用 DRM 或 X-Frame-Options 擋掉內嵌，一律新分頁開啟。
        </p>

        {groups.length === 0 && (
          <p className="py-8 text-center text-xs text-mist-shadow">沒有符合的站</p>
        )}

        {groups.map((g) => (
          <section key={g.group}>
            <h3 className="mb-1.5 text-[11px] tracking-wider text-mist-shadow">{g.group}</h3>
            <div className="space-y-1">
              {g.sites.map((site) => {
                const added = existing.has(site.url.replace(/\/+$/, ''));
                return (
                  <div
                    key={site.label + site.url}
                    className="flex items-center gap-2 rounded-lg border border-ink-border px-2.5 py-1.5"
                  >
                    <a
                      href={site.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-xs text-mist transition hover:text-moon"
                    >
                      {site.label} ↗
                    </a>
                    {site.embeddable && (
                      <span className="shrink-0 rounded border border-jade/40 px-1 text-[10px] text-jade">
                        可站內播
                      </span>
                    )}
                    <span className="flex-1 truncate text-[10px] text-mist-shadow">
                      {site.note ?? site.type}
                    </span>
                    <button
                      onClick={() => {
                        addShortcut(shortcuts, site.label, site.url, site.type);
                        setJustAdded(site.label);
                      }}
                      disabled={added}
                      className="shrink-0 rounded border border-ink-border-strong px-2 py-0.5 text-[10px] text-mist-silver transition hover:border-moon-soft hover:text-moon disabled:border-ink-border disabled:text-mist-shadow"
                    >
                      {added ? '已加入' : '＋ 捷徑'}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {justAdded && (
          <p className="text-[11px] text-jade">已把「{justAdded}」加進捷徑列</p>
        )}
      </div>
    </Modal>
  );
}
