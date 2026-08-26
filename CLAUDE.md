# CLAUDE.md

給 Claude Code 在這個 repo 工作時的指引。

## 常用指令

```bash
npm run dev     # 本地開發（basePath 為空）
npm run build   # 靜態輸出到 out/（CI 用）
npm run lint    # ESLint（flat config）
```

本專案**沒有測試框架**，lint 是唯一的自動化檢查。改完務必跑 `npm run lint && npm run build`。

## 部署

- **部署由 Cloudflare 直接接 Git 完成**，不經過 GitHub Actions。
  push 到 `main` 後 Cloudflare 自己拉程式碼、跑 `npm run build`、發佈 `out/`
- Cloudflare 有 Pages 與 Workers 兩條路，repo 同時支援：Pages 的建置設定填在儀表板；
  Workers 走 `wrangler.jsonc`（純靜態，沒有 `main`，整包就是 `assets.directory: ./out`）
- `.github/workflows/ci.yml` **只做 lint + build 把關，不做部署**
- 環境變數 `NEXT_PUBLIC_APPS_SCRIPT_URL` 設在 Cloudflare 專案的建置變數；
  本機開發放 `.env.local`
- Node 版本由 `.nvmrc` 決定（Cloudflare Pages 預設的 Node 太舊，跑不動 Next 16）
- 站台前面要掛閘門才算「只有自己看」，兩種擇一：Cloudflare Access（Email 驗證碼，
  但要先啟用 Zero Trust、註冊時得綁付款方式），或 repo 內建的密碼閘門
- **密碼閘門的關鍵是 `wrangler.jsonc` 的 `assets.run_worker_first: true`**：
  它保證 Worker 跑在靜態資源之前。少了這個保證，`/index.html`、`/_next/*.js` 這類
  「有對應檔案的路徑」會直接被送出，閘門只擋得到不存在的路徑 —— 而 bundle 裡就有
  `NEXT_PUBLIC_APPS_SCRIPT_URL`，等於沒鎖。**所以用密碼閘門就必須走 Workers 路線**
  （`functions/_middleware.js` 是 Pages 版本，本機模擬器實測擋不到靜態檔，別預設它有效）
- 閘門邏輯集中在 `worker/gate.js`，兩條路線共用。密碼放 Secret `SITE_PASSWORD`，
  **沒設就直接放行** —— 刻意的，避免忘了設而把自己鎖在門外
- 曾經評估過 GitHub Pages 但走不通：**私有 repo 在免費方案無法啟用 Pages**，
  `configure-pages` 會以 `Resource not accessible by integration` 失敗
- 改完 `apps-script-code.gs` 後，**必須手動到 GAS 後台重新部署**（部署 > 管理部署 > 編輯 > 版本：全新版本），否則不生效

## 整體架構

純前端 + 無伺服器後端，沒有自建後端：

```
Browser (Next.js static export)  ──►  Google Apps Script  ──►  Google Sheets
```

### 三個關鍵理解

1. **後端就是 `apps-script-code.gs`**，部署在 Google。前端所有 CRUD 都打
   `NEXT_PUBLIC_APPS_SCRIPT_URL`：`GET ?action=getSheets|getData&sheet=` 與
   `POST` body `{action, sheet, ...}`。

2. **Google Sheets 當資料庫**：一個「帳號」= 一張分頁，固定 15 欄（A–O）。
   `rowNumber`（實際列號，從 2 起算）是所有更新的唯一定位鍵，比名稱比對可靠。
   欄位順序定義在三個地方，**改一處必須三處一起改**：
   - `apps-script-code.gs` 的 `HEADERS` 與 `FIELD_COLUMN`
   - `src/lib/schema.ts` 的 `COLUMN_ORDER`
   - `src/types/media.ts` 的 `MediaItem`

