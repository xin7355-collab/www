'use client';

import { SearchResult } from '@/types/search';

/**
 * MangaDex —— 漫畫的資料來源。
 *
 * 為什麼接它：漫畫分類原本只有 Bangumi，而 Bangumi 的書籍條目幾乎不填話數，
 * 等於沒有進度分母。MangaDex 有 `lastChapter`，追連載漫畫才知道差幾話。
 *
 * 免金鑰、CORS 全開，瀏覽器直接打。它有速率限制（約每秒 5 次），
 * 但一次搜尋只打一支請求，碰不到。
 */

const BASE = 'https://api.mangadex.org';
const COVERS = 'https://uploads.mangadex.org/covers';

interface RawManga {
  id: string;
  attributes?: {
    title?: Record<string, string>;
    altTitles?: Record<string, string>[];
    year?: number | null;
    status?: string;
    lastChapter?: string | null;
    originalLanguage?: string;
  };
  relationships?: { type?: string; attributes?: { fileName?: string } }[];
}

/**
 * 挑一個看得懂的標題。
 * MangaDex 的標題是 { en: ..., ja: ... } 這種多語字典，中文常常只出現在
 * altTitles 裡，所以兩邊都要找。
 */
function pickTitle(attrs: RawManga['attributes']): { title: string; original: string } {
  const main = attrs?.title ?? {};
  const alts = attrs?.altTitles ?? [];

  const chinese =
    findLang(main, ['zh-hk', 'zh']) ??
    alts.map((alt) => findLang(alt, ['zh-hk', 'zh'])).find(Boolean) ??
    '';

  const english = findLang(main, ['en']) ?? '';
  const japanese = findLang(main, ['ja', 'ja-ro']) ?? alts.map((a) => findLang(a, ['ja'])).find(Boolean) ?? '';
  const fallback = Object.values(main)[0] ?? '';

  const title = chinese || english || japanese || fallback;
  // 副標題放另一個語言的名字，方便確認是不是同一部
  const original = [english, japanese].find((name) => name && name !== title) ?? '';
  return { title, original };
}

function findLang(dict: Record<string, string>, langs: string[]): string | undefined {
  for (const lang of langs) {
    if (dict[lang]) return dict[lang];
  }
  return undefined;
}

const COUNTRY: Record<string, string> = { ja: '日本', ko: '韓國', zh: '大陸', 'zh-hk': '台灣', en: '歐美' };

export async function searchMangaDex(keyword: string): Promise<SearchResult[]> {
  const query = keyword.trim();
  if (!query) return [];

  const params = new URLSearchParams({ title: query, limit: '8' });
  // 陣列參數要重複帶同一個 key，URLSearchParams 沒辦法用物件一次表達
  params.append('includes[]', 'cover_art');
  params.append('contentRating[]', 'safe');
  params.append('contentRating[]', 'suggestive');

  const res = await fetch(`${BASE}/manga?${params.toString()}`);
  if (!res.ok) throw new Error(`MangaDex 搜尋失敗（HTTP ${res.status}）`);

  const json = (await res.json()) as { data?: RawManga[] };

  return (json.data ?? [])
    .map((manga): SearchResult | null => {
      const { title, original } = pickTitle(manga.attributes);
      if (!title) return null;

      const cover = manga.relationships?.find((rel) => rel.type === 'cover_art')?.attributes?.fileName;
      const last = manga.attributes?.lastChapter ?? '';
      const year = manga.attributes?.year;

      return {
        title,
        subtitle: [original, year ? String(year) : ''].filter(Boolean).join(' · '),
        // 256 寬的縮圖版本，卡片用綽綽有餘也省流量
        cover: cover ? `${COVERS}/${manga.id}/${cover}.256.jpg` : '',
        // lastChapter 是「最新一話」，對連載中的作品就是目前的分母
        totalEp: last && Number.parseFloat(last) > 0 ? last : '',
        mainType: '漫畫',
        country: COUNTRY[manga.attributes?.originalLanguage ?? ''] ?? '',
        url: `https://mangadex.org/title/${manga.id}`,
        source: 'MangaDex',
      };
    })
    .filter((r): r is SearchResult => r !== null);
}
