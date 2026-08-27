/**
 * 觀看連結解析器。
 *
 * 設計取捨（延續 FEATURE-watchUrl.md 的討論）：
 * 存的是「你當初貼上的整段網址」，渲染時才判斷型別。
 * gimy 這類會換網域的站，只存作品 ID，網域由 localStorage 的全域設定組回去，
 * 換網域時改一個地方，全部連結跟著更新。
 *
 * 支援哪些站由下面的 `SITES` 登記表決定 —— 要多支援一個站就加一列。
 */

import { Platform } from '@/types/media';

export type WatchKind =
  | 'youtube'   // 可內嵌播放
  | 'bilibili'  // 可內嵌播放
  | 'embed'     // 其他有公開內嵌播放器的站（Vimeo / Twitch / Archive…）
  | 'direct'    // mp4 / m3u8 等直鏈，用原生 <video> 播
  | 'gimy'      // 抽 ID + 全域網域重組，帶下一集，外開
  | 'external'  // 其他網址，原樣外開
  | 'none';     // 沒填

export interface ResolvedWatch {
  kind: WatchKind;
  /** 實際要前往 / 載入的網址 */
  url: string;
  /** 可內嵌時的 iframe 來源 */
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

/** 主網域比對：同時吃 `example.com` 與 `www.example.com` */
function host(...domains: string[]): RegExp {
  return new RegExp(`(^|\\.)(${domains.map((d) => d.replace(/\./g, '\\.')).join('|')})$`);
}

// ─── 各站的內嵌網址組法 ──────────────────────────────────────
//
// 回傳 null＝「網域對得上，但這個網址抽不出可內嵌的 ID」（例如站台首頁），
// 那就退回新分頁開啟，不會給一個一定播不出來的 iframe。

function youtubeId(u: URL): string | null {
  if (u.hostname === 'youtu.be') {
    return u.pathname.slice(1).split('/')[0] || null;
  }
  const v = u.searchParams.get('v');
  if (v) return v;
  const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
  return m ? m[1] : null;
}

function youtubeEmbed(u: URL): string | null {
  const id = youtubeId(u);
  if (!id) return null;

  const start = u.searchParams.get('t');
  const qs = start ? `?start=${Number.parseInt(start, 10) || 0}` : '';
  return `https://www.youtube-nocookie.com/embed/${id}${qs}`;
}

function bilibiliEmbed(u: URL): string | null {
  const m = u.pathname.match(/\/video\/(BV[0-9A-Za-z]+|av\d+)/i);
  if (!m) return null;

  const bv = m[1];
  const page = u.searchParams.get('p') || '1';
  const key = bv.toLowerCase().startsWith('bv') ? 'bvid' : 'aid';
  const value = key === 'aid' ? bv.replace(/^av/i, '') : bv;
  return `https://player.bilibili.com/player.html?${key}=${value}&page=${page}&high_quality=1&autoplay=0`;
}

function vimeoEmbed(u: URL): string | null {
  const parts = u.pathname.split('/').filter(Boolean);

  // 影片 ID 是路徑裡最後一段純數字：/123、/channels/xxx/123、/groups/x/videos/123 都吃得到
  let at = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/^\d+$/.test(parts[i])) {
      at = i;
      break;
    }
  }
  if (at < 0) return null;

  // 未公開影片的驗證雜湊：可能在 ID 後面一段，也可能在 ?h=
  const after = parts[at + 1];
  const hash = after && /^[0-9a-z]+$/i.test(after) ? after : u.searchParams.get('h');
  return `https://player.vimeo.com/video/${parts[at]}${hash ? `?h=${hash}` : ''}`;
}

function dailymotionEmbed(u: URL): string | null {
  const m = u.pathname.match(/^\/(?:embed\/)?video\/([a-z0-9]+)/i);
  const id = m ? m[1] : u.hostname === 'dai.ly' ? u.pathname.slice(1).split('/')[0] : '';
  return id ? `https://www.dailymotion.com/embed/video/${id}` : null;
}

/**
 * Twitch 播放器**強制**要求 parent 等於內嵌方的網域，值不對會整頁拒播。
 * 只能在瀏覽器裡取得 —— 但片庫資料是登入後才 fetch 的，
 * 這個函式不會在靜態產生階段跑到，不必擔心 hydration 對不起來。
 */
