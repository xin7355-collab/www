/**
 * ═══════════════════════════════════════════════════════════════
 *  MY STREAM — 個人影音串流平台 後端
 *  Google Apps Script + Google Sheets
 * ═══════════════════════════════════════════════════════════════
 *
 * ⚠️ 改完這份程式碼後，必須手動重新部署才會生效：
 *    部署 > 管理部署 > 編輯（鉛筆）> 版本：全新版本 > 部署
 *
 * 資料模型：一個「帳號」＝ 一張 Sheet 分頁，固定 15 欄。
 * rowNumber（實際列號，從 2 起算）是前端更新的唯一定位鍵。
 */

// ─── Schema ───────────────────────────────────────────────────
// 改動這裡務必同步 src/lib/schema.ts 的 COLUMN_ORDER
var HEADERS = [
  '最後更新時間', // A  1  updatedAt
  '作品名稱',     // B  2  title
  '目前進度',     // C  3  progress
  '總集數',       // D  4  totalEp
  '類型',         // E  5  mainType   電影/影集/綜藝/動漫/小說/漫畫
  '國家',         // F  6  country
  '狀態',         // G  7  status     未觀看/觀看中/已完成/棄劇
  '評分',         // H  8  rating     0-5
  '來源平台',     // I  9  platform
  '觀看連結',     // J 10  watchUrl
  '封面圖',       // K 11  cover
  '季別',         // L 12  season
  '類別',         // M 13  genre
  '備註',         // N 14  note
  '加入日期'      // O 15  addedDate
];

var COL_COUNT = HEADERS.length;

// 可直接用欄位名更新的欄位 → 欄號對照
var FIELD_COLUMN = {
  title: 2,
  progress: 3,
  totalEp: 4,
  mainType: 5,
  country: 6,
  status: 7,
  rating: 8,
  platform: 9,
  watchUrl: 10,
  cover: 11,
  season: 12,
  genre: 13,
  note: 14,
  addedDate: 15
};

// ─── 路由 ─────────────────────────────────────────────────────

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'getData';

    if (action === 'getSheets') {
      return response(listAllSheets(ss));
    }

    if (action === 'fetchMeta') {
      return response(fetchMeta(e.parameter.url));
    }

    if (action === 'search') {
      return response(searchWorks(e.parameter.q, e.parameter.kind));
    }

    var sheetName = (e && e.parameter && e.parameter.sheet) ? e.parameter.sheet : null;
    return response(getSheetData(ss, sheetName));

  } catch (err) {
    return response({ error: err.toString() });
  }
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    switch (data.action) {
      case 'createSheet':
        return response(createNewAccount(ss, data.name));
      case 'deleteAccount':
        return response(deleteAccount(ss, data.sheet));
      case 'addItem':
        return response(addItem(ss, data.sheet, data.item));
      case 'updateItem':
        return response(updateItem(ss, data.sheet, data.row, data.fields));
      case 'deleteItem':
        return response(deleteItem(ss, data.sheet, data.row));
      default:
        throw new Error('未知動作: ' + data.action);
    }

  } catch (err) {
    return response({ error: err.toString() });
  }
}

// ─── 帳號 ─────────────────────────────────────────────────────

function listAllSheets(ss) {
  return ss.getSheets().map(function (s) { return s.getName(); });
}

function createNewAccount(ss, name) {
  if (!name) throw new Error('帳號名稱不可空白');
  if (ss.getSheetByName(name)) throw new Error('帳號「' + name + '」已經存在');

  var sheet = ss.insertSheet(name);
  writeHeaders(sheet);
  return { success: true, name: name };
}

function deleteAccount(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('找不到該帳號: ' + name);
  if (ss.getSheets().length <= 1) {
    throw new Error('無法刪除唯一的帳號，請至少保留一個分頁');
  }
  ss.deleteSheet(sheet);
  return { success: true };
}

// ─── 讀取 ─────────────────────────────────────────────────────

/**
 * 回傳固定 15 欄的二維陣列（含表頭列），確保前端 index 映射不偏移。
 * 舊帳號（5 欄追番 schema）會就地升級：補表頭、補欄位，資料不動。
 */
