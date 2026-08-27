import { searchArchive } from './archive';
import { searchBangumi } from './bangumi';
import { searchMangaDex } from './mangadex';
import { searchTmdb } from './tmdb';
import { searchVideos, toSearchResult, withDurations } from './youtube';
import { loadConverter } from './s2t';
import { MediaPatch, NewMediaItem } from '@/types/media';
import { SearchResult } from '@/types/search';

const URL_BASE = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL || '';

export class ApiError extends Error {}

function requireUrl(): string {
  if (!URL_BASE) {
    throw new ApiError('尚未設定 NEXT_PUBLIC_APPS_SCRIPT_URL，請參考 README 建立 .env.local');
  }
  return URL_BASE;
}

export const isConfigured = () => Boolean(URL_BASE);

/**
 * 遮蔽後的後端網址，給診斷畫面顯示用。
 * 那串 ID 等於資料庫密碼，只留頭尾讓人能比對「是不是我以為的那一組」。
 */
export function maskedUrl(): string {
  if (!URL_BASE) return '（未設定）';
  return URL_BASE.replace(/\/s\/([^/]+)\//, (_, id: string) =>
    id.length > 14 ? `/s/${id.slice(0, 8)}…${id.slice(-4)}/` : '/s/…/',
  );
}

/** 回應不是 JSON 時，把實際收到的東西濃縮成一句能行動的診斷 */
function diagnose(res: Response, text: string): string {
  const body = text.trim();

  if (res.status === 401 || res.status === 403) {
    return `後端拒絕存取（HTTP ${res.status}）。Apps Script 部署時的「具有存取權的使用者」要選「任何人」。`;
  }
  if (res.status === 404) {
    return `找不到這個後端（HTTP 404）。部署網址可能已失效 —— 回 Apps Script「部署 > 管理部署」確認，或重新產生一組 /exec 網址。`;
  }
  if (/<title>\s*(錯誤|Error)/i.test(body) || /Google Drive|Google 雲端硬碟/i.test(body)) {
    return '後端回了一頁 Google 錯誤頁。多半是部署網址填錯（少一段、多了空白），或該部署已被刪除。';
  }
  if (/accounts\.google\.com|ServiceLogin|請登入|Sign in/i.test(body)) {
    return '後端把你導去 Google 登入頁 —— 代表存取權不是「任何人」。回 Apps Script「部署 > 管理部署 > 編輯」改成「任何人」，並選「版本：全新版本」重新部署。';
  }
  if (!body) {
    return `後端回了空白內容（HTTP ${res.status}）。`;
  }
  return `後端回應不是 JSON（HTTP ${res.status}）。開頭是：${body.slice(0, 80)}`;
}

async function parse(res: Response): Promise<unknown> {
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ApiError(diagnose(res, text));
  }
  if (data && typeof data === 'object' && 'error' in data) {
    throw new ApiError(String((data as { error: unknown }).error));
  }
  return data;
}

async function get(params: Record<string, string>): Promise<unknown> {
  const qs = new URLSearchParams(params).toString();
  return parse(await fetch(`${requireUrl()}?${qs}`));
}

/**
 * GAS 的 doPost 不接受帶 preflight 的請求，
 * 所以刻意不設 Content-Type，讓瀏覽器送 text/plain 走簡單請求。
 */
async function post(body: Record<string, unknown>): Promise<unknown> {
  return parse(
    await fetch(requireUrl(), {
      method: 'POST',
      redirect: 'follow',
      body: JSON.stringify(body),
    }),
  );
}

// ─── 診斷 ─────────────────────────────────────────────────────

export interface Probe {
  ok: boolean;
  /** 一句話結論 */
  summary: string;
  /** 實際收到的東西，給看得懂的人自己判斷 */
  detail: string;
}

/**
 * 測試後端連線 —— 把「打不通」拆成看得出下一步的訊息。
 * 這是設定畫面那顆「測試連線」按鈕的後端。
 */
/**
 * 連不通時才補上的格式提示。
 * 刻意不當成前置檢查 —— 只要實際打得通就沒有挑剔格式的道理
 * （本機用 mock 後端驗流程時，網址本來就不會長得像 GAS）。
 */
