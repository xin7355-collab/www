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
