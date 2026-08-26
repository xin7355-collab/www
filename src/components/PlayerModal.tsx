'use client';

import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import { deriveCover, ResolvedWatch } from '@/lib/watchUrl';
import { loadPosition, savePosition } from '@/hooks/useSettings';
import { MediaItem } from '@/types/media';

interface Props {
  item: MediaItem;
  watch: ResolvedWatch;
  onClose: () => void;
  onBump: (item: MediaItem, delta: number) => void;
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const SEEK_STEP = 10;

const isHls = (url: string) => /\.m3u8(\?|#|$)/i.test(url);

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** 螢幕不休眠 —— 手機橫躺看片時最實際的一個改善 */
function requestWakeLock(): Promise<{ release: () => Promise<void> } | null> {
  const nav = navigator as Navigator & {
    wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
  };
  if (!nav.wakeLock) return Promise.resolve(null);
  return nav.wakeLock.request('screen').catch(() => null);
}

interface DirectPlayerProps {
  url: string;
  /** 給鎖定畫面顯示用 */
  title: string;
  cover: string;
  /** 播完自動記一集 */
  onEnded: () => void;
}

/**
 * 直鏈影片播放器。
 *
 * 三件原生 <video> 不會自己做的事：
 * 1. m3u8 只有 Safari 原生播得動，其他瀏覽器要掛 hls.js（動態載入，不播串流就不下載）
 * 2. 離開時記住播到幾秒，下次自動接續
 * 3. 播放期間請求 Wake Lock，手機不會看到一半熄螢幕
 */
function DirectPlayer({ url, title, cover, onEnded }: DirectPlayerProps) {
  const ref = useRef<HTMLVideoElement>(null);

  const [speed, setSpeed] = useState(1);
  const [pipAvailable, setPipAvailable] = useState(false);

  // 開啟當下的續播點，只取一次。這個元件只在使用者點開播之後才渲染，
  // 不會在預渲染階段跑到，所以讀 localStorage 不會有 hydration 問題。
  const [resumeAt] = useState(() => loadPosition(url));

  // 播完的回呼每次 render 都是新的函式；用 ref 轉一手，
  // 才不會讓下面那個「掛滿事件監聽」的 effect 每次 render 都拆掉重建
  const endedRef = useRef(onEnded);
  useEffect(() => {
    endedRef.current = onEnded;
  }, [onEnded]);

  // ── 影片來源：m3u8 走 hls.js，其餘直接餵給 <video>
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let destroy: (() => void) | undefined;
    let cancelled = false;

    if (!isHls(url) || el.canPlayType('application/vnd.apple.mpegurl')) {
      el.src = url;
    } else {
      // 動態載入：不播 HLS 的人不必為這包 library 付下載成本
      import('hls.js').then(({ default: Hls }) => {
        if (cancelled || !Hls.isSupported()) return;
        const hls = new Hls();
        hls.loadSource(url);
        hls.attachMedia(el);
        destroy = () => hls.destroy();
      });
    }

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [url]);

  // ── 續播、進度保存、播完 +1、螢幕不休眠、鍵盤操作
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (resumeAt > 0) el.currentTime = resumeAt;
    setPipAvailable(document.pictureInPictureEnabled);

    const persist = () => savePosition(url, el.currentTime);
    const timer = window.setInterval(persist, 5000);

    const handleEnded = () => {
      savePosition(url, 0); // 看完了就不要再接續到片尾
      endedRef.current();
    };
    el.addEventListener('ended', handleEnded);

    let lock: { release: () => Promise<void> } | null = null;
    const acquire = () => {
      requestWakeLock().then((l) => {
        lock = l;
      });
    };
    const release = () => {
      lock?.release().catch(() => {});
      lock = null;
    };
    el.addEventListener('play', acquire);
    el.addEventListener('pause', release);

    const onKey = (e: KeyboardEvent) => {
      // 打字時不要把空白鍵搶去當播放鍵
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (el.paused) el.play();
          else el.pause();
          break;
        case 'ArrowRight':
          e.preventDefault();
          el.currentTime += SEEK_STEP;
          break;
        case 'ArrowLeft':
          e.preventDefault();
          el.currentTime -= SEEK_STEP;
          break;
        case 'ArrowUp':
          e.preventDefault();
          el.volume = Math.min(1, el.volume + 0.1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          el.volume = Math.max(0, el.volume - 0.1);
          break;
        case 'm':
        case 'M':
          el.muted = !el.muted;
          break;
        case 'f':
        case 'F':
          if (document.fullscreenElement) document.exitFullscreen();
          else el.requestFullscreen().catch(() => {});
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      window.clearInterval(timer);
      persist();
      el.removeEventListener('ended', handleEnded);
      el.removeEventListener('play', acquire);
      el.removeEventListener('pause', release);
      window.removeEventListener('keydown', onKey);
      release();
    };
  }, [url, resumeAt]);