3. **這是連結目錄，不是媒體伺服器**。不存影片檔，只存 `watchUrl`。
   `src/lib/watchUrl.ts` 的 `resolveWatch()` 是核心：在**渲染時**判斷連結型別，
   決定內嵌播放或開新分頁。支援哪些站集中在同檔的 `SITES` 登記表 ——
   **有 `embed` 就是站內播得起來，沒有就是站方擋內嵌只能外開**，加站就加一列。
   `SiteRule.platform` 的型別是 `Platform`（`src/types/media.ts` 的 `PLATFORMS`），
   所以加站時漏加平台名稱會被型別擋下。
   判斷順序是**直鏈優先於登記表**：archive.org 這種同時有頁面與 `.mp4` 的站，
   直鏈能記播放進度，比內嵌好用。
   gimy 只存作品 ID，網域來自 localStorage 全域設定 —— 換網域時改一個地方即可。
   `detectPlatform()` 給表單自動填「來源平台」用，認不出來就回空字串（不猜）。

### 前端結構

- `src/app/page.tsx` — 唯一頁面，orchestration 層。用一個 `Dialog` union 管所有 modal 狀態
- `src/hooks/useAccounts.ts` — 登入/帳號 CRUD。**「目前登入誰」的真實來源是 localStorage**，不是 state
- `src/hooks/useLibrary.ts` — 片庫全部狀態（清單、篩選、排序、樂觀更新）
- `src/hooks/useSettings.ts` — 站點網域設定 + 直鏈影片的播放進度
- `src/lib/localStore.ts` — localStorage 的 `useSyncExternalStore` 封裝
- `src/lib/api.ts` — GAS HTTP 層、統一錯誤處理，以及 `probe()` 連線診斷
- `src/lib/schema.ts` — Sheet 列 ↔ `MediaItem` 映射、舊 schema 髒資料過濾
- `src/lib/quickAdd.ts` — 外部帶網址進來新增的統一入口（分享目標 / 書籤小工具 / 剪貼簿）
- `src/lib/shortcuts.ts` — 使用者自訂的常用站點捷徑，存 localStorage
- `src/lib/backup.ts` — 片庫匯出匯入（純 JSON，以「同名同連結」判重）
- `src/components/*` — 純展示元件，`Modal.tsx` 是共用外殼

### 快速加入的四條路，最後都收斂成同一組 query

`share_target`（manifest）、書籤小工具、`?new=1`（app 圖示長按）與剪貼簿按鈕，
最後都變成 `?url=&title=` 由 `quickAdd.ts` 解析。**query 用 `useSyncExternalStore` 讀，
不要用 `useEffect` + `setState`** —— 靜態輸出下那會造成 hydration mismatch。
分享目標走 GET 而不是 POST，因為靜態站沒有伺服器可以接 POST。

`page.tsx` 的 `active` 是「query 推導出來的 dialog」與「使用者操作的 dialog」的合流，
刻意不在 effect 裡 setState 來開表單，同上理由。

### PWA

- `public/sw.js` 是 service worker 的**原始檔**，含兩個佔位符。
  `npm run build` 會接著跑 `scripts/build-sw.mjs`，掃描 `out/` 把實際的
  產物清單與內容雜湊注入 `out/sw.js`。**改 `public/sw.js` 時不要動那兩行佔位符**，
  build script 找不到會直接拋錯（這是刻意的，避免無聲失去離線能力）
- 為什麼要注入清單：Next 的資源檔名帶雜湊，靜態 SW 事先不知道要快取什麼。
  只靠 cache-first 被動累積的話，首次造訪時 SW 還沒接管，JS chunk 進不了快取 ——
  離線會變成「HTML 開得起來但畫面全白」
- SW 只在 production 註冊（`ServiceWorkerRegistrar`），否則會快取 HMR 資源導致改了程式碼看到舊畫面
- iOS 需要 `apple-mobile-web-app-capable`，但 Next 只輸出標準化的 `mobile-web-app-capable`，
  所以 `layout.tsx` 裡手動補了一行
- `viewportFit: 'cover'` 搭配 `globals.css` 的 `env(safe-area-inset-*)`；
  `Modal.tsx` 因為是 `fixed` 定位脫離 body padding，安全區要自己處理

