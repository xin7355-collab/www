'use client';

import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import { deriveCover, ResolvedWatch } from '@/lib/watchUrl';
import { recordWatch } from '@/lib/history';
import { itemKey } from '@/lib/itemKey';
import { EMPTY_MARKS, marksFor, saveMarks, SkipMarks, useSkipMarks } from '@/lib/skipMarks';
import { loadPosition, savePosition } from '@/hooks/useSettings';
import { MediaItem } from '@/types/media';

interface Props {
  item: MediaItem;
  watch: ResolvedWatch;
  onClose: () => void;
  onBump: (item: MediaItem, delta: number) => void;
  /** 切到背景時要不要繼續放聲音（只對直鏈有效） */
  backgroundAudio: boolean;
  /** 把這部交給外部 App 開；沒設定樣板時會帶去設定頁 */
  onOpenExternal: (item: MediaItem) => void;
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
  /** 定期回報看到哪，寫進觀看紀錄 */
  onProgress: (position: number, duration: number) => void;
  /** 片頭片尾標記，整部作品共用 */
  marks: SkipMarks;
  onMarksChange: (marks: SkipMarks) => void;
  backgroundAudio: boolean;
}

/**
 * 直鏈影片播放器。
 *
 * 三件原生 <video> 不會自己做的事：
 * 1. m3u8 只有 Safari 原生播得動，其他瀏覽器要掛 hls.js（動態載入，不播串流就不下載）
 * 2. 離開時記住播到幾秒，下次自動接續
 * 3. 播放期間請求 Wake Lock，手機不會看到一半熄螢幕
 */