function getSheetData(ss, sheetName) {
  var sheet = sheetName ? ss.getSheetByName(sheetName) : ss.getSheets()[0];
  if (!sheet) throw new Error('找不到分頁: ' + (sheetName || '第一個分頁'));

  ensureSchema(sheet);

  var lastRow = sheet.getLastRow();
  if (lastRow < 1) return [];
  return sheet.getRange(1, 1, lastRow, COL_COUNT).getValues();
}

function writeHeaders(sheet) {
  sheet.getRange(1, 1, 1, COL_COUNT).setValues([HEADERS]);
  sheet.setFrozenRows(1);
}

/**
 * 就地升級舊分頁。
 * 舊追番 schema 是 5 欄：最後更新時間 / 作品名稱 / 目前進度 / 最新進度(AI) / 追蹤。
 * 前 3 欄與新 schema 完全一致，D、E 兩欄語意不同 —— 直接被新表頭覆寫，
 * 殘留值（AI 集數、TRUE/FALSE）由前端的 sanitize 過濾掉，不會顯示成髒資料。
 */
function ensureSchema(sheet) {
  var lastCol = sheet.getLastColumn();

  if (lastCol < COL_COUNT) {
    sheet.insertColumnsAfter(Math.max(lastCol, 1), COL_COUNT - Math.max(lastCol, 1));
  }

  var current = sheet.getRange(1, 1, 1, COL_COUNT).getValues()[0];
  var needsHeaderWrite = false;
  for (var i = 0; i < COL_COUNT; i++) {
    if (String(current[i]).trim() !== HEADERS[i]) {
      needsHeaderWrite = true;
      break;
    }
  }
  if (needsHeaderWrite) writeHeaders(sheet);
}

// ─── 項目 CRUD ────────────────────────────────────────────────

function addItem(ss, sheetName, item) {
  var sheet = sheetName ? ss.getSheetByName(sheetName) : ss.getSheets()[0];
  if (!sheet) throw new Error('找不到分頁: ' + sheetName);
  if (!item || !String(item.title || '').trim()) throw new Error('作品名稱不可空白');

  ensureSchema(sheet);

  var today = today8();
  var newRow = sheet.getLastRow() + 1;

  var values = [
    today,                              // A 最後更新時間
    String(item.title).trim(),          // B 作品名稱
    str(item.progress, '0'),            // C 目前進度
    str(item.totalEp, ''),              // D 總集數
    str(item.mainType, ''),             // E 類型
    str(item.country, ''),              // F 國家
    str(item.status, '未觀看'),          // G 狀態
    str(item.rating, ''),               // H 評分
    str(item.platform, ''),             // I 來源平台
    str(item.watchUrl, ''),             // J 觀看連結
    str(item.cover, ''),                // K 封面圖
    str(item.season, ''),               // L 季別
    str(item.genre, ''),                // M 類別
    str(item.note, ''),                 // N 備註
    str(item.addedDate, today)          // O 加入日期
  ];

  sheet.getRange(newRow, 1, 1, COL_COUNT).setValues([values]);
  return { success: true, rowNumber: newRow };
}

/**
 * 部分更新。fields 是 { 欄位名: 值 } 物件，只寫入有給的欄位。
 * 一律順手更新 A 欄的最後更新時間。
 */
function updateItem(ss, sheetName, row, fields) {
  var sheet = sheetName ? ss.getSheetByName(sheetName) : ss.getSheets()[0];
  if (!sheet) throw new Error('找不到分頁: ' + sheetName);

  var rowIndex = parseInt(row, 10);
  if (!(rowIndex > 1)) throw new Error('無效的列號：禁止修改標題列');
  if (rowIndex > sheet.getLastRow()) throw new Error('列號超出範圍: ' + rowIndex);

  ensureSchema(sheet);

  var wrote = 0;
  for (var key in fields) {
    if (!Object.prototype.hasOwnProperty.call(fields, key)) continue;
    var col = FIELD_COLUMN[key];
    if (!col) continue;
    sheet.getRange(rowIndex, col).setValue(str(fields[key], ''));
    wrote++;
  }

  if (wrote === 0) throw new Error('沒有可更新的欄位');

  sheet.getRange(rowIndex, 1).setValue(today8());
  return { success: true, updated: wrote };
}