### 後端不只是資料庫

`apps-script-code.gs` 還負責兩件**只有伺服器做得到**的事，因為瀏覽器不允許跨域：

- `action=fetchMeta&url=` —— 抓對方網頁的標題／封面／總集數。
  優先走官方端點（BiliBili 的 pgc / x-web-interface、YouTube 與 Vimeo 的 oEmbed），
  都對不上才退回抓 HTML 讀 `og:`。標題清洗只砍**認得出來的站名**，
  不要改成砍分隔符號後面的東西 —— 作品名本身就會含 `-` 或 `:`
- `action=search&q=&kind=` —— 查作品資料。來源是 Apple iTunes、Bangumi、
  Google Books，**都不需要 API key**，換成需要金鑰的來源等於把設定成本轉嫁給使用者。
  **但前端只吃它的 Apple 那份** —— Bangumi CORS 全開，瀏覽器直接打
  （`src/lib/bangumi.ts`）比繞後端少一個故障點，也不必為了改搜尋而重新部署

**這兩個 action 是後加的，舊部署不認得**。GAS 的 `doGet` 對未知 action 會
掉進「讀取分頁」的預設分支回一個二維陣列 —— `src/lib/api.ts` 兩處都特別偵測
這個情況並提示要重新部署，加新 action 時記得比照辦理。

### 播放器

- 直鏈的 `.m3u8` **只有 Safari 原生播得動**，其餘瀏覽器靠 `hls.js`。
  它是 `import()` 動態載入的，不播串流就不會下載那包（快 600KB）
- `scripts/build-sw.mjs` 的預快取範圍是**「HTML 真的引用到的產物」**，
  所以動態載入的 chunk 不會被預先下載 —— 串流播放本來就需要網路，
  預快取它對離線沒有幫助，只是白吃流量。加新的動態 import 時不必特別處理
- 播放期間請求 Wake Lock（螢幕不休眠），暫停時放掉
- Media Session API 提供鎖定畫面控制與 Android 的背景音訊。
  iOS 螢幕鎖定必定暫停 `<video>`，內嵌 iframe 的播放器也碰不到 —— 這兩個不是 bug
- 鍵盤快捷鍵綁在播放器與全站兩層，**輸入框聚焦時兩邊都要讓開**，
  否則打字會變成亂按播放器

### 靜態輸出限制

- `next.config.js`：`output: 'export'`、`images.unoptimized`。
  **沒有 `basePath`** —— Cloudflare Pages 站台在網域根目錄，加了反而會壞
- 因此**不可使用**任何 server-only 功能（執行期 Route Handlers、`revalidate`、`force-dynamic`）
- `manifest.ts` 必須保留 `export const dynamic = 'force-static'`
- 所有金鑰一律走 `NEXT_PUBLIC_` 打包進 bundle，沒有伺服器端可藏（設計取捨，非 bug）

### 搜尋

- **Bangumi 走瀏覽器直打，iTunes 走後端** —— 差別在 CORS：Bangumi 全開，
  iTunes 不給標頭。加新來源前先確認它給不給 CORS，決定放哪一邊
- 送出前必須 `toSimplified()`：Bangumi 是簡體站，繁體關鍵字碰到字形差異大的字
  （鑽/钻、靈/灵）會完全搜不到
- `src/lib/t2s.ts` 的對照表含 BMP 外的 4 byte 字，**不可以用 `indexOf` 去索引**
  另一串 —— 那是 UTF-16 code unit 位置，surrogate pair 分布不同會整串錯位
  （實測「鑽石王牌」變成「锅石王牌」）。已改成先 `Array.from` 切字元再建表
- Bangumi 的相關度排序會把廣播劇、畫集排在本篇前面，所以再依
  「動畫 → 劇集 → 書籍」分層，同層維持原名次
- 兩條路用 `Promise.allSettled`：舊版 GAS 不認得 `search` 必定失敗，
  但那不該把 Bangumi 的結果一起拖死

