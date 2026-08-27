import { MainType } from '@/types/media';

/**
 * 內建站點目錄 —— 常見的正版影音／閱讀服務，按分類分組。
 *
 * 目的是「不用自己記網址」：在目錄裡點一下就前往，或加進自己的捷徑列。
 * 收錄標準是官方服務，不含來源不明的站；要加別的站用「常用站點捷徑」
 * 自己填，那個是完全自由的。
 *
 * `embeddable` 標記站內播不播得起來 —— 跟 watchUrl.ts 的 SITES 登記表一致：
 * 大多數影音平台用 DRM 或 X-Frame-Options 擋內嵌，只能新分頁開啟。
 */
export interface CatalogSite {
  label: string;
  url: string;
  type: MainType | '';
  /** 一句話說明它適合找什麼 */
  note?: string;
  embeddable?: boolean;
}

export const SITE_CATALOG: { group: string; sites: CatalogSite[] }[] = [
  {
    group: '影集與電影',
    sites: [
      { label: 'Netflix', url: 'https://www.netflix.com/browse', type: '影集' },
      { label: 'Disney+', url: 'https://www.disneyplus.com', type: '影集' },
      { label: 'Prime Video', url: 'https://www.primevideo.com', type: '電影' },
      { label: 'Apple TV+', url: 'https://tv.apple.com', type: '影集' },
      { label: 'Max', url: 'https://www.max.com', type: '影集' },
      { label: 'CATCHPLAY+', url: 'https://www.catchplay.com/tw', type: '電影' },
      { label: 'KKTV', url: 'https://www.kktv.me', type: '影集', note: '日劇、韓劇為主' },
      { label: 'LINE TV', url: 'https://www.linetv.tw', type: '影集', note: '台劇、韓綜' },
      { label: 'LiTV', url: 'https://www.litv.tv', type: '影集' },
      { label: 'MyVideo', url: 'https://www.myvideo.net.tw', type: '電影' },
      { label: 'friDay影音', url: 'https://video.friday.tw', type: '影集' },
      { label: 'Hami Video', url: 'https://hamivideo.hinet.net', type: '影集' },
    ],
  },
  {
    group: '動漫',
    sites: [
      { label: '巴哈姆特動畫瘋', url: 'https://ani.gamer.com.tw', type: '動漫', note: '台灣代理新番最齊' },
      { label: 'Crunchyroll', url: 'https://www.crunchyroll.com', type: '動漫' },
      { label: 'BiliBili 番劇', url: 'https://www.bilibili.com/anime', type: '動漫', embeddable: true },
      { label: 'Muse 木棉花', url: 'https://www.youtube.com/@MuseTW', type: '動漫', note: 'YouTube 官方頻道，可站內播', embeddable: true },
      { label: 'Ani-One', url: 'https://www.youtube.com/@AniOneAsia', type: '動漫', note: 'YouTube 官方頻道，可站內播', embeddable: true },
    ],
  },
  {
    group: '綜藝與華語內容',
    sites: [
      { label: 'iQIYI 愛奇藝', url: 'https://www.iq.com', type: '綜藝' },
      { label: 'WeTV', url: 'https://wetv.vip', type: '綜藝' },
      { label: 'Viu', url: 'https://www.viu.com', type: '綜藝' },
      { label: 'BiliBili', url: 'https://www.bilibili.com', type: '', embeddable: true },
    ],
  },
  {
    group: '漫畫',
    sites: [
      { label: '少年 Jump+', url: 'https://shonenjumpplus.com', type: '漫畫', note: '日本官方，部分免費' },
      { label: 'LINE WEBTOON', url: 'https://www.webtoons.com/zh-hant', type: '漫畫' },
      { label: 'comico', url: 'https://www.comico.com.tw', type: '漫畫' },
      { label: 'BOOK☆WALKER', url: 'https://www.bookwalker.com.tw', type: '漫畫' },
      { label: 'ComicWalker', url: 'https://comic-walker.com', type: '漫畫', note: 'KADOKAWA 官方，免費連載' },
      { label: 'ニコニコ静画', url: 'https://seiga.nicovideo.jp', type: '漫畫', note: 'niconico 的漫畫區' },
      { label: 'サイコミ cycomi', url: 'https://cycomi.com', type: '漫畫', note: 'Cygames 官方' },
      { label: 'Toomics 玩漫', url: 'https://toomics.com/tc', type: '漫畫', note: '韓國官方，有繁中' },
      { label: '騰訊動漫', url: 'https://ac.qq.com', type: '漫畫', note: '中國官方，台灣可能連不上' },
      { label: '嗶哩嗶哩漫畫', url: 'https://manga.bilibili.com', type: '漫畫', note: '中國官方，台灣可能連不上' },
      { label: '快看漫畫', url: 'https://www.kuaikanmanhua.com', type: '漫畫', note: '中國官方，台灣可能連不上' },
      { label: 'SF漫畫', url: 'https://manhua.sfacg.com', type: '漫畫', note: '中國官方，輕小說改編多' },
    ],
  },
  {
    group: '小說與書',
    sites: [
      { label: 'Kobo', url: 'https://www.kobo.com/tw/zh', type: '小說' },
      { label: 'BOOK☆WALKER', url: 'https://www.bookwalker.com.tw', type: '小說' },
      { label: '博客來電子書', url: 'https://www.books.com.tw/web/ebook', type: '小說' },
      { label: 'Project Gutenberg', url: 'https://www.gutenberg.org', type: '小說', note: '公共領域書籍，免費' },
      { label: '小説家になろう', url: 'https://syosetu.com', type: '小說', note: '日本最大的網路小說平台，免費' },
      { label: 'カクヨム', url: 'https://kakuyomu.jp', type: '小說', note: 'KADOKAWA 官方投稿平台，免費' },
      { label: 'アルファポリス', url: 'https://www.alphapolis.co.jp', type: '小說', note: '小說與漫畫都有' },
      { label: '起點中文網', url: 'https://www.qidian.com', type: '小說', note: '中國最大的正版網文平台' },
    ],
  },
  {
    group: '其他影音',
    sites: [
      { label: 'YouTube', url: 'https://www.youtube.com', type: '', embeddable: true },
      { label: 'Vimeo', url: 'https://vimeo.com', type: '', embeddable: true },
      { label: 'Twitch', url: 'https://www.twitch.tv', type: '', embeddable: true },
      { label: 'niconico', url: 'https://www.nicovideo.jp', type: '', embeddable: true },
      { label: 'Internet Archive', url: 'https://archive.org/details/movies', type: '電影', note: '公共領域影片，可站內播且能記進度', embeddable: true },
    ],
  },
];

