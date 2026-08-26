'use client';

import { toSimplified } from './t2s';

/**
 * TVmaze 播出排程 —— 由瀏覽器直接呼叫。
 *
 * 為什麼需要它：Bangumi 的分集播出日**只有日本動畫有**，陸劇、韓劇、
 * 連載中的國漫幾乎都是 0 個播出日。TVmaze 補的正是這幾個洞。
 * 免金鑰、CORS 全開。
 *
 * 授權是 CC BY-SA，**必須標示來源**，所以綁定後的卡片會保留一個連回
 * TVmaze 作品頁的連結，不可以拿掉。
 */

const BASE = 'https://api.tvmaze.com';

export const showUrl = (id: number) => `https://www.tvmaze.com/shows/${id}`;

export interface ShowHit {
  id: number;
  name: string;
  /** Running / Ended / To Be Determined */
  status: string;
  premiered: string;
  image: string;
  /** 電視台或串流平台 */
  channel: string;
  url: string;
}

export interface Episode {
  season: number;
  number: number;
  airdate: string;
}

export interface Schedule {
  /** 到今天為止已播出幾集；0 代表查不到 */
  aired: number;
  /** 這一季總共排定幾集（含已公布但還沒播的） */
  seasonTotal: number;
  /** 下一集播出日 YYYY-MM-DD；空字串代表沒有下一集（完結或未公布） */
  nextDate: string;
  /** 顯示用集數，例如「第 188 集（S8E12）」 */
  nextLabel: string;
}

// ─── 搜尋 ─────────────────────────────────────────────────────

interface RawHit {
  show?: {
    id: number;
    name?: string;
    status?: string;
    premiered?: string;
    url?: string;
    image?: { medium?: string; original?: string };
    network?: { name?: string };
    webChannel?: { name?: string };
  };
}

/**
 * TVmaze 收的是「整部作品」，季別後綴會讓整組落空
 * （「Kaiju No. 8 Season 2」查不到，去掉 Season 2 才有）。
 * 送出前把這些尾巴削掉。
 */
export function bareTitle(raw: string): string {
  return raw
    .trim()
    .replace(/\s+(season|staffel|part|cour)\s*\d+.*$/i, '')
    .replace(/\s*第\s*[0-9一二三四五六七八九十]+\s*季.*$/, '')
    .replace(/\s*[:：\-–—].*$/, '')
    .replace(/\s+(i{1,3}|iv|vi{0,3}|ix|x)$/i, '')
    .trim();
}

async function searchOnce(keyword: string): Promise<RawHit[]> {
  const res = await fetch(`${BASE}/search/shows?q=${encodeURIComponent(keyword)}`);
  if (!res.ok) throw new Error(`TVmaze 搜尋失敗（HTTP ${res.status}）`);
  return (await res.json()) ?? [];
}

/**
 * 華語作品在 TVmaze 一律以簡體收錄，繁體關鍵字幾乎全數落空，
 * 所以繁簡都送、合併去重（簡體的結果排前面）。
 */
export async function searchShows(title: string): Promise<ShowHit[]> {
  const trimmed = bareTitle(title);
  if (!trimmed) return [];

  const simplified = toSimplified(trimmed);
  const queries = simplified === trimmed ? [trimmed] : [simplified, trimmed];

  const settled = await Promise.allSettled(queries.map(searchOnce));
  const ok = settled.filter(
    (s): s is PromiseFulfilledResult<RawHit[]> => s.status === 'fulfilled',
  );
  if (ok.length === 0) {
    const first = settled[0];
    throw first.status === 'rejected' ? first.reason : new Error('TVmaze 搜尋失敗');
  }

  const seen = new Set<number>();
  const hits: ShowHit[] = [];
  for (const batch of ok) {
    for (const raw of batch.value) {
      const show = raw.show;
      if (!show || seen.has(show.id)) continue;
      seen.add(show.id);
      hits.push({
        id: show.id,
        name: show.name ?? '',
        status: show.status ?? '',
        premiered: show.premiered ?? '',
        image: show.image?.medium ?? show.image?.original ?? '',
        channel: show.webChannel?.name ?? show.network?.name ?? '',
        url: show.url || showUrl(show.id),
      });
    }
  }
  return hits;
}