function deleteItem(ss, sheetName, row) {
  var sheet = sheetName ? ss.getSheetByName(sheetName) : ss.getSheets()[0];
  if (!sheet) throw new Error('找不到分頁: ' + sheetName);

  var rowIndex = parseInt(row, 10);
  if (!(rowIndex > 1)) throw new Error('無效的列號：禁止刪除標題列');
  if (rowIndex > sheet.getLastRow()) throw new Error('列號超出範圍: ' + rowIndex);

  sheet.deleteRow(rowIndex);
  return { success: true };
}

// ─── 網址中繼資料 ─────────────────────────────────────────────
//
// 前端是靜態站，瀏覽器不允許跨域抓別人的網頁；但這支腳本跑在 Google 這邊，
// 沒有那個限制。所以「貼上網址就自動填好名稱、封面、總集數」只能在這裡做。
//
// 優先走各站的官方端點（YouTube / Vimeo 的 oEmbed、BiliBili 的公開 API），
// 都對不上才退回抓 HTML 讀 og: 標籤 —— 官方端點穩定得多，
// 也比較不會被對方改版打壞。

var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
         '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function fetchMeta(url) {
  var target = String(url || '').trim();
  if (!target) throw new Error('缺少網址');
  if (!/^https?:\/\//i.test(target)) throw new Error('只接受 http 或 https 開頭的網址');

  var meta = biliBangumiMeta(target) ||
             biliVideoMeta(target) ||
             oEmbedMeta(target) ||
             htmlMeta(target);

  if (!meta || !meta.title) {
    throw new Error('這個網址抓不到標題，可能需要登入或對方擋了自動抓取');
  }

  meta.title = cleanTitle(meta.title);
  meta.totalEp = String(meta.totalEp || '');
  meta.cover = meta.cover || '';
  meta.platform = meta.platform || '';
  return meta;
}

/** BiliBili 番劇：ss / ep / md 三種網址都認，回傳整季資訊與分集清單 */
function biliBangumiMeta(url) {
  var ss = url.match(/\/bangumi\/play\/ss(\d+)/i);
  var ep = url.match(/\/bangumi\/play\/ep(\d+)/i);
  var md = url.match(/\/bangumi\/media\/md(\d+)/i);
  if (!ss && !ep && !md) return null;

  var seasonId = ss ? ss[1] : '';

  // md 是「媒體頁」的 ID，要先換成 season_id 才查得到分集
  if (!seasonId && md) {
    var review = getJson('https://api.bilibili.com/pgc/review/user?media_id=' + md[1]);
    if (review && review.result && review.result.media) {
      seasonId = String(review.result.media.season_id || '');
    }
    if (!seasonId) return null;
  }

  var api = seasonId
    ? 'https://api.bilibili.com/pgc/view/web/season?season_id=' + seasonId
    : 'https://api.bilibili.com/pgc/view/web/season?ep_id=' + ep[1];

  var data = getJson(api);
  var r = data && data.result;
  if (!r) return null;

  var episodes = r.episodes || [];
  var declared = parseInt(r.total, 10);

  return {
    title: r.season_title || r.title || '',
    cover: r.cover || '',
    // total 有時是 -1（連載中未定集數），那就用實際抓到的分集數
    totalEp: String(declared > 0 ? declared : episodes.length),
    platform: 'BiliBili',
    mainType: '動漫',
    latestEp: r.new_ep ? String(r.new_ep.title || '') : '',
    episodes: episodes.slice(0, 500).map(function (x) {
      return {
        index: String(x.title || ''),
        title: String(x.long_title || x.share_copy || ''),
        url: x.link || ('https://www.bilibili.com/bangumi/play/ep' + x.id)
      };
    })
  };
}

/** BiliBili 一般投稿影片（BV 號）；多 P 的話 videos 就是分頁數 */
function biliVideoMeta(url) {
  var bv = url.match(/\/video\/(BV[0-9A-Za-z]+)/);
  if (!bv) return null;

  var data = getJson('https://api.bilibili.com/x/web-interface/view?bvid=' + bv[1]);
  var d = data && data.data;
  if (!d) return null;

  return {
    title: d.title || '',
    cover: d.pic || '',
    totalEp: d.videos > 1 ? String(d.videos) : '',
    platform: 'BiliBili'
  };
}

