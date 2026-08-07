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

async function parse(res: Response): Promise<unknown> {
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    // GAS 未部署 / 權限不對時會回一整頁 HTML
    throw new ApiError('後端回應不是 JSON，請確認 Apps Script 已部署且存取權為「任何人」');
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
