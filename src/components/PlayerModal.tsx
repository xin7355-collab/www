'use client';

import { useEffect, useRef } from 'react';
import Modal from './Modal';
import { ResolvedWatch } from '@/lib/watchUrl';
import { loadPosition, savePosition } from '@/hooks/useSettings';
import { MediaItem } from '@/types/media';

interface Props {
  item: MediaItem;
  watch: ResolvedWatch;
  onClose: () => void;
  onBump: (item: MediaItem, delta: number) => void;
}

/** 直鏈影片播放器：離開時記住播到幾秒，下次自動接續 */
function DirectPlayer({ url }: { url: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const resume = loadPosition(url);
    if (resume > 0) el.currentTime = resume;

    const persist = () => savePosition(url, el.currentTime);
    const timer = window.setInterval(persist, 5000);

    return () => {
      window.clearInterval(timer);
      persist();
    };
  }, [url]);

  return (
    <video
      ref={ref}
      src={url}
      controls
      autoPlay
      playsInline
      className="aspect-video w-full rounded-lg bg-black"
    />
  );
}

export default function PlayerModal({ item, watch, onClose, onBump }: Props) {
  const done = Number.parseInt(item.progress.replace(/[^\d]/g, ''), 10) || 0;

  return (
    <Modal
      title={item.title}
      onClose={onClose}
      wide
      footer={
        <div className="flex items-center gap-3">
          <span className="font-num text-xs text-mist-shadow">
            目前進度 {done}
            {item.totalEp && ` / ${item.totalEp}`}
          </span>
          <div className="flex-1" />
          <a
            href={watch.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-ink-border-strong px-3 py-1.5 text-xs text-mist-silver transition hover:text-mist"
          >
            在原站開啟 ↗
          </a>
          <button
            onClick={() => onBump(item, 1)}
            className="rounded-lg bg-moon px-3 py-1.5 text-xs font-medium text-ink-black transition hover:bg-moon-soft"
          >
            看完這集 +1
          </button>
        </div>
      }
    >
      {watch.kind === 'direct' ? (
        <DirectPlayer url={watch.url} />
      ) : (
        <iframe
          src={watch.embedUrl}
          title={item.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          className="aspect-video w-full rounded-lg border-0 bg-black"
        />
      )}
      <p className="mt-3 text-[11px] text-mist-shadow">{watch.hint}</p>
    </Modal>
  );
}