/** YouTube 與 Vimeo 的 oEmbed —— 不需要 API key */
function oEmbedMeta(url) {
  var host = hostOf(url);
  var endpoint = '';
  var platform = '';

  if (/(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$/i.test(host)) {
    endpoint = 'https://www.youtube.com/oembed?format=json&url=';
    platform = 'YouTube';
  } else if (/(^|\.)vimeo\.com$/i.test(host)) {
    endpoint = 'https://vimeo.com/api/oembed.json?url=';
    platform = 'Vimeo';
  } else {
    return null;
  }

  var data = getJson(endpoint + encodeURIComponent(url));
  if (!data || !data.title) return null;

  return {
    title: data.title,
    cover: data.thumbnail_url || '',
    totalEp: '',
    platform: platform
  };
}

/** 通吃的退路：抓 HTML 讀 og: 標籤 */
function htmlMeta(url) {
  var res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: { 'User-Agent': UA, 'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8' }
  });

  var code = res.getResponseCode();
  if (code >= 400) throw new Error('對方網站回應 HTTP ' + code + '，抓不到資料');

  var html = res.getContentText();
  return {
    title: metaContent(html, 'og:title') || metaContent(html, 'twitter:title') || titleTag(html),
    cover: metaContent(html, 'og:image') || metaContent(html, 'twitter:image') || '',
    totalEp: '',
    platform: ''
  };
}

/**
 * 洗掉標題尾巴的站名。
 *
 * 各站都愛在標題後面接自己的招牌（「_番劇_bilibili_哔哩哔哩」、
 * 「- YouTube」…），直接存進片庫會很醜。只砍認得出來的站名，
 * 不亂砍分隔符號後面的東西 —— 作品名本來就可能含 - 或 |。
 */
function cleanTitle(raw) {
  var title = decodeEntities(String(raw || ''));
  var junk = [
    'bilibili', '哔哩哔哩', '嗶哩嗶哩', 'YouTube', 'Vimeo', 'Dailymotion',
    'Netflix', 'Disney+', 'Prime Video', 'friDay影音', 'KKTV', 'LINE TV',
    '巴哈姆特動畫瘋', '動畫瘋', 'Crunchyroll', '番劇', '番剧', '全集',
    '在线观看', '線上看', '免费观看', '免費看'
  ];

  var changed = true;
  while (changed) {
    changed = false;
    for (var i = 0; i < junk.length; i++) {
      // 只處理「分隔符 + 站名」結尾的情況
      var re = new RegExp('[\\s\\-_|·—–:：]+' + escapeRe(junk[i]) + '\\s*$', 'i');
      if (re.test(title)) {
        title = title.replace(re, '');
        changed = true;
      }
    }
  }

  return title.replace(/\s+/g, ' ').trim();
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeEntities(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/** meta 標籤的 property 與 content 前後順序不固定，兩種都要吃 */
function metaContent(html, key) {
  var k = escapeRe(key);
  var patterns = [
    new RegExp('<meta[^>]+(?:property|name)=["\']' + k + '["\'][^>]*content=["\']([^"\']*)["\']', 'i'),
    new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']' + k + '["\']', 'i')
  ];
  for (var i = 0; i < patterns.length; i++) {
    var m = html.match(patterns[i]);
    if (m && m[1]) return decodeEntities(m[1]);
  }
  return '';
}

function titleTag(html) {
  var m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1]) : '';
}

