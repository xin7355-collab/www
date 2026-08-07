'use client';

import { useCallback } from 'react';
import { setStored, useStored } from '@/lib/localStore';
import { DEFAULT_GIMY_DOMAIN } from '@/lib/watchUrl';

const KEY = 'myStream.gimyDomain';

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

  return { gimyDomain, saveGimyDomain };
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