function formatAdvice(): string {
  const advice: string[] = [];
  if (URL_BASE.trim() !== URL_BASE) {
    advice.push('網址前後有多餘空白 —— 重填一次建置變數，別把空白或引號一起貼進去。');
  }
  if (URL_BASE.endsWith('/dev')) {
    advice.push('網址結尾是 /dev，那是測試網址、只有你本人登入時能用。要改用 /exec 那一組。');
  } else if (!URL_BASE.endsWith('/exec')) {
    advice.push('正確的網址結尾應該是 /exec。');
  }
  if (!/^https:\/\/script\.google\.com\/macros\/s\//.test(URL_BASE)) {
    advice.push(`正確格式是 https://script.google.com/macros/s/{一長串ID}/exec，目前是 ${maskedUrl()}。`);
  }
  return advice.length ? `\n\n可能原因：\n・${advice.join('\n・')}` : '';
}

export async function probe(): Promise<Probe> {
  if (!URL_BASE) {
    return {
      ok: false,
      summary: '沒有設定後端網址',
      detail: '這個站在建置時沒有拿到 NEXT_PUBLIC_APPS_SCRIPT_URL。要在部署平台的「建置變數」設定它，設完必須重新建置一次才會生效。',
    };
  }

  let res: Response;
  try {
    res = await fetch(`${URL_BASE}?action=getSheets`);
  } catch {
    return {
      ok: false,
      summary: '連不上後端',
      detail: `瀏覽器發不出請求 —— 可能是沒有網路，或網址本身有問題。${formatAdvice()}`,
    };
  }

  const text = await res.text();
  try {
    const data = JSON.parse(text);
    if (Array.isArray(data)) {
      return {
        ok: true,
        summary: `連線正常，讀到 ${data.length} 個帳號`,
        detail: data.length ? `帳號：${data.join('、')}` : '後端是通的，只是還沒有任何帳號分頁。',
      };
    }
    return { ok: false, summary: '後端回了非預期的格式', detail: text.slice(0, 200) };
  } catch {
    return { ok: false, summary: '後端回應不是 JSON', detail: diagnose(res, text) + formatAdvice() };
  }
}

// ─── 網址中繼資料 ─────────────────────────────────────────────

export interface UrlMeta {
  title: string;
  cover: string;
  totalEp: string;
  platform: string;
  mainType?: string;
  /** 連載中的番劇最新到第幾話 */
  latestEp?: string;
  episodes?: { index: string; title: string; url: string }[];
}

/**
 * 請後端去抓這個網址的名稱、封面、總集數。
 *
 * 為什麼繞後端：瀏覽器不允許跨域讀別人的網頁，靜態站自己做不到；
 * Apps Script 跑在 Google 那邊，沒有這個限制。
 */
export async function fetchMeta(url: string): Promise<UrlMeta> {
  const data = await get({ action: 'fetchMeta', url });

  // 舊版腳本不認得這個 action，會掉進「讀取分頁」的預設分支回一個二維陣列。
  // 不特別擋的話，使用者只會看到莫名其妙的「格式異常」。
  if (Array.isArray(data)) {
    throw new ApiError(
      '後端腳本是舊版，還不會抓網址資訊。請把新版 apps-script-code.gs 貼進 Apps Script，再「部署 > 管理部署 > 編輯 > 版本：全新版本」重新發佈。',
    );
  }

  const meta = data as Partial<UrlMeta>;
  if (!meta || typeof meta.title !== 'string' || !meta.title) {
    throw new ApiError('後端沒有回傳可用的標題');
  }

  return {
    title: meta.title,
    cover: meta.cover ?? '',
    totalEp: meta.totalEp ?? '',
    platform: meta.platform ?? '',
    mainType: meta.mainType ?? '',
    latestEp: meta.latestEp ?? '',
    episodes: Array.isArray(meta.episodes) ? meta.episodes : [],
  };
}

// ─── 作品搜尋 ─────────────────────────────────────────────────

/**
 * 在片庫裡直接查作品資料，不必先跑去別的網站。
 *
 * 兩條路併行，因為兩邊的限制不同：
 * - **Bangumi 走瀏覽器直打** —— 它 CORS 全開，繞後端只是多一個故障點，
 *   而且改一次就要重新部署。動畫、日韓歐美劇、漫畫、小說它都涵蓋
 * - **iTunes 走後端** —— 它不給 CORS 標頭，瀏覽器讀不到回應。
 *   歐美電影的覆蓋率比 Bangumi 好，值得留著
 *
 * 用 allSettled 而不是 all：舊版 Apps Script 不認得 search，
 * 那一路必定失敗 —— 但 Bangumi 那路照樣有結果，不該被拖著一起死。
 */
