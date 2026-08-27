'use client';

/**
 * YouTube Data API v3 —— 由瀏覽器直接呼叫。
 *
 * 為什麼是這條路而不是爬蟲：YouTube 的搜尋頁是動態產生的，靠爬 HTML 既
 * 跨不過瀏覽器的同源政策（得繞後端），又會被對方改版打壞。官方 API 免費
 * 額度每天 10,000 單位、CORS 全開，穩定得多。
 *
 * 金鑰存在使用者自己的裝置（localStorage），**不進 repo 也不進 bundle** ——
 * 靜態站沒有伺服器可以藏東西，打包進去等於公開。
 *
 * 額度成本：search 一次 100 單位，videos / playlistItems 各 1 單位。
 * 所以搜尋一天約 100 次，匯入播放清單則幾乎不花額度。
 */

const BASE = 'https://www.googleapis.com/youtube/v3';

export interface YouTubeVideo {
  id: string;
  title: string;
  channel: string;
  thumb: string;
  publishedAt: string;
  /** 影片長度，例如 12:34；要第二次請求才拿得到 */
  duration?: string;
}

export interface SearchPage {
  items: YouTubeVideo[];
  nextPageToken?: string;
  prevPageToken?: string;
}

export const watchUrlFor = (id: string) => `https://www.youtube.com/watch?v=${id}`;

/** 把 API 的錯誤翻成看得懂、知道下一步的訊息 */
async function request(path: string, params: Record<string, string>): Promise<unknown> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}/${path}?${qs}`);

  if (res.ok) return res.json();

  let reason = '';
  try {
    const body = await res.json();
    reason = body?.error?.errors?.[0]?.reason ?? body?.error?.status ?? '';
  } catch {
    // 連錯誤內容都不是 JSON，只能用狀態碼判斷
  }

  if (reason === 'quotaExceeded' || reason === 'RESOURCE_EXHAUSTED') {
    throw new Error('今天的 YouTube API 額度用完了（每天 10,000 單位，一次搜尋 100 單位）。明天太平洋時間午夜會重置。');
  }
  if (reason === 'keyInvalid' || res.status === 400) {
    throw new Error('YouTube API 金鑰無效，請到設定重新填一次。');
  }
  if (res.status === 403) {
    throw new Error('YouTube 拒絕這個請求。多半是金鑰在 Google Cloud 設了網域限制，而這個站不在允許清單裡。');
  }
  throw new Error(`YouTube API 錯誤（HTTP ${res.status}）`);
}

interface RawSearchItem {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: Record<string, { url?: string }>;
  };
}

function pickThumb(thumbnails: Record<string, { url?: string }> = {}): string {
  return (
    thumbnails.medium?.url ?? thumbnails.high?.url ?? thumbnails.default?.url ?? ''
  );
}

/** 標題來自 API 時會帶 HTML 實體（&amp;、&#39;），直接顯示會很醜 */
function decode(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

export async function searchVideos(
  key: string,
  keyword: string,
  pageToken = '',
): Promise<SearchPage> {
  const params: Record<string, string> = {
    key,
    part: 'snippet',
    type: 'video',
    maxResults: '12',
    q: keyword,
  };
  if (pageToken) params.pageToken = pageToken;

  const data = (await request('search', params)) as {
    items?: RawSearchItem[];
    nextPageToken?: string;
    prevPageToken?: string;
  };

  const items: YouTubeVideo[] = (data.items ?? [])
    .filter((item) => item.id?.videoId)
    .map((item) => ({
      id: item.id!.videoId!,
      title: decode(item.snippet?.title ?? ''),
      channel: decode(item.snippet?.channelTitle ?? ''),
      thumb: pickThumb(item.snippet?.thumbnails),
      publishedAt: (item.snippet?.publishedAt ?? '').slice(0, 10),
    }));

  return { items, nextPageToken: data.nextPageToken, prevPageToken: data.prevPageToken };
}

/** ISO 8601 的 PT1H2M3S → 1:02:03 */
export function parseDuration(iso: string): string {
  const m = iso.match(/^P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return '';

  const [h, min, s] = [Number(m[1] ?? 0), Number(m[2] ?? 0), Number(m[3] ?? 0)];
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(min)}:${pad(s)}` : `${min}:${pad(s)}`;
}

/**
 * 補上影片長度。搜尋端點不回傳長度，要另外問一次 ——
 * 但這一次只花 1 單位，而且一次能問 50 支，很划算。
 */
export async function withDurations(key: string, videos: YouTubeVideo[]): Promise<YouTubeVideo[]> {
  if (videos.length === 0) return videos;

  const data = (await request('videos', {
    key,
    part: 'contentDetails',
    id: videos.map((v) => v.id).join(','),
  })) as { items?: { id?: string; contentDetails?: { duration?: string } }[] };

  const durations = new Map(
    (data.items ?? []).map((item) => [item.id ?? '', parseDuration(item.contentDetails?.duration ?? '')]),
  );

  return videos.map((v) => ({ ...v, duration: durations.get(v.id) || undefined }));
}

// ─── 播放清單 ─────────────────────────────────────────────────

/** 從各種 YouTube 網址裡挖出播放清單 ID */
export function parsePlaylistId(raw: string): string {
  const text = raw.trim();
  if (/^PL[\w-]{10,}$|^UU[\w-]{10,}$|^LL[\w-]{10,}$|^FL[\w-]{10,}$/.test(text)) return text;

  try {
    const url = new URL(text);
    return url.searchParams.get('list') ?? '';
  } catch {
    return '';
  }
}

/**
 * 抓整份播放清單。一頁 50 支、每頁 1 單位，所以幾百支影片也只花個位數額度。
 * 上限刻意設在 200 支 —— 再多就不是「片庫的一筆」而是頻道備份了。
 */
export async function fetchPlaylist(key: string, playlistId: string): Promise<YouTubeVideo[]> {
  const all: YouTubeVideo[] = [];
  let pageToken = '';

  do {
    const params: Record<string, string> = {
      key,
      part: 'snippet',
      playlistId,
      maxResults: '50',
    };
    if (pageToken) params.pageToken = pageToken;

    const data = (await request('playlistItems', params)) as {
      items?: {
        snippet?: {
          title?: string;
          videoOwnerChannelTitle?: string;
          publishedAt?: string;
          thumbnails?: Record<string, { url?: string }>;
          resourceId?: { videoId?: string };
        };
      }[];
      nextPageToken?: string;
    };

    for (const item of data.items ?? []) {
      const id = item.snippet?.resourceId?.videoId;
      const title = decode(item.snippet?.title ?? '');
      // 被刪除或設為私人的影片仍會留在清單裡，標題是「Deleted video」且沒有 ID
      if (!id || !title || title === 'Deleted video' || title === 'Private video') continue;

      all.push({
        id,
        title,
        channel: decode(item.snippet?.videoOwnerChannelTitle ?? ''),
        thumb: pickThumb(item.snippet?.thumbnails),
        publishedAt: (item.snippet?.publishedAt ?? '').slice(0, 10),
      });
    }

    pageToken = data.nextPageToken ?? '';
  } while (pageToken && all.length < 200);

  return all;
}