### 播出排程（TVmaze）

- **為什麼要另外接一支 API**：Bangumi 的分集播出日只有日本動畫有，陸劇、韓劇、
  連載中的國漫幾乎都是 0 個播出日。TVmaze 補的正是這幾個洞，免金鑰、CORS 全開
- **授權是 CC BY-SA，必須標示來源** —— 綁定區塊那個連回 TVmaze 作品頁的連結不可以拿掉
- **要使用者手動綁定，不自動比對名稱**：季別後綴、譯名、同名作品都會讓比對出錯，
  猜錯的分母比沒有分母更糟
- 搜尋前要 `bareTitle()` 削掉季別後綴 —— TVmaze 收的是「整部作品」，
  「進擊的巨人 最終季」查不到，削成「進擊的巨人」才有；而且繁簡都要送
- **進度分母用「已播集數」而不是分集清單長度**：TVmaze 連已公布但還沒播的都收，
  拿那個當分母會憑空多出幾集。進度條要回答的是「離最新一集差幾集」
- 下一集的集數用**清單位置**換算成絕對集數：使用者記的是「第 188 集」，
  TVmaze 標的是 S8E12
- 綁定與排程存 localStorage（`src/lib/schedule.ts`），因為那是隨時可重抓的衍生資料，
  而 Sheet 的 15 欄是固定 schema，為它加欄位要同時改三個檔案
- 背景更新的 effect **相依的是字串簽章**而不是整包物件 ——
  那個物件每次 render 都是新的，放進相依陣列會無限重跑

### 狀態同步模式

`useLibrary` 用「本地樂觀更新 + 背景 POST」：`patchItem`、`bumpProgress`、`removeItem`
先改本地 state 再打 GAS，失敗才 `reload(true)` 重抓覆蓋。
新增項目例外 —— 需要後端回傳 `rowNumber` 才能定位，所以是 POST 成功後才插入本地清單。

`removeItem` 刪除後會把後面所有項目的 `rowNumber` 減一，因為 Sheet 刪列會讓後續列號往前移。

**進度加減有 1.2 秒的 debounce**（`useLibrary` 的 `queuePatch`）：連按五下只送最後一次，
畫面照樣立刻更新。分頁關閉時用 `navigator.sendBeacon` 補送還沒出去的那筆 ——
一般 fetch 會隨頁面卸載被中斷。表單的「儲存」不走這條，那是明確的存檔動作，要立刻送。

**觀看紀錄**（`src/lib/history.ts`）與 `useSettings` 的 `pos.{url}` 分工不同，兩者都留著：
前者是「這部作品什麼時候看的」（鍵是名稱＋連結，因為 rowNumber 會因刪列位移），
後者是「這支影片的續播點」（鍵是網址）。

## 重點注意事項

- **React Compiler 已開啟**（`reactCompiler: true`），避免手動 `useMemo/useCallback` 除非確有必要
- **`react-hooks/set-state-in-effect` 是 error**。要在 mount 時讀 localStorage 請用
  `src/lib/localStore.ts` 的 `useStored`（`useSyncExternalStore`），不要用 `useEffect` + `setState` ——
  那在 static export 下會造成 hydration mismatch
- **globals.css 的 `.field` 必須放在 `@layer components` 內**，否則未分層 CSS 會贏過
  Tailwind utility，`className` 上的 `w-auto` 之類會失效
- **`PLATFORMS` 的既有字串只能新增不能改字**：Sheet 存的是字面值，改字會讓舊資料對不上選項。
  `ItemForm` 已經會把「不在清單裡的既有值」補成一個 option，否則 select 顯示空白、一存檔就洗掉原值
- TypeScript path alias：`@/*` → `./src/*`
- 本機驗證前端流程時不需要真的 GAS，可以自己起一個符合合約的 mock HTTP 伺服器，
  把 `NEXT_PUBLIC_APPS_SCRIPT_URL` 指過去
