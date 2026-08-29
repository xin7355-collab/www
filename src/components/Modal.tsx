'use client';

import { useEffect } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** 播放器要用更寬的版面 */
  wide?: boolean;
  /**
   * 懸浮面板模式：貼著上方展開、背景只淡淡壓一層。
   * 搜尋用這個 —— 它是「輸入框展開的結果」，不是一個獨立的對話框，
   * 蓋成置中的大視窗會讓人以為離開了片庫。
   */
  panel?: boolean;
  footer?: React.ReactNode;
}

export default function Modal({ title, onClose, children, wide, panel, footer }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center ${
        panel ? 'items-start bg-black/40' : 'items-center bg-black/75 backdrop-blur-sm'
      }`}
      // fixed 定位會脫離 body 的安全區 padding，這裡自己讓開瀏海
      style={{
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingRight: 'max(1rem, env(safe-area-inset-right))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(1rem, env(safe-area-inset-left))',
      }}
      onClick={onClose}
    >
      <div
        className={`custom-scrollbar star-rise w-full overflow-y-auto rounded-2xl border border-ink-border-strong bg-ink-deep shadow-2xl ${
          panel ? 'mt-2 max-h-[85vh] max-w-2xl' : 'max-h-[92vh]'
        } ${wide ? 'max-w-4xl' : panel ? '' : 'max-w-lg'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink-border bg-ink-deep px-5 py-3.5">
          <h2 className="font-display text-base tracking-wide text-mist">{title}</h2>
          <button
            onClick={onClose}
            aria-label="關閉"
            className="text-xl leading-none text-mist-shadow transition hover:text-mist"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4">{children}</div>

        {footer && (
          <div className="sticky bottom-0 border-t border-ink-border bg-ink-deep px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
