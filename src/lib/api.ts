import { MediaPatch, NewMediaItem } from '@/types/media';

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

export const deleteItem = (sheet: string, row: number) =>
  post({ action: 'deleteItem', sheet, row });