/**
 * 「這本去哪裡看」—— 拿作品名去各個正版平台的搜尋頁。
 *
 * 為什麼需要：小說與漫畫從 Bangumi 加進來時，連結指的是**資料頁**
 * （條目介紹、封面、集數），不是內文。點進去只會看到一個介紹頁，
 * 對「我現在想看」完全沒幫助。
 *
 * 這裡不抓也不代管任何內文 —— 這個站是連結目錄，不是閱讀器。
 * 能做的是把你帶到真的看得到的地方，找到之後把該站的網址存回觀看連結，
 * 下次點卡片就直接到那裡。
 */
export interface ReadingLink {
  label: string;
  url: string;
  note?: string;
}

export function readingLinks(title: string, mainType: string): ReadingLink[] {
  const q = encodeURIComponent(title.trim());
  if (!q) return [];

  const manga: ReadingLink[] = [
    { label: 'MangaDex', url: `https://mangadex.org/search?q=${q}`, note: '多為官方授權的翻譯' },
    { label: 'LINE WEBTOON', url: `https://www.webtoons.com/zh-hant/search?keyword=${q}` },
  ];

  const novel: ReadingLink[] = [
    { label: '起點中文網', url: `https://www.qidian.com/search?kw=${q}`, note: '中文網路小說' },
    { label: '小説家になろう', url: `https://yomou.syosetu.com/search.php?word=${q}`, note: '日文，免費' },
    { label: 'カクヨム', url: `https://kakuyomu.jp/search?q=${q}`, note: '日文，免費' },
    { label: 'Google 圖書', url: `https://www.google.com/search?tbm=bks&q=${q}`, note: '部分可試閱' },
  ];

  return mainType === '漫畫' ? manga : mainType === '小說' ? novel : [...novel, ...manga];
}
