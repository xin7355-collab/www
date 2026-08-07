/**
 * 觀看連結解析器。
 *
 * 設計取捨（延續 FEATURE-watchUrl.md 的討論）：
 * 存的是「你當初貼上的整段網址」，渲染時才判斷型別。
 * gimy 這類會換網域的站，只存作品 ID，網域由 localStorage 的全域設定組回去，
 * 換網域時改一個地方，全部連結跟著更新。
 */

export type WatchKind =
  | 'youtube'   // 可內嵌播放
  | 'bilibili'  // 可內嵌播放
  | 'direct'    // mp4 / m3u8 等直鏈，用原生 <video> 播
  | 'gimy'      // 抽 ID + 全域網域重組，帶下一集，外開
  | 'external'  // 其他網址，原樣外開
  | 'none';     // 沒填

export interface ResolvedWatch {
  kind: WatchKind;
  /** 實際要前往 / 載入的網址 */
  url: string;
  /** kind 為 youtube / bilibili 時的 iframe 來源 */
  embedUrl?: string;
  /** 能否在站內播放器直接播 */
  inApp: boolean;
  /** 按鈕上的圖示 */
  icon: string;
  /** 給使用者看的一句話說明 */
  hint: string;
}

export const DEFAULT_GIMY_DOMAIN = 'https://gimy01.co';

const NONE: ResolvedWatch = {
  kind: 'none',
  url: '',
  inApp: false,
  icon: '',
  hint: '',
};

const GIMY_ID = /\/(?:vod|eps)\/(\d+)(?:[-.])/;
const DIRECT_EXT = /\.(mp4|webm|ogg|ogv|m3u8|mov|m4v)(\?|#|$)/i;

/** 下一集集數：progress 是「目前看到第幾集」，所以下一集是 +1 */
function nextEpisode(progress: string): number {
  const n = Number.parseInt(String(progress).replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) && n >= 0 ? n + 1 : 1;
}

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, '');
}

function youtubeId(u: URL): string | null {
  if (u.hostname === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0];
    return id || null;
  }
  if (!/(^|\.)youtube(-nocookie)?\.com$/.test(u.hostname)) return null;

  const v = u.searchParams.get('v');
  if (v) return v;

  const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
  return m ? m[1] : null;
}

function bilibiliId(u: URL): string | null {
  if (!/(^|\.)bilibili\.com$/.test(u.hostname)) return null;
  const m = u.pathname.match(/\/video\/(BV[0-9A-Za-z]+|av\d+)/i);
  return m ? m[1] : null;
}

/**
 * @param watchUrl 使用者存的原始網址
 * @param progress 目前進度（用來推算 gimy 的下一集）
 * @param gimyDomain 全域 gimy 網域設定
 */
export function resolveWatch(
  watchUrl: string,
  progress: string,
  gimyDomain: string = DEFAULT_GIMY_DOMAIN,
): ResolvedWatch {
  const raw = (watchUrl || '').trim();
  if (!raw) return NONE;

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    // 不是合法網址就不給按鈕，避免點了開出一個空白分頁
    return NONE;
  }

  if (u.protocol !== 'http:' && u.protocol !== 'https:') return NONE;

  const yt = youtubeId(u);
  if (yt) {
    const start = u.searchParams.get('t');
    const qs = new URLSearchParams();
    if (start) qs.set('start', String(Number.parseInt(start, 10) || 0));
    const suffix = qs.toString() ? `?${qs}` : '';
    return {
      kind: 'youtube',
      url: raw,
      embedUrl: `https://www.youtube-nocookie.com/embed/${yt}${suffix}`,
      inApp: true,
      icon: '▶',
      hint: 'YouTube — 可在站內播放',
    };
  }

  const bv = bilibiliId(u);
  if (bv) {
    const page = u.searchParams.get('p') || '1';
    const key = bv.toLowerCase().startsWith('bv') ? 'bvid' : 'aid';
    const value = key === 'aid' ? bv.replace(/^av/i, '') : bv;
    return {
      kind: 'bilibili',
      url: raw,
      embedUrl: `https://player.bilibili.com/player.html?${key}=${value}&page=${page}&high_quality=1&autoplay=0`,
      inApp: true,
      icon: '▶',
      hint: 'BiliBili — 可在站內播放',
    };
  }

  if (DIRECT_EXT.test(u.pathname)) {
    return {
      kind: 'direct',
      url: raw,
      inApp: true,
      icon: '▶',
      hint: '影片直鏈 — 站內播放器，會記住播到幾分幾秒',
    };
  }

  const gimy = raw.match(GIMY_ID);
  if (gimy && /gimy|ttkan|gimys/i.test(u.hostname)) {
    const id = gimy[1];
    const ep = nextEpisode(progress);
    return {
      kind: 'gimy',
      url: `${stripTrailingSlash(gimyDomain)}/eps/${id}-1-${ep}.html`,
      inApp: false,
      icon: '↗',
      hint: `已識別 ID ${id} — 開啟時自動跳到第 ${ep} 集`,
    };
  }

  return {
    kind: 'external',
    url: raw,
    inApp: false,
    icon: '↗',
    hint: '外部連結 — 於新分頁開啟（不帶集數）',
  };
}

/** 新增 / 編輯表單即時回饋用：不需要 progress 也能給說明 */
export function describeUrl(watchUrl: string, gimyDomain?: string): string {
  const r = resolveWatch(watchUrl, '0', gimyDomain);
  if (r.kind === 'none') {
    return watchUrl.trim() ? '看不懂這個網址，請確認有沒有含 https://' : '';
  }
  return r.hint;
}