export async function searchWorks(
  q: string,
  kind: string,
  keys: { tmdbKey?: string; youtubeKey?: string } = {},
): Promise<SearchResult[]> {
  const keyword = q.trim();
  if (!keyword) throw new Error('請輸入要搜尋的關鍵字');

  const tmdbKey = keys.tmdbKey?.trim() ?? '';
  const youtubeKey = keys.youtubeKey?.trim() ?? '';

  // TMDB 只補電影與影集
  const wantFilm = !kind || kind === '電影' || kind === '影集';

  // 後端有兩份資料是瀏覽器拿不到的：iTunes（沒 CORS）與 Google Books。
  // 前者補電影影集，後者補小說漫畫 —— 兩種分類都要問，不能只看 wantFilm
  const wantBackend = wantFilm || kind === '小說' || kind === '漫畫';

  // MangaDex 補漫畫的話數（Bangumi 的書籍條目幾乎不填）
  const wantManga = !kind || kind === '漫畫';
  // Internet Archive 的結果能拿到影片直鏈，是唯一能站內播又記進度的來源
  const wantArchive = !kind || kind === '電影';
  // YouTube 查的是實際的影片，不是作品資料 —— 小說漫畫用不到，別白花額度
  const wantYouTube = Boolean(youtubeKey) && kind !== '小說' && kind !== '漫畫';

  const settled = await Promise.allSettled([
    wantFilm && tmdbKey ? searchTmdb(tmdbKey, keyword, kind) : none(),
    searchBangumi(keyword, kind),
    wantManga ? searchMangaDex(keyword) : none(),
    wantArchive ? searchArchive(keyword) : none(),
    wantBackend ? searchViaBackend(keyword, kind) : none(),
    wantYouTube ? searchYouTube(youtubeKey, keyword) : none(),
  ]);

  // 順序＝品質順序：TMDB 的繁中資料最完整，後端那份（iTunes / Google Books）墊底
  const results = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));

  if (results.length > 0) return traditionalize(results);

  // 全都沒結果時，把真正的失敗原因講出來，而不是一句「查無結果」
  const failure = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failure) {
    throw failure.reason instanceof Error ? failure.reason : new ApiError(String(failure.reason));
  }
  throw new ApiError('查無結果，換個關鍵字或改用原文名稱試試');
}

const none = () => Promise.resolve<SearchResult[]>([]);

/** 長度是第二次請求補上的（search 100 單位、videos 只要 1），不要為了省一次請求拿掉 */
async function searchYouTube(key: string, keyword: string): Promise<SearchResult[]> {
  const page = await searchVideos(key, keyword);
  return (await withDurations(key, page.items)).map(toSearchResult);
}

/**
 * 各來源的中文品質不一：Bangumi 是簡體站，MangaDex 的 zh 條目多半也是簡體，
 * 不轉的話片庫會同時出現「凡人修仙传」與「凡人修仙傳」。統一在這裡轉，
 * 因為使用者按「加入」時存進 Sheet 的就是這個標題。
 *
 * 已經是繁體的原樣通過，所以 TMDB 那份正式繁中片名不受影響。
 * 字典載不起來時退回原文 —— 標題是簡體總比整個搜尋掛掉好。
 */
async function traditionalize(results: SearchResult[]): Promise<SearchResult[]> {
  try {
    const convert = await loadConverter();
    return results.map((r) => ({ ...r, title: convert(r.title), subtitle: convert(r.subtitle) }));
  } catch {
    return results;
  }
}

/** 後端的搜尋：補瀏覽器拿不到的 iTunes 與 Google Books */
async function searchViaBackend(q: string, kind: string): Promise<SearchResult[]> {
  const data = await get({ action: 'search', q, kind });

  // 舊版腳本不認得 search，會掉進「讀取分頁」的預設分支回二維陣列
  if (Array.isArray(data) && data.some((x) => Array.isArray(x))) {
    throw new ApiError(
      '後端腳本是舊版，還不會搜尋。請把新版 apps-script-code.gs 貼進 Apps Script，再「部署 > 管理部署 > 編輯 > 版本：全新版本」重新發佈。',
    );
  }
  if (!Array.isArray(data)) throw new ApiError('搜尋結果格式異常');

  return (data as Partial<SearchResult>[])
    .map((r) => ({
      title: r.title ?? '',
      subtitle: r.subtitle ?? '',
      cover: r.cover ?? '',
      totalEp: r.totalEp ?? '',
      mainType: r.mainType ?? '',
      country: r.country ?? '',
      url: r.url ?? '',
      source: r.source ?? '',
    }))
    // 只濾掉後端那份 Bangumi —— 瀏覽器自己會直打，留著會變成兩份一樣的結果。
    // Apple 與 Google Books 沒有 CORS，只有後端拿得到，不能丟
    .filter((r) => r.title && r.source !== 'Bangumi');
}