  /**
   * Media Session：讓系統知道「這是一段媒體播放」。
   *
   * 換來兩件事：鎖定畫面／通知列出現播放控制，以及 Android 上
   * 關掉螢幕後音訊能繼續（沒有這段的話瀏覽器會直接把它當成一般網頁掐掉）。
   *
   * iOS 的限制不是這裡能解的：Safari 在螢幕鎖定時會暫停 <video>。
   * 內嵌的 YouTube / BiliBili 也一樣 —— 那是對方 iframe 裡的播放器，
   * 我們碰不到它的 media session。
   */
  useEffect(() => {
    const el = ref.current;
    if (!el || !('mediaSession' in navigator)) return;

    const ms = navigator.mediaSession;
    if (typeof MediaMetadata !== 'undefined') {
      ms.metadata = new MediaMetadata({
        title,
        artist: '我的片庫',
        artwork: cover ? [{ src: cover, sizes: '512x512' }] : [],
      });
    }

    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => void el.play()],
      ['pause', () => el.pause()],
      ['seekbackward', (d) => { el.currentTime -= d.seekOffset || SEEK_STEP; }],
      ['seekforward', (d) => { el.currentTime += d.seekOffset || SEEK_STEP; }],
      ['seekto', (d) => { if (typeof d.seekTime === 'number') el.currentTime = d.seekTime; }],
    ];
    for (const [action, fn] of handlers) {
      // 舊瀏覽器不認得部分 action，setActionHandler 會直接丟例外
      try {
        ms.setActionHandler(action, fn);
      } catch {
        // 這個 action 不支援就算了，其餘照常
      }
    }

    // 讓鎖定畫面的進度條跟得上
    const syncPosition = () => {
      if (!Number.isFinite(el.duration) || el.duration <= 0) return;
      try {
        ms.setPositionState({
          duration: el.duration,
          position: Math.min(el.currentTime, el.duration),
          playbackRate: el.playbackRate,
        });
      } catch {
        // Safari 舊版沒有 setPositionState
      }
    };
    el.addEventListener('loadedmetadata', syncPosition);
    el.addEventListener('seeked', syncPosition);
    const positionTimer = window.setInterval(syncPosition, 5000);

    return () => {
      window.clearInterval(positionTimer);
      el.removeEventListener('loadedmetadata', syncPosition);
      el.removeEventListener('seeked', syncPosition);
      for (const [action] of handlers) {
        try {
          ms.setActionHandler(action, null);
        } catch {
          // 同上，清不掉就算了
        }
      }
      ms.metadata = null;
    };
  }, [title, cover]);

  const changeSpeed = (value: number) => {
    setSpeed(value);
    if (ref.current) ref.current.playbackRate = value;
  };

  const enterPip = () => {
    ref.current?.requestPictureInPicture().catch(() => {});
  };

  const restart = () => {
    if (!ref.current) return;
    ref.current.currentTime = 0;
    ref.current.play();
  };

  return (
    <div>
      <video
        ref={ref}
        controls
        autoPlay
        playsInline
        className="aspect-video w-full rounded-lg bg-black"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-mist-shadow">
        {resumeAt > 0 && (
          <>
            <span className="text-mist-silver">從 {formatTime(resumeAt)} 接續</span>
            <button onClick={restart} className="text-mist-shadow underline-offset-2 hover:text-moon hover:underline">
              從頭播放
            </button>
            <span className="text-ink-border-strong">·</span>
          </>
        )}

        <label className="flex items-center gap-1">
          倍速
          <select
            value={speed}
            onChange={(e) => changeSpeed(Number(e.target.value))}
            className="rounded border border-ink-border bg-ink-black px-1 py-0.5 text-[11px] text-mist-silver"
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>

        {pipAvailable && (
          <button onClick={enterPip} className="hover:text-moon">
            子母畫面
          </button>
        )}

        <span className="ml-auto hidden sm:inline">
          空白鍵 播放/暫停 ・ ← → 快轉 {SEEK_STEP} 秒 ・ ↑ ↓ 音量 ・ F 全螢幕 ・ M 靜音
        </span>
      </div>
    </div>
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
        <DirectPlayer
          url={watch.url}
          title={item.title}
          cover={item.cover || deriveCover(item.watchUrl)}
          onEnded={() => onBump(item, 1)}
        />
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
