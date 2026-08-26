'use client';

import { toSimplified } from './t2s';
import { SearchResult } from '@/types/search';

/**
 * Bangumi (bgm.tv) 搜尋 —— 由瀏覽器直接呼叫。
 *
 * 為什麼不繞後端：這支 API **CORS 全開、匿名可用、不需要金鑰**，
 * 繞 Apps Script 只是多一個故障點，而且每改一次就要重新部署。
 *
 * 為什麼選它：同一支 API 就涵蓋動畫、日韓歐美劇、漫畫與小說，
 * 而且中文命中率高。缺點是它是簡體站 —— 繁體關鍵字碰到字形差異大的字
 * （鑽/钻、靈/灵）會完全搜不到，所以送出前先轉成簡體。
 */

const SEARCH_URL = 'https://api.bgm.tv/v0/search/subjects?limit=12';

// Bangumi 的條目類型：1=書籍 2=動畫 6=三次元（日劇/歐美劇/陸劇…）
const BOOK = 1;
const ANIME = 2;
const REAL = 6;

/** 片庫分類 → 要問 Bangumi 哪些類型 */
const TYPES_FOR: Record<string, number[]> = {
  動漫: [ANIME],
  漫畫: [BOOK],
  小說: [BOOK],
  影集: [REAL],
  電影: [REAL],
};

/**
 * 相關度排序會把廣播劇、畫集之類的周邊排在本篇前面，
 * 這裡以「動畫 → 劇集 → 書籍」重新分層，同層維持原本的相關度順序。
 */
const TYPE_RANK: Record<number, number> = { [ANIME]: 0, [REAL]: 1, [BOOK]: 2 };

interface BangumiSubject {
  id: number;
  type: number;
  name?: string;
  name_cn?: string;
  date?: string;
  /** v0 搜尋回傳的是 image 字串，條目端點才給 images 物件，兩種都要吃 */
  image?: string;
  images?: { large?: string; common?: string; medium?: string };
  eps?: number;
  total_episodes?: number;
  /** 「TV」「剧场版」「漫画」「小说」之類的細分 */
  platform?: string;
}

const httpsify = (url: string) => url.replace(/^http:\/\//i, 'https://');

/** 書籍類要靠 platform 才分得出漫畫或小說；三次元則要分電影與影集 */
function categorize(subject: BangumiSubject): string {
  const platform = subject.platform ?? '';

  if (subject.type === ANIME) return '動漫';
  if (subject.type === BOOK) return /漫画|漫畫/.test(platform) ? '漫畫' : '小說';
  if (subject.type === REAL) return /剧场版|劇場版|电影|電影|movie/i.test(platform) ? '電影' : '影集';
  return '';
}

function normalize(subject: BangumiSubject): SearchResult | null {
  const name = subject.name_cn?.trim() || subject.name?.trim() || '';
  if (!name) return null;

  const original = subject.name?.trim() ?? '';
  const episodes = subject.total_episodes || subject.eps || 0;
  const images = subject.images ?? {};

  return {
    title: name,
    subtitle: [original !== name ? original : '', (subject.date ?? '').slice(0, 4)]
      .filter(Boolean)
      .join(' · '),
    cover: httpsify(subject.image || images.large || images.common || images.medium || ''),
    totalEp: episodes > 0 ? String(episodes) : '',
    mainType: categorize(subject),
    // 動畫與書籍條目以日本作品為大宗；三次元什麼國家都有，不猜
    country: subject.type === REAL ? '' : '日本',
    url: `https://bgm.tv/subject/${subject.id}`,
    source: 'Bangumi',
  };
}

/**
 * @param keyword 使用者輸入，繁體簡體都可以
 * @param kind 片庫分類；空字串代表不限
 */
export async function searchBangumi(keyword: string, kind: string): Promise<SearchResult[]> {
  const query = keyword.trim();
  if (!query) return [];

  const types = TYPES_FOR[kind] ?? [ANIME, REAL, BOOK];

  const res = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword: toSimplified(query), filter: { type: types } }),
  });

  if (!res.ok) throw new Error(`Bangumi 搜尋失敗（HTTP ${res.status}）`);

  const json: unknown = await res.json();
  const list = (json as { data?: BangumiSubject[] })?.data ?? [];

  const results = list
    .map((subject) => ({ subject, normalized: normalize(subject) }))
    .filter((x): x is { subject: BangumiSubject; normalized: SearchResult } => Boolean(x.normalized))
    // 分層排序要穩定，所以比較的是「原本的名次」而不是重新洗牌
    .map((x, index) => ({ ...x, index }))
    .sort((a, b) => {
      const rank = (TYPE_RANK[a.subject.type] ?? 9) - (TYPE_RANK[b.subject.type] ?? 9);
      return rank !== 0 ? rank : a.index - b.index;
    })
    .map((x) => x.normalized);

  // 指定「小說」或「漫畫」時，把 platform 判成另一種的濾掉
  if (kind === '小說' || kind === '漫畫') {
    return results.filter((r) => r.mainType === kind);
  }
  return results;
}
