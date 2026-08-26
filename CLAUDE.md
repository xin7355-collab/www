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
- `src/lib/api.ts` — GAS HTTP 層，統一錯誤處理
- `src/lib/schema.ts` — Sheet 列 ↔ `MediaItem` 映射、舊 schema 髒資料過濾
- `src/components/*` — 純展示元件，`Modal.tsx` 是共用外殼

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

### 靜態輸出限制

- `next.config.js`：`output: 'export'`、`images.unoptimized`。
  **沒有 `basePath`** —— Cloudflare Pages 站台在網域根目錄，加了反而會壞
- 因此**不可使用**任何 server-only 功能（執行期 Route Handlers、`revalidate`、`force-dynamic`）
- `manifest.ts` 必須保留 `export const dynamic = 'force-static'`
- 所有金鑰一律走 `NEXT_PUBLIC_` 打包進 bundle，沒有伺服器端可藏（設計取捨，非 bug）

### 狀態同步模式

`useLibrary` 用「本地樂觀更新 + 背景 POST」：`patchItem`、`bumpProgress`、`removeItem`
先改本地 state 再打 GAS，失敗才 `reload(true)` 重抓覆蓋。
新增項目例外 —— 需要後端回傳 `rowNumber` 才能定位，所以是 POST 成功後才插入本地清單。

`removeItem` 刪除後會把後面所有項目的 `rowNumber` 減一，因為 Sheet 刪列會讓後續列號往前移。

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
