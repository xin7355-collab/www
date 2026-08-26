'use client';

import { SiteShortcut, shortcutsFor } from '@/lib/shortcuts';

interface Props {
  shortcuts: SiteShortcut[];
  /** 目前選的分類，用來決定顯示哪些捷徑 */
  tab: string;
  onManage: () => void;
}

/**
 * 常用來源站的捷徑列。
 *
 * 分類切到「動漫」時只顯示綁動漫的捷徑（加上沒綁分類的），
 * 少一次「這個站是找動漫還是找電影」的認知成本。
 */
export default function SiteShortcuts({ shortcuts, tab, onManage }: Props) {
  const visible = shortcutsFor(shortcuts, tab);
  if (visible.length === 0) return null;

  return (
    <div className="custom-scrollbar -mx-1 mt-3 flex items-center gap-1.5 overflow-x-auto px-1 pb-1">
      <span className="shrink-0 text-[10px] tracking-wider text-mist-shadow">前往</span>
      {visible.map((s) => (
        <a
          key={s.id}
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-full border border-ink-border px-2.5 py-1 text-[11px] text-mist-silver transition hover:border-moon-soft hover:text-moon"
          title={s.url}
        >
          {s.label}
          <span className="ml-1 text-mist-shadow">↗</span>
        </a>
      ))}
      <button
        onClick={onManage}
        className="shrink-0 rounded-full border border-dashed border-ink-border px-2.5 py-1 text-[11px] text-mist-shadow transition hover:border-moon-soft hover:text-moon"
      >
        編輯
      </button>
    </div>
  );
}
