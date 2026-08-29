'use client';

import { useCallback } from 'react';
import { setStored, useStored } from '@/lib/localStore';
import { DEFAULT_GIMY_DOMAIN } from '@/lib/watchUrl';

const KEY = 'myStream.gimyDomain';
const YT_KEY = 'myStream.youtubeKey';
const TMDB_KEY = 'myStream.tmdbKey';
const BG_AUDIO_KEY = 'myStream.backgroundAudio';
const SCHEME_KEY = 'myStream.externalScheme';
const PREFER_KEY = 'myStream.preferredSource';

/**
 * gimy 之類會換網域的站點，網域是全域設定。
 * 換網域時只改這一個地方，所有作品的觀看連結自動跟著更新。
 * 代價：per-browser，換裝置要重設一次（半年才換一次，可接受）。
 */
export function useSettings() {
  const gimyDomain = useStored(KEY, DEFAULT_GIMY_DOMAIN);

  const saveGimyDomain = useCallback((value: string) => {
    setStored(KEY, value.trim().replace(/\/+$/, '') || DEFAULT_GIMY_DOMAIN);
  }, []);

  /**
   * YouTube Data API 金鑰。**存在這台裝置**，不打包進 bundle ——
   * 靜態站沒有伺服器可以藏東西，寫進建置變數等於公開給所有人用你的額度。
   */
  const youtubeKey = useStored(YT_KEY, '');

  const saveYoutubeKey = useCallback((value: string) => {
    setStored(YT_KEY, value.trim());
  }, []);

  /** TMDB 金鑰，同樣只存在這台裝置 */
  const tmdbKey = useStored(TMDB_KEY, '');

  const saveTmdbKey = useCallback((value: string) => {
    setStored(TMDB_KEY, value.trim());
  }, []);

  /**
   * 背景播放。預設開啟 —— 想關掉的情境很少，但關掉的人會很想關掉
   * （例如只想看畫面、不想手機在口袋裡繼續出聲）。
   */
  const backgroundAudio = useStored(BG_AUDIO_KEY, '1') !== '0';

  const saveBackgroundAudio = useCallback((on: boolean) => {
    setStored(BG_AUDIO_KEY, on ? '1' : '0');
  }, []);

  /**
   * 外部 App 的 URL 樣板。填了之後 YouTube 連結會交給那個 App 開 ——
   * 網頁做不到背景播，但那些原生 App 做得到。
   */
  const externalScheme = useStored(SCHEME_KEY, '');

  const saveExternalScheme = useCallback((value: string) => {
    setStored(SCHEME_KEY, value.trim());
  }, []);

  /**
   * 偏好來源。搜尋結果會把這個來源排到最前面 ——
   * 習慣看 YouTube 的人，十次有九次要挑的就是那幾筆，不該每次自己找。
   * 這個來源沒有結果時，其餘來源照原順序遞補，不會變成查無結果。
   */
  const preferredSource = useStored(PREFER_KEY, '');

  const savePreferredSource = useCallback((value: string) => {
    setStored(PREFER_KEY, value);
  }, []);

  return {
    gimyDomain,
    saveGimyDomain,
    youtubeKey,
    saveYoutubeKey,
    tmdbKey,
    saveTmdbKey,
    backgroundAudio,
    saveBackgroundAudio,
    externalScheme,
    saveExternalScheme,
    preferredSource,
    savePreferredSource,
  };
}

// ─── 播放進度（直鏈影片用）────────────────────────────────────

const posKey = (url: string) => `myStream.pos.${url}`;

export function loadPosition(url: string): number {
  const v = Number(localStorage.getItem(posKey(url)));
  return Number.isFinite(v) && v > 0 ? v : 0;
}

export function savePosition(url: string, seconds: number) {
  if (seconds > 5) localStorage.setItem(posKey(url), String(Math.floor(seconds)));
  else localStorage.removeItem(posKey(url));
}
