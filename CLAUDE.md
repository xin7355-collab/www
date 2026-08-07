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

- **部署由 Cloudflare Pages 直接接 Git 完成**，不經過 GitHub Actions。
  push 到 `main` 後 Cloudflare 自己拉程式碼、跑 `npm run build`、發佈 `out/`
- `.github/workflows/ci.yml` **只做 lint + build 把關，不做部署**
- 環境變數 `NEXT_PUBLIC_APPS_SCRIPT_URL` 設在 Cloudflare Pages 專案的 Environment variables；
  本機開發放 `.env.local`
- Node 版本由 `.nvmrc` 決定（Cloudflare Pages 預設的 Node 太舊，跑不動 Next 16）
- 站台前面掛 Cloudflare Access，只有指定 email 能進 —— 這是「只有自己看」的實質防線
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
   決定內嵌播放（YouTube / BiliBili / 直鏈）或開新分頁（gimy / 其他）。
   gimy 只存作品 ID，網域來自 localStorage 全域設定 —— 換網域時改一個地方即可。

### 前端結構

- `src/app/page.tsx` — 唯一頁面，orchestration 層。用一個 `Dialog` union 管所有 modal 狀態
- `src/hooks/useAccounts.ts` — 登入/帳號 CRUD。**「目前登入誰」的真實來源是 localStorage**，不是 state
- `src/hooks/useLibrary.ts` — 片庫全部狀態（清單、篩選、排序、樂觀更新）
- `src/hooks/useSettings.ts` — 站點網域設定 + 直鏈影片的播放進度
- `src/lib/localStore.ts` — localStorage 的 `useSyncExternalStore` 封裝
- `src/lib/api.ts` — GAS HTTP 層，統一錯誤處理
- `src/lib/schema.ts` — Sheet 列 ↔ `MediaItem` 映射、舊 schema 髒資料過濾
- `src/components/*` — 純展示元件，`Modal.tsx` 是共用外殼

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
- TypeScript path alias：`@/*` → `./src/*`
- 本機驗證前端流程時不需要真的 GAS，可以自己起一個符合合約的 mock HTTP 伺服器，
  把 `NEXT_PUBLIC_APPS_SCRIPT_URL` 指過去