function twitchEmbed(u: URL): string | null {
  const parent = `parent=${typeof window === 'undefined' ? 'localhost' : window.location.hostname}`;

  const vod = u.pathname.match(/\/videos\/(\d+)/);
  if (vod) return `https://player.twitch.tv/?video=${vod[1]}&${parent}&autoplay=false`;

  const clipInPath = u.pathname.match(/\/clip\/([^/?#]+)/);
  const clip = clipInPath
    ? clipInPath[1]
    : u.hostname.startsWith('clips.') && u.pathname !== '/embed'
      ? u.pathname.split('/').filter(Boolean)[0]
      : '';
  if (clip) return `https://clips.twitch.tv/embed?clip=${clip}&${parent}`;

  const channel = u.pathname.split('/').filter(Boolean)[0];
  return channel ? `https://player.twitch.tv/?channel=${channel}&${parent}&autoplay=false` : null;
}

function nicovideoEmbed(u: URL): string | null {
  const m = u.pathname.match(/\/watch\/([a-z]{2}\d+|\d+)/i);
  return m ? `https://embed.nicovideo.jp/watch/${m[1]}` : null;
}

function archiveEmbed(u: URL): string | null {
  const m = u.pathname.match(/^\/(?:details|embed)\/([^/?#]+)/);
  return m ? `https://archive.org/embed/${m[1]}` : null;
}

function driveEmbed(u: URL): string | null {
  const m = u.pathname.match(/\/file\/d\/([^/?#]+)/);
  const id = m ? m[1] : u.searchParams.get('id');
  return id ? `https://drive.google.com/file/d/${id}/preview` : null;
}

function streamableEmbed(u: URL): string | null {
  const m = u.pathname.match(/^\/(?:e\/)?([a-z0-9]+)/i);
  return m ? `https://streamable.com/e/${m[1]}` : null;
}

// ─── 站點登記表 ──────────────────────────────────────────────

interface SiteRule {
  /** 對得上時自動填進「來源平台」，值域限定在 PLATFORMS 內，寫錯會被型別擋下 */
  platform: Platform;
  host: RegExp;
  /** 有 embed 才代表站內播得起來；沒有就是站方擋內嵌（DRM / X-Frame-Options），只能外開 */
  embed?: (u: URL) => string | null;
  /** 不給就是通用的 'embed' / 'external'；YouTube 與 BiliBili 保留自己的 kind */
  kind?: WatchKind;
}

/**
 * 由上往下比對，第一個網域對上的就贏。
 *
 * 有 `embed` 的站＝實測有公開內嵌播放器；
 * 沒有 `embed` 的站＝一律 DRM 或 `X-Frame-Options` 擋死，列在這裡純粹是為了
 * 認出平台名稱（自動填「來源平台」欄）並給一句準確的說明，不是要硬塞 iframe。
 */
const SITES: SiteRule[] = [
  // 能在站內播的
  { platform: 'YouTube', host: host('youtube.com', 'youtube-nocookie.com', 'youtu.be'), embed: youtubeEmbed, kind: 'youtube' },
  { platform: 'BiliBili', host: host('bilibili.com', 'b23.tv'), embed: bilibiliEmbed, kind: 'bilibili' },
  { platform: 'Vimeo', host: host('vimeo.com'), embed: vimeoEmbed },
  { platform: 'Dailymotion', host: host('dailymotion.com', 'dai.ly'), embed: dailymotionEmbed },
  { platform: 'Twitch', host: host('twitch.tv'), embed: twitchEmbed },
  { platform: 'niconico', host: host('nicovideo.jp', 'nico.ms'), embed: nicovideoEmbed },
  { platform: 'Internet Archive', host: host('archive.org'), embed: archiveEmbed },
  { platform: 'Google Drive', host: host('drive.google.com'), embed: driveEmbed },
  { platform: 'Streamable', host: host('streamable.com'), embed: streamableEmbed },

  // 認得出平台、但只能外開（DRM 或站方擋內嵌）
  { platform: 'Netflix', host: host('netflix.com') },
  { platform: 'Disney+', host: host('disneyplus.com') },
  { platform: 'Prime Video', host: host('primevideo.com') },
  { platform: 'Max', host: host('max.com', 'hbomax.com') },
  { platform: 'Apple TV+', host: host('tv.apple.com') },
  { platform: 'CATCHPLAY+', host: host('catchplay.com') },
  { platform: 'KKTV', host: host('kktv.me', 'kktv.com.tw') },
  { platform: 'LINE TV', host: host('linetv.tw') },
  { platform: 'LiTV', host: host('litv.tv') },
  { platform: 'MyVideo', host: host('myvideo.net.tw') },
  { platform: 'Fridays影音', host: host('video.friday.tw') },
  { platform: 'Hami Video', host: host('hamivideo.hinet.net') },
  { platform: 'IQiyi', host: host('iqiyi.com', 'iq.com') },
  { platform: 'Viu', host: host('viu.com') },
  { platform: 'WeTV', host: host('wetv.vip') },
  { platform: '巴哈姆特動畫瘋', host: host('ani.gamer.com.tw') },
  { platform: 'Crunchyroll', host: host('crunchyroll.com') },
];

function matchSite(u: URL): SiteRule | undefined {
  return SITES.find((s) => s.host.test(u.hostname));
}

function parse(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    // 不是合法網址就不給按鈕，避免點了開出一個空白分頁
    return null;
  }
  return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
}

/**
 * @param watchUrl 使用者存的原始網址
 * @param progress 目前進度（用來推算 gimy 的下一集）
 * @param gimyDomain 全域 gimy 網域設定
 */
/**
 * 這筆實際要開的網址。
 *
 * 沒填觀看連結時退回備註裡的來源頁 —— 小說與漫畫從搜尋加進來時本來就
 * 沒有可播的連結，只有一行「資料來源：…」。與其給一顆按不下去的
 * 「無連結」，不如讓它至少開得到作品頁。
 *
 * 只認 http(s)，而且取第一個 —— 備註是自由文字，使用者可能寫了好幾個網址，
 * 猜不出哪個才是他要的就用最前面那個。
 */
export function watchUrlOf(item: { watchUrl: string; note: string }): string {
  const direct = (item.watchUrl || '').trim();
  if (direct) return direct;
  return item.note.match(/https?:\/\/[^\s"'<>）)]+/)?.[0] ?? '';
}

export function resolveWatch(
  watchUrl: string,
  progress: string,
  gimyDomain: string = DEFAULT_GIMY_DOMAIN,
): ResolvedWatch {
  const raw = (watchUrl || '').trim();
  if (!raw) return NONE;

  const u = parse(raw);
  if (!u) return NONE;

  // 直鏈優先於站點登記表：archive.org 之類同時提供頁面與 .mp4 下載點，
  // 抓得到檔案就直接用原生播放器（能記進度），比內嵌好用
  if (DIRECT_EXT.test(u.pathname)) {
    return {
      kind: 'direct',
      url: raw,
      inApp: true,
      icon: '▶',
      hint: '影片直鏈 — 站內播放器，會記住播到幾分幾秒',
    };
  }

  const site = matchSite(u);
  if (site) {
    const embedUrl = site.embed?.(u) ?? null;
    if (embedUrl) {
      return {
        kind: site.kind ?? 'embed',
        url: raw,
        embedUrl,
        inApp: true,
        icon: '▶',
        hint: `${site.platform} — 可在站內播放`,
      };
    }
    return {
      kind: 'external',
      url: raw,
      inApp: false,
      icon: '↗',
      hint: site.embed
        ? `${site.platform} — 這個網址抽不出影片 ID，於新分頁開啟`
        : `${site.platform} — 站方不允許內嵌，於新分頁開啟`,
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

/**
 * 從觀看連結推導一張封面圖。
 *
 * 只收「網址本身就算得出來」的站 —— 這些平台的縮圖網址是純字串規則，
 * 不需要 API key、不需要跨域請求，所以靜態站也能用。
 * 需要打 API 才拿得到縮圖的站（BiliBili、Vimeo）一律不猜，回空字串，
 * 讓卡片退回顯示片名首字，比壞掉的圖好。
 */
export function deriveCover(watchUrl: string): string {
  const u = parse((watchUrl || '').trim());
  if (!u) return '';

  if (host('youtube.com', 'youtube-nocookie.com', 'youtu.be').test(u.hostname)) {
    const id = youtubeId(u);
    return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '';
  }

  if (host('dailymotion.com', 'dai.ly').test(u.hostname)) {
    const m = u.pathname.match(/^\/(?:embed\/)?video\/([a-z0-9]+)/i);
    const id = m ? m[1] : u.hostname === 'dai.ly' ? u.pathname.slice(1).split('/')[0] : '';
    return id ? `https://www.dailymotion.com/thumbnail/video/${id}` : '';
  }

  if (host('archive.org').test(u.hostname)) {
    const m = u.pathname.match(/^\/(?:details|embed)\/([^/?#]+)/);
    return m ? `https://archive.org/services/img/${m[1]}` : '';
  }

  return '';
}

/**
 * 從網址認出來源平台，給表單自動填「來源平台」欄用。
 * 認不出來就回空字串 —— 寧可留白讓人自己選，也不要塞一個猜的值。
 */
export function detectPlatform(watchUrl: string): Platform | '' {
  const u = parse((watchUrl || '').trim());
  if (!u) return '';

  if (DIRECT_EXT.test(u.pathname)) return '自架 / 直鏈';
  const site = matchSite(u);
  if (site) return site.platform;
  if (/gimy|ttkan|gimys/i.test(u.hostname)) return '其他';
  return '';
}

/** 新增 / 編輯表單即時回饋用：不需要 progress 也能給說明 */
export function describeUrl(watchUrl: string, gimyDomain?: string): string {
  const r = resolveWatch(watchUrl, '0', gimyDomain);
  if (r.kind === 'none') {
    return watchUrl.trim() ? '看不懂這個網址，請確認有沒有含 https://' : '';
  }
  return r.hint;
}