function hostOf(url) {
  var m = String(url).match(/^https?:\/\/([^\/?#:]+)/i);
  return m ? m[1].toLowerCase() : '';
}

function getJson(url) {
  try {
    var res = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: { 'User-Agent': UA, 'Referer': 'https://www.bilibili.com/' }
    });
    if (res.getResponseCode() >= 400) return null;
    return JSON.parse(res.getContentText());
  } catch (err) {
    return null;
  }
}

// ─── 作品搜尋 ─────────────────────────────────────────────────
//
// 讓使用者不必先跑去別的網站查資料。三個來源都**不需要 API key**：
//   Apple iTunes  —— 電影與影集，有封面、年份、集數
//   Bangumi       —— 動漫與漫畫，中日文名稱、話數
//   Google Books  —— 小說
//
// 沒指定分類就三個都問。刻意不併發 —— Apps Script 的 fetchAll 一旦有一個
// 端點卡住就整批等，逐一問反而穩，而且單次都在幾秒內。

function searchWorks(q, kind) {
  var query = String(q || '').trim();
  if (!query) throw new Error('請輸入要搜尋的關鍵字');

  var want = String(kind || '');
  var out = [];

  if (!want || want === '電影') out = out.concat(itunesSearch(query, '電影'));
  if (!want || want === '影集') out = out.concat(itunesSearch(query, '影集'));
  if (!want || want === '動漫') out = out.concat(bangumiSearch(query, 2, '動漫'));
  if (want === '漫畫') out = out.concat(bangumiSearch(query, 1, '漫畫'));
  if (!want || want === '小說') out = out.concat(booksSearch(query));

  if (out.length === 0) throw new Error('查無結果，換個關鍵字或改用原文名稱試試');
  return out.slice(0, 40);
}

function itunesSearch(q, kind) {
  var media = kind === '影集' ? 'tvShow' : 'movie';
  var data = getJson(
    'https://itunes.apple.com/search?country=TW&limit=8&media=' + media +
    '&term=' + encodeURIComponent(q)
  );
  if (!data || !data.results) return [];

  return data.results.map(function (r) {
    return {
      title: r.trackName || r.collectionName || '',
      // 100x100 是縮圖，換成 600x600 才看得清楚
      cover: String(r.artworkUrl100 || '').replace('100x100', '600x600'),
      subtitle: [r.artistName, String(r.releaseDate || '').slice(0, 4)]
        .filter(Boolean).join(' · '),
      totalEp: r.trackCount ? String(r.trackCount) : '',
      mainType: kind,
      country: '',
      url: r.trackViewUrl || r.collectionViewUrl || '',
      source: 'Apple'
    };
  }).filter(nonEmptyTitle);
}

function bangumiSearch(q, type, mainType) {
  var data = getJson(
    'https://api.bgm.tv/search/subject/' + encodeURIComponent(q) +
    '?type=' + type + '&responseGroup=small&max_results=8'
  );
  var list = data && data.list;
  if (!list || !list.length) return [];

  return list.map(function (r) {
    var images = r.images || {};
    var name = r.name_cn || r.name || '';
    return {
      title: name,
      cover: httpsify(images.large || images.common || images.medium || ''),
      subtitle: (r.name && r.name !== name) ? r.name : '',
      totalEp: r.eps ? String(r.eps) : '',
      mainType: mainType,
      country: '日本',
      url: r.url || '',
      source: 'Bangumi'
    };
  }).filter(nonEmptyTitle);
}

function booksSearch(q) {
  var data = getJson(
    'https://www.googleapis.com/books/v1/volumes?maxResults=8&q=' + encodeURIComponent(q)
  );
  var items = data && data.items;
  if (!items || !items.length) return [];

  return items.map(function (r) {
    var v = r.volumeInfo || {};
    var links = v.imageLinks || {};
    return {
      title: v.title || '',
      cover: httpsify(links.thumbnail || links.smallThumbnail || ''),
      subtitle: [(v.authors || []).join('、'), String(v.publishedDate || '').slice(0, 4)]
        .filter(Boolean).join(' · '),
      totalEp: v.pageCount ? String(v.pageCount) : '',
      mainType: '小說',
      country: '',
      url: v.infoLink || v.canonicalVolumeLink || '',
      source: 'Google Books'
    };
  }).filter(nonEmptyTitle);
}

function nonEmptyTitle(x) {
  return Boolean(x.title);
}

/** 有些來源給的圖是 http，混在 https 頁面裡會被瀏覽器擋掉 */
function httpsify(url) {
  return String(url || '').replace(/^http:\/\//i, 'https://');
}

// ─── 工具 ─────────────────────────────────────────────────────

function str(v, fallback) {
  if (v === null || v === undefined || v === '') return fallback;
  return String(v);
}

function today8() {
  return Utilities.formatDate(new Date(), 'GMT+8', 'yyyy/MM/dd');
}

function response(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
