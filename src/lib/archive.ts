'use client';

import { SearchResult } from '@/types/search';

/**
 * Internet Archive —— 公共領域的影片。
 *
 * 為什麼特別值得接：它是唯一一個搜尋結果**能直接拿到影片檔網址**的公開來源。
 * 我們的播放器對直鏈支援最好 —— 站內播、記播放進度、片頭片尾標記全都有，
 * 內嵌 iframe 那些一樣也做不到。
 *
 * 免金鑰、CORS 全開。搜尋與「找出影片檔」是兩支 API：
 * 搜尋一次就好，影片檔只在使用者真的要加入時才查。
 */

const SEARCH = 'https://archive.org/advancedsearch.php';
const DOWNLOAD = 'https://archive.org/download';

interface RawDoc {
  identifier?: string;
  title?: string | string[];
  year?: string | number;
  creator?: string | string[];
}

const first = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? '') : (value ?? '');

export async function searchArchive(keyword: string): Promise<SearchResult[]> {
  const query = keyword.trim();
  if (!query) return [];

  const params = new URLSearchParams({
    // 限定影片，否則會混進大量音檔、書掃描與網頁存檔
    q: `title:(${query}) AND mediatype:(movies)`,
    rows: '8',
    page: '1',
    output: 'json',
  });
  for (const field of ['identifier', 'title', 'year', 'creator']) {
    params.append('fl[]', field);
  }

  const res = await fetch(`${SEARCH}?${params.toString()}`);
  if (!res.ok) throw new Error(`Internet Archive 搜尋失敗（HTTP ${res.status}）`);

  const json = (await res.json()) as { response?: { docs?: RawDoc[] } };

  return (json.response?.docs ?? [])
    .map((doc): SearchResult | null => {
      const id = doc.identifier;
      const title = first(doc.title);
      if (!id || !title) return null;

      return {
        title,
        subtitle: [first(doc.creator), doc.year ? String(doc.year) : ''].filter(Boolean).join(' · '),
        cover: `https://archive.org/services/img/${id}`,
        totalEp: '',
        mainType: '電影',
        country: '',
        url: `https://archive.org/details/${id}`,
        source: 'Internet Archive',
        archiveId: id,
        // 先給詳情頁；按下「加入」時才換成直鏈（見 resolveVideoUrl）
        watchUrl: `https://archive.org/details/${id}`,
      };
    })
    .filter((r): r is SearchResult => r !== null);
}

interface RawFile {
  name?: string;
  format?: string;
}

/** 越前面越優先。h.264 相容性最好，其次才是其他 mp4 變體 */
const FORMAT_RANK = ['h.264', 'mpeg4', '512kb mpeg4', 'h.264 ia'];

/**
 * 找出這個項目底下最適合播的影片檔，回傳直鏈。
 *
 * 為什麼值得多打這一次：拿到直鏈之後，這部片在片庫裡就享有原生播放器的
 * 全部能力（記進度、跳片頭、鎖定畫面控制）；只給 details 頁的話就只是
 * 一個內嵌 iframe。找不到就退回詳情頁，不會變成壞連結。
 */
export async function resolveVideoUrl(identifier: string): Promise<string> {
  const res = await fetch(`https://archive.org/metadata/${identifier}`);
  if (!res.ok) return `https://archive.org/details/${identifier}`;

  const json = (await res.json()) as { files?: RawFile[] };
  const files = (json.files ?? []).filter((f) => f.name && /\.(mp4|m4v|webm|ogv)$/i.test(f.name));
  if (files.length === 0) return `https://archive.org/details/${identifier}`;

  const best =
    files
      .map((f) => ({ f, rank: FORMAT_RANK.indexOf((f.format ?? '').toLowerCase()) }))
      .filter((x) => x.rank >= 0)
      .sort((a, b) => a.rank - b.rank)[0]?.f ?? files[0];

  // 檔名可能含空白或中文，一定要編碼，否則 <video> 會載不到
  return `${DOWNLOAD}/${identifier}/${encodeURIComponent(best.name!)}`;
}
