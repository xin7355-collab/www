'use client';

import { useCallback, useEffect } from 'react';
import { setStored, useStored } from './localStore';

/**
 * 外觀設定 —— 主題色與字級。
 *
 * 值只存 localStorage：這是「這台裝置看起來怎樣」，手機想放大字、
 * 電腦不用，本來就不該跨裝置同步。
 *
 * 實際的顏色定義在 globals.css 的 `:root[data-theme=...]`，這裡只負責
 * 把選擇寫到 `<html>` 上。元件一律用語意化的 token（text-mist、bg-ink-deep），
 * 所以換主題不必動任何一支元件。
 */

export const THEMES = [
  { id: 'ink', label: '墨黑', hint: '預設' },
  { id: 'black', label: '純黑', hint: 'OLED 省電' },
  { id: 'dusk', label: '深藍夜', hint: '偏冷，不刺眼' },
  { id: 'paper', label: '羊皮紙', hint: '淺色，白天用' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

export const FONT_SCALES = [
  { id: '0.9', label: '小' },
  { id: '1', label: '標準' },
  { id: '1.15', label: '大' },
  { id: '1.3', label: '特大' },
] as const;

const THEME_KEY = 'myStream.theme';
const SCALE_KEY = 'myStream.fontScale';

const DEFAULT_THEME: ThemeId = 'ink';
const DEFAULT_SCALE = '1';

/** layout.tsx 的預繪腳本也用同一組鍵，改鍵名時兩邊都要改 */
export const APPEARANCE_KEYS = { theme: THEME_KEY, scale: SCALE_KEY };

function isTheme(value: string): value is ThemeId {
  return THEMES.some((t) => t.id === value);
}

/** 字級只收登記過的值，避免有人手改 localStorage 把介面撐爆 */
function normalizeScale(value: string): string {
  return FONT_SCALES.some((s) => s.id === value) ? value : DEFAULT_SCALE;
}

export function useAppearance() {
  const rawTheme = useStored(THEME_KEY, DEFAULT_THEME);
  const theme: ThemeId = isTheme(rawTheme) ? rawTheme : DEFAULT_THEME;
  const scale = normalizeScale(useStored(SCALE_KEY, DEFAULT_SCALE));

  /**
   * 寫到 <html> 上。這裡是操作 DOM 不是 setState，所以不受
   * react-hooks/set-state-in-effect 限制；首次繪製前的套用由
   * layout.tsx 的行內腳本負責，避免每次開站閃一下預設主題。
   */
  useEffect(() => {
    const root = document.documentElement;
    if (theme === DEFAULT_THEME) root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    root.style.setProperty('--font-scale', scale);
  }, [theme, scale]);

  const saveTheme = useCallback((value: string) => {
    setStored(THEME_KEY, isTheme(value) ? value : DEFAULT_THEME);
  }, []);

  const saveScale = useCallback((value: string) => {
    setStored(SCALE_KEY, normalizeScale(value));
  }, []);

  return { theme, scale, saveTheme, saveScale };
}