function DirectPlayer({
  url,
  title,
  cover,
  onEnded,
  onProgress,
  marks,
  onMarksChange,
  backgroundAudio,
}: DirectPlayerProps) {
  const ref = useRef<HTMLVideoElement>(null);
  /** 背景接手用的 <audio>，見下面「背景播放」那段 */
  const audioRef = useRef<HTMLAudioElement>(null);

  /**
   * 目前真正在出聲的那個元素。切到背景之後是 <audio>，其餘時候是 <video>。
   * 存進度、鎖定畫面控制、播完 +1 都要認這個，不然一進背景就全部停擺。
   */
  const activeEl = (): HTMLMediaElement => {
    const audio = audioRef.current;
    return audio && !audio.paused ? audio : (ref.current as HTMLMediaElement);
  };

  const [speed, setSpeed] = useState(1);
  const [pipAvailable, setPipAvailable] = useState(false);
  /** 目前播到第幾秒（只取整數，免得每秒重繪四次） */
  const [clock, setClock] = useState(0);

  // 開啟當下的續播點，只取一次。這個元件只在使用者點開播之後才渲染，
  // 不會在預渲染階段跑到，所以讀 localStorage 不會有 hydration 問題。
  const [resumeAt] = useState(() => loadPosition(url));

  // 播完的回呼每次 render 都是新的函式；用 ref 轉一手，
  // 才不會讓下面那個「掛滿事件監聽」的 effect 每次 render 都拆掉重建
  const endedRef = useRef(onEnded);
  useEffect(() => {
    endedRef.current = onEnded;
  }, [onEnded]);

  const progressRef = useRef(onProgress);
  useEffect(() => {
    progressRef.current = onProgress;
  }, [onProgress]);

  const marksRef = useRef(marks);
  useEffect(() => {
    marksRef.current = marks;
  }, [marks]);

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

  /**
   * 背景播放：頁面切到背景時，把聲音交給 <audio> 接手。
   *
   * 為什麼要這樣繞：**iOS 會在螢幕鎖定或切走 app 時暫停 `<video>`**，
   * 這是 WebKit 的規則，Media Session 也救不了。但同一個來源餵給 `<audio>`
   * 就允許在背景繼續播 —— 所以進背景時暫停影片、用音訊接著播同一個時間點，
   * 回到前景再換回來。使用者只會聽到聲音沒斷。
   *
   * Android 本來就能在背景播（有 Media Session 就夠），這段對它是多餘的，
   * 但交接成本只有一次 seek，換到「兩邊行為一致」很划算。
   *
   * **內嵌 iframe（YouTube / BiliBili）完全做不到** —— 那是對方頁面裡的
   * 播放器，我們碰不到它的 media 元素。這個功能只對直鏈有效。
   */
  useEffect(() => {
    const video = ref.current;
    const audio = audioRef.current;
    if (!video || !audio || !backgroundAudio) return;

    // HLS 在非 Safari 要靠 hls.js 才播得動，而那些瀏覽器本來就能在背景播音訊，
    // 不需要這場接力。所以只在瀏覽器自己就吃得下這個來源時才準備 <audio>
    if (isHls(url) && !audio.canPlayType('application/vnd.apple.mpegurl')) return;

    /**
     * 先「解鎖」音訊元素。
     *
     * **iOS 不准程式去播一個從來沒在使用者手勢裡播過的媒體元素。**
     * 而交接是在 visibilitychange 裡發生的 —— 那不是手勢，所以沒先解鎖的話
     * `audio.play()` 會被直接擋掉，背景就整個沒聲音（這正是第一版的 bug）。
     *
     * 所以趁使用者按下播放的當下播一下再立刻暫停：時間停在 0 且只有幾毫秒，
     * 聽不出來，但元素從此就被 iOS 標記成「使用者允許過」。
     */
    let primed = false;
    const prime = () => {
      if (primed) return;
      primed = true;
      audio.src = url;
      audio
        .play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
        })
        .catch(() => {
          // 這次沒解鎖成功就下次手勢再試
          primed = false;
        });
    };

    const toAudio = () => {
      if (video.paused) return;
      // 已經在 prime 時設好 src 了，這裡只要對時間
      if (audio.src !== url) audio.src = url;
      audio.currentTime = video.currentTime;
      audio.playbackRate = video.playbackRate;
      video.pause();
      // 背景啟動被瀏覽器擋下也不要讓它炸掉 —— 回到前景照樣接得回去
      void audio.play().catch(() => {});
    };

    const toVideo = () => {
      if (audio.paused) return;
      video.currentTime = audio.currentTime;
      audio.pause();
      void video.play().catch(() => {});
    };

    const onVisibility = () => (document.hidden ? toAudio() : toVideo());
    document.addEventListener('visibilitychange', onVisibility);

    // 兩個時機都試著解鎖：使用者碰畫面的當下一定是手勢；
    // 而 autoPlay 觸發的 play 有時仍在開啟播放器那一下的手勢範圍內
    video.addEventListener('play', prime);
    document.addEventListener('pointerdown', prime, true);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      video.removeEventListener('play', prime);
      document.removeEventListener('pointerdown', prime, true);
      audio.pause();
      audio.removeAttribute('src');
    };
  }, [url, backgroundAudio]);

  // ── 續播、進度保存、播完 +1、螢幕不休眠、鍵盤操作
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (resumeAt > 0) el.currentTime = resumeAt;
    setPipAvailable(document.pictureInPictureEnabled);

    const persist = () => {
      // 背景時真正在跑的是 <audio>，讀 video 會停在交接當下那一秒
      const media = activeEl();
      savePosition(url, media.currentTime);
      progressRef.current(media.currentTime, Number.isFinite(media.duration) ? media.duration : 0);
    };
    const timer = window.setInterval(persist, 5000);

    // timeupdate 一秒會觸發好幾次，只在整數秒變動時才更新 state
    const tick = () => {
      const second = Math.floor(el.currentTime);
      setClock((prev) => (prev === second ? prev : second));

      // 自動跳過只作用於片頭。片尾一律留給按鈕 ——
      // 自動跳片尾等於幫使用者結束播放，太超過了
      const { opEnd, auto } = marksRef.current;
      if (auto && opEnd > 0 && el.currentTime > 0.5 && el.currentTime < opEnd) {
        el.currentTime = opEnd;
      }
    };
    el.addEventListener('timeupdate', tick);

    const handleEnded = () => {
      savePosition(url, 0); // 看完了就不要再接續到片尾
      endedRef.current();
    };
    el.addEventListener('ended', handleEnded);
    // 在背景播完的那一集也要 +1
    const audio = audioRef.current;
    audio?.addEventListener('ended', handleEnded);

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
      el.removeEventListener('timeupdate', tick);
      el.removeEventListener('ended', handleEnded);
      audio?.removeEventListener('ended', handleEnded);
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
        artist: '墨影',
        artwork: cover ? [{ src: cover, sizes: '512x512' }] : [],
      });
    }

    // 一律操作「目前在出聲的那個元素」—— 背景時是 <audio>，
    // 寫死 video 的話鎖定畫面上的按鈕在背景會按了沒反應
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => void activeEl().play()],
      ['pause', () => activeEl().pause()],
      ['seekbackward', (d) => { activeEl().currentTime -= d.seekOffset || SEEK_STEP; }],
      ['seekforward', (d) => { activeEl().currentTime += d.seekOffset || SEEK_STEP; }],
      ['seekto', (d) => { const m = activeEl(); if (typeof d.seekTime === 'number') m.currentTime = d.seekTime; }],
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
      const m = activeEl();
      if (!Number.isFinite(m.duration) || m.duration <= 0) return;
      try {
        ms.setPositionState({
          duration: m.duration,
          position: Math.min(m.currentTime, m.duration),
          playbackRate: m.playbackRate,
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

  const inOpening = marks.opEnd > 0 && clock < marks.opEnd;
  const inEnding = marks.edStart > 0 && clock >= marks.edStart;

  const skipOpening = () => {
    if (ref.current) ref.current.currentTime = marks.opEnd;
  };

  /**
   * 跳到接近結尾而不是直接設成 duration —— 讓它自然播到底觸發 ended，
   * 進度 +1 那條路才會照常走，不必在這裡重複一份邏輯。
   */
  const skipEnding = () => {
    const el = ref.current;
    if (!el || !Number.isFinite(el.duration)) return;
    el.currentTime = Math.max(0, el.duration - 0.5);
    void el.play();
  };

  const markHere = (field: 'opEnd' | 'edStart') => {
    const el = ref.current;
    if (!el) return;
    onMarksChange({ ...marks, [field]: Math.floor(el.currentTime) });
  };

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
      <div className="relative">
        <video
          ref={ref}
          controls
          autoPlay
          playsInline
          className="aspect-video w-full rounded-lg bg-black"
        />

        {/*
          背景接手用的音訊元素。平常不出聲也不占位置，只有頁面切到背景時
          才接過同一個來源繼續播 —— iOS 不讓 <video> 在背景播，但 <audio> 可以。
        */}
        <audio ref={audioRef} preload="none" className="hidden" />

        {/* 浮在原生控制列上方，避免蓋住進度條 */}
        {(inOpening || inEnding) && (
          <button
            onClick={inOpening ? skipOpening : skipEnding}
            className="absolute bottom-16 right-3 rounded-lg border border-moon-soft/60 bg-ink-black/85 px-3 py-2 text-xs text-mist backdrop-blur transition hover:bg-moon hover:text-ink-black"
          >
            {inOpening ? '跳過片頭 ▸' : '跳過片尾 ▸'}
          </button>
        )}
      </div>

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

      {/* 片頭片尾標記：標一次，整部作品每一集共用 */}
      <div className="mt-1.5 flex flex-wrap items-center gap-2 border-t border-ink-border pt-1.5 text-[11px] text-mist-shadow">
        <span>片頭片尾</span>
        <button onClick={() => markHere('opEnd')} className="hover:text-moon">
          片頭到這 {marks.opEnd > 0 && <span className="text-mist-silver">({formatTime(marks.opEnd)})</span>}
        </button>
        <button onClick={() => markHere('edStart')} className="hover:text-moon">
          片尾從這 {marks.edStart > 0 && <span className="text-mist-silver">({formatTime(marks.edStart)})</span>}
        </button>

        {marks.opEnd > 0 && (
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={marks.auto}
              onChange={(e) => onMarksChange({ ...marks, auto: e.target.checked })}
              className="h-3 w-3 accent-[#e2c178]"
            />
            自動跳過片頭
          </label>
        )}

        {(marks.opEnd > 0 || marks.edStart > 0) && (
          <button
            onClick={() => onMarksChange(EMPTY_MARKS)}
            className="ml-auto hover:text-cinnabar"
          >
            清除標記
          </button>
        )}
      </div>
    </div>
  );
}

export default function PlayerModal({ item, watch, onClose, onBump, backgroundAudio, onOpenExternal }: Props) {
  const done = Number.parseInt(item.progress.replace(/[^\d]/g, ''), 10) || 0;
  const key = itemKey(item);
  const marks = marksFor(useSkipMarks(), key);

  // 一開播就記一筆，內嵌播放器量不到秒數也至少留下「什麼時候看的」
  const { title, watchUrl, progress } = item;
  useEffect(() => {
    recordWatch({ title, watchUrl, progress });
  }, [title, watchUrl, progress]);

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
          {/* 正在看內嵌播放器的當下，最想切出去的就是這裡 */}
          <button
            onClick={() => onOpenExternal(item)}
            className="rounded-lg border border-ink-border-strong px-3 py-1.5 text-xs text-mist-silver transition hover:border-moon-soft hover:text-moon"
            title="交給你設定的 App 開（可背景播）"
          >
            外部 App ↗
          </button>
          <a
            href={watch.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-ink-border-strong px-3 py-1.5 text-xs text-mist-silver transition hover:text-mist"
          >
            原站 ↗
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
          onProgress={(position, duration) =>
            recordWatch({ title, watchUrl, progress }, position, duration)
          }
          marks={marks}
          onMarksChange={(next) => saveMarks(key, next)}
          backgroundAudio={backgroundAudio}
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