// ─── 排程計算 ─────────────────────────────────────────────────

/** 台北時區的今天（YYYY-MM-DD）。airdate 同格式，可以直接比字串大小 */
export function todayInTaipei(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
}

const CN_DIGITS = '零一二三四五六七八九';

/** 從作品名稱讀出使用者追的是第幾季，讀不到回 0 */
export function parseSeason(name: string): number {
  const match = name.match(/第\s*([0-9]+|[一二三四五六七八九十]+)\s*季/);
  if (!match) return 0;

  const raw = match[1];
  if (/^[0-9]+$/.test(raw)) return Number(raw);
  if (raw === '十') return 10;
  if (raw.length === 2 && raw[0] === '十') return 10 + CN_DIGITS.indexOf(raw[1]);
  if (raw.length === 2 && raw[1] === '十') return CN_DIGITS.indexOf(raw[0]) * 10;
  if (raw.length === 3 && raw[1] === '十') {
    return CN_DIGITS.indexOf(raw[0]) * 10 + CN_DIGITS.indexOf(raw[2]);
  }
  return Math.max(0, CN_DIGITS.indexOf(raw));
}

/**
 * 名稱有寫季別（「鑽石王牌 第四季」）就只算那一季 —— 使用者的進度是從
 * 該季第 1 集起算的，拿全系列去比會變成 1/191。
 * 季別在 TVmaze 對不上時退回整部，不硬猜。
 */
export function seasonPool(name: string, episodes: Episode[]): Episode[] {
  const season = parseSeason(name);
  const inSeason = season > 0 ? episodes.filter((ep) => ep.season === season) : [];
  return inSeason.length > 0 ? inSeason : episodes;
}

/**
 * 從分集清單算出排程。
 *
 * 已播集數刻意不用清單長度：TVmaze 連已公布但還沒播的都收進去，
 * 拿那個當分母會憑空多出幾集。進度條要回答的是「我離最新一集還差幾集」，
 * 所以只數播出日在今天以前的。
 *
 * 下一集的集數用**清單位置**換算成絕對集數：使用者記的是「第 188 集」，
 * TVmaze 標的卻是 S8E12。多季作品才在後面附上 SxxExx。
 */
export function buildSchedule(
  name: string,
  episodes: Episode[],
  today = todayInTaipei(),
): Schedule {
  const pool = seasonPool(name, episodes);
  const aired = pool.filter((ep) => ep.airdate && ep.airdate <= today).length;

  const index = pool.findIndex((ep) => (ep.airdate || '') > today);
  const next = index >= 0 ? pool[index] : null;
  const multiSeason = new Set(pool.map((ep) => ep.season)).size > 1;

  return {
    aired,
    seasonTotal: pool.length,
    nextDate: next?.airdate ?? '',
    nextLabel: next
      ? multiSeason
        ? `第 ${index + 1} 集（S${next.season}E${next.number}）`
        : `第 ${index + 1} 集`
      : '',
  };
}

export async function fetchSchedule(showId: number, name: string): Promise<Schedule> {
  const res = await fetch(`${BASE}/shows/${showId}/episodes`);
  if (!res.ok) throw new Error(`TVmaze 讀取分集失敗（HTTP ${res.status}）`);

  const raw: unknown = await res.json();
  const episodes: Episode[] = (Array.isArray(raw) ? raw : []).map((ep) => {
    const e = ep as Partial<Episode>;
    return { season: e.season ?? 0, number: e.number ?? 0, airdate: e.airdate ?? '' };
  });

  return buildSchedule(name, episodes);
}
