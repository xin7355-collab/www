'use client';

import { SearchResult } from '@/types/search';

/**
 * TMDB（The Movie Database）—— 電影與影集的資料來源。
 *
 * 為什麼值得接：目前電影／影集這半邊只靠 iTunes，中文標題常常缺、
 * 集數也不準。TMDB 有正式的繁中標題與海報、每季集數、首播日。
 *
 * 需要免費金鑰，CORS 全開所以瀏覽器直接打。金鑰跟 YouTube 那把一樣
 * 存在使用者自己的裝置，不進 bundle。
 */

const BASE = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p/w342';

/** 要正式的繁中片名，不是英文原名 */
const LANG = 'zh-TW';

export interface TmdbHit extends SearchResult {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
}

async function request(path: string, key: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ api_key: key, language: LANG, ...params }).toString();
  const res = await fetch(`${BASE}${path}?${qs}`);

  if (res.ok) return res.json();
  if (res.status === 401) throw new Error('TMDB 金鑰無效，請到設定重新填一次。');
  if (res.status === 429) throw new Error('TMDB 請求太頻繁，等幾秒再試。');
  throw new Error(`TMDB 錯誤（HTTP ${res.status}）`);
}

interface RawResult {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  origin_country?: string[];
}

/** TMDB 的國別碼轉成片庫的「國家」欄位值 */
function toCountry(codes: string[] = []): string {
  const map: Record<string, string> = {
    JP: '日本',
    KR: '韓國',
    CN: '大陸',
    TW: '台灣',
    US: '歐美',
    GB: '歐美',
    FR: '歐美',
    DE: '歐美',
    CA: '歐美',
  };
  for (const code of codes) {
    if (map[code]) return map[code];
  }
  return codes.length > 0 ? '其他' : '';
}

function normalize(raw: RawResult): TmdbHit | null {
  const mediaType = raw.media_type === 'tv' ? 'tv' : 'movie';
  const title = (mediaType === 'tv' ? raw.name : raw.title)?.trim() ?? '';
  if (!title) return null;

  const original = (mediaType === 'tv' ? raw.original_name : raw.original_title)?.trim() ?? '';
  const date = (mediaType === 'tv' ? raw.first_air_date : raw.release_date) ?? '';

  return {
    tmdbId: raw.id,
    mediaType,
    title,
    subtitle: [original !== title ? original : '', date.slice(0, 4)].filter(Boolean).join(' · '),
    cover: raw.poster_path ? `${IMG}${raw.poster_path}` : '',
    totalEp: '',
    mainType: mediaType === 'tv' ? '影集' : '電影',
    country: toCountry(raw.origin_country),
    url: `https://www.themoviedb.org/${mediaType}/${raw.id}`,
    source: 'TMDB',
  };
}

/**
 * @param kind 片庫分類；'電影' / '影集' 會限縮搜尋範圍，其餘用 multi
 */
export async function searchTmdb(key: string, keyword: string, kind: string): Promise<TmdbHit[]> {
  const query = keyword.trim();
  if (!query) return [];

  const path = kind === '電影' ? '/search/movie' : kind === '影集' ? '/search/tv' : '/search/multi';
  const data = (await request(path, key, { query, include_adult: 'false' })) as {
    results?: RawResult[];
  };

  return (data.results ?? [])
    // multi 也會回傳人物，那個對片庫沒有意義
    .filter((raw) => {
      if (path === '/search/movie') return true;
      if (path === '/search/tv') return true;
      return raw.media_type === 'movie' || raw.media_type === 'tv';
    })
    .map((raw) => {
      // 專屬端點不會帶 media_type，要自己補上才判斷得出電影或影集
      if (path === '/search/movie') return normalize({ ...raw, media_type: 'movie' });
      if (path === '/search/tv') return normalize({ ...raw, media_type: 'tv' });
      return normalize(raw);
    })
    .filter((hit): hit is TmdbHit => hit !== null)
    .slice(0, 8);
}

/** 影集的總集數要另外問一次；電影沒有集數，不用問 */
export async function fetchEpisodeCount(key: string, id: number): Promise<string> {
  const data = (await request(`/tv/${id}`, key)) as { number_of_episodes?: number };
  return data.number_of_episodes && data.number_of_episodes > 0
    ? String(data.number_of_episodes)
    : '';
}

