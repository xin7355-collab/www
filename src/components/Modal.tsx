'use client';

import { useEffect } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** 播放器要用更寬的版面 */
  wide?: boolean;
  footer?: React.ReactNode;
}

export default function Modal({ title, onClose, children, wide, footer }: Props) {
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`custom-scrollbar star-rise max-h-[92vh] w-full overflow-y-auto rounded-2xl border border-ink-border-strong bg-ink-deep shadow-2xl ${
          wide ? 'max-w-4xl' : 'max-w-lg'
        }`}
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
