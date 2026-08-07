# 🎬 我的片庫 — 個人影音串流平台

只給自己用的片庫首頁。把作品、進度、評分、觀看連結收在一起，點一下就開播。

**技術組成**：Next.js static export（GitHub Pages）＋ Google Apps Script ＋ Google Sheets。
沒有自建伺服器，沒有月費。

---

## 這個平台做什麼

這是**外部連結目錄**，不是媒體伺服器 —— 它不存放也不轉檔影片，存的是「作品資料 + 一段你自己貼上的觀看連結」。
渲染時才判斷那段連結是什麼，決定要內嵌播放還是開新分頁：

| 你貼的連結 | 行為 |
|---|---|
| YouTube | 站內播放器內嵌播放 |
| BiliBili | 站內播放器內嵌播放 |
| `.mp4` / `.webm` / `.m3u8` 等直鏈 | 站內原生播放器，**自動記住播到幾分幾秒**，下次接續 |
| gimy 格式（`/vod/12345.html`） | 抽出作品 ID，用「設定」裡的全域網域重組成 `/eps/12345-1-{下一集}.html`，新分頁開啟 |
| 其他任何網址 | 原樣新分頁開啟 |
| 空白 | 不顯示開播按鈕 |

gimy 那條是重點：**只存作品 ID，網域存在瀏覽器設定裡**。站方換網域時你只改「設定 > 站點網域」一個欄位，片庫裡所有作品的開播連結一起更新，不用逐條改。

## 功能

- **多帳號**：一個帳號 = Google Sheets 的一張分頁，資料互不干擾
- **六大分類**：電影 / 影集 / 綜藝 / 動漫 / 小說 / 漫畫，分類旁顯示筆數
- **進度追蹤**：卡片上 `＋` `−` 直接加減集數，有總集數時顯示進度條
- **搜尋與篩選**：關鍵字（名稱/備註/平台/國家）、觀看狀態、四種排序
- **完整欄位**：季別、國家、來源平台、類別、評分、封面圖、備註
- **樂觀更新**：操作立刻反映在畫面上，背景同步到 Sheets，失敗自動重抓還原
- **PWA**：可加到手機主畫面

---

## 安裝

### 第一步：建立 Google Sheets 後端

1. 到 [sheets.google.com](https://sheets.google.com) 開一份新試算表
2. 選單 **擴充功能 > Apps Script**
3. 把本專案根目錄的 [`apps-script-code.gs`](./apps-script-code.gs) 全文貼進去，取代預設內容，存檔
4. 右上角 **部署 > 新增部署**
   - 類型：**網頁應用程式**
   - 執行身分：**我**
   - 具有存取權的使用者：**任何人**
5. 複製產生的網址（`https://script.google.com/macros/s/.../exec`）

> ⚠️ 存取權必須是「任何人」，否則靜態前端讀不到。這也代表**知道這串網址的人就能讀寫你的資料** ——
> 網址本身就是密碼，別外流。這是靜態站沒有伺服器可藏密鑰的必然取捨，不是 bug。

### 第二步：本機開發

```bash
npm install
cp .env.example .env.local     # 填入上一步的網址
npm run dev                    # http://localhost:3000
```

### 第三步：部署到 GitHub Pages

1. Repo **Settings > Secrets and variables > Actions > New repository secret**
   - Name：`NEXT_PUBLIC_APPS_SCRIPT_URL`
   - Value：第一步的網址
2. Repo **Settings > Pages > Build and deployment > Source** 選 **GitHub Actions**
3. Push 到 `main`，Actions 跑完即上線

網址會是 `https://<你的帳號>.github.io/www/`。
如果 repo 不叫 `www`，記得同步改 `next.config.js` 的 `repoName` 與 `src/app/manifest.ts` 的 `base`。

### 第四步：第一次使用

首頁輸入任意名稱 → 點「以此名稱建立新帳號」，系統會在試算表新增對應分頁。

---

## 常用指令

```bash
npm run dev     # 本地開發（basePath 為空）
npm run build   # 靜態輸出到 out/
npm run lint    # ESLint —— 本專案唯一的自動化檢查
```

---

## 資料 schema

每個帳號分頁固定 15 欄，第 1 列為凍結表頭：

| 欄 | 名稱 | 欄位 |
|---|---|---|
| A | 最後更新時間 | `updatedAt` |
| B | 作品名稱 | `title` |
| C | 目前進度 | `progress` |
| D | 總集數 | `totalEp` |
| E | 類型 | `mainType` |
| F | 國家 | `country` |
| G | 狀態 | `status` |
| H | 評分 | `rating` |
| I | 來源平台 | `platform` |
| J | 觀看連結 | `watchUrl` |
| K | 封面圖 | `cover` |
| L | 季別 | `season` |
| M | 類別 | `genre` |
| N | 備註 | `note` |
| O | 加入日期 | `addedDate` |

改動欄位順序會同時破壞 `apps-script-code.gs` 的 `HEADERS`/`FIELD_COLUMN` 與 `src/lib/schema.ts` 的 `COLUMN_ORDER`，三處必須一起改。

### 從舊的追番 app 沿用同一份試算表

舊的 5 欄 schema（`最後更新時間 / 作品名稱 / 目前進度 / 最新進度(AI) / 追蹤`）可以直接接上：
前 3 欄語意完全相同，後端讀取時會自動補足表頭與欄位，**不會動到既有資料**。

兩個遺留欄位的落點：

- D 欄「最新進度(AI)」→ 落到 `總集數`。數字通常還算合理，先留著，不對就直接編輯
- E 欄「追蹤 TRUE/FALSE」→ 落到 `類型`，前端偵測到 `TRUE`/`FALSE` 會濾掉顯示成空白，重新選分類即可

---

## 已知限制

- **不託管影片**：GitHub Pages 是靜態站，沒有儲存空間也沒有轉檔能力。想放自己的影片檔要改成自架方案（Docker + 資料庫 + ffmpeg）
- **iframe 內嵌只對允許內嵌的站有效**：YouTube、BiliBili 可以；多數影音站會用 `X-Frame-Options` 擋掉，所以那些一律走新分頁開啟
- **設定存在 localStorage**：站點網域與播放進度是 per-browser 的，換裝置要重設
- **Apps Script URL 會被打包進 bundle**：靜態站沒有伺服器端可藏密鑰（見上方警告）
- **沒有測試框架**：`npm run lint` 是唯一的自動化檢查