// ─── 排程觸發器 ───────────────────────────────────────────────

/**
 * 請後端安裝「每天早上更新播出排程」的觸發器。
 *
 * 為什麼放在 App 裡而不是叫使用者去 Apps Script 後台按：那個後台介面
 * 不好找，而且裝一次就好的事不該變成一份操作手冊。
 */
export async function installDailyTrigger(): Promise<string> {
  const data = await get({ action: 'setupTrigger' });
  if (Array.isArray(data)) {
    throw new ApiError(
      '後端腳本是舊版，還沒有排程更新功能。請貼上新版 apps-script-code.gs 並「部署 > 管理部署 > 編輯 > 版本：全新版本」重新發佈。',
    );
  }
  const res = data as { message?: string; removedOld?: number };
  return res.message ?? '已安裝';
}

/** 立刻跑一次排程更新，不用等到明天早上 */
export async function refreshSchedulesNow(): Promise<string> {
  const data = await get({ action: 'refreshSchedules' });
  if (Array.isArray(data)) {
    throw new ApiError(
      '後端腳本是舊版，還沒有排程更新功能。請貼上新版 apps-script-code.gs 並重新部署。',
    );
  }
  const res = data as { scanned?: number; updated?: number };
  return `掃描 ${res.scanned ?? 0} 筆，更新 ${res.updated ?? 0} 筆`;
}

// ─── 帳號 ─────────────────────────────────────────────────────

export async function fetchAccounts(): Promise<string[]> {
  const data = await get({ action: 'getSheets' });
  if (!Array.isArray(data)) throw new ApiError('帳號列表格式異常');
  if (data.length > 0 && Array.isArray(data[0])) {
    throw new ApiError(
      '偵測到 Google 腳本版本過舊。請貼上新版 apps-script-code.gs，再「部署 > 管理部署 > 編輯 > 版本：全新版本」重新發佈。',
    );
  }
  return data.filter((x): x is string => typeof x === 'string');
}

export const createAccount = (name: string) => post({ action: 'createSheet', name });

export const deleteAccount = (sheet: string) => post({ action: 'deleteAccount', sheet });

// ─── 作品 ─────────────────────────────────────────────────────

export async function fetchSheet(sheet: string): Promise<unknown[][]> {
  const data = await get({ action: 'getData', sheet });
  if (!Array.isArray(data)) throw new ApiError('資料格式異常');
  return data as unknown[][];
}

export async function addItem(sheet: string, item: NewMediaItem): Promise<number> {
  const res = (await post({ action: 'addItem', sheet, item })) as { rowNumber?: number };
  if (typeof res?.rowNumber !== 'number') throw new ApiError('新增成功但未取得列號，請重新整理');
  return res.rowNumber;
}

export const updateItem = (sheet: string, row: number, fields: MediaPatch) =>
  post({ action: 'updateItem', sheet, row, fields });

/**
 * 分頁要關了才發現還有沒送出的更新時，用 sendBeacon 補送。
 * 一般的 fetch 會隨著頁面卸載被中斷，beacon 不會。
 *
 * 字串 payload 會以 text/plain 送出 —— 剛好符合 GAS 的 doPost
 * 不接受 preflight 的限制，跟上面 post() 不設 Content-Type 是同一個理由。
 */
export function beaconUpdate(sheet: string, row: number, fields: MediaPatch): boolean {
  if (!URL_BASE || typeof navigator === 'undefined' || !navigator.sendBeacon) return false;
  return navigator.sendBeacon(URL_BASE, JSON.stringify({ action: 'updateItem', sheet, row, fields }));
}

export const deleteItem = (sheet: string, row: number) =>
  post({ action: 'deleteItem', sheet, row });
