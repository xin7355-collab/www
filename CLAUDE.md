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

2. **Google Sheets 當資料庫**：一個「帳號」= 一張分頁，固定 19 欄（A–S）。
   P–S 四欄（排程ID / 已播集數 / 下一集日期 / 下一集集數）由**後端的每日觸發器**維護，
   前端只在綁定當下寫一次 `tvmazeId`。
   `rowNumber`（實際列號，從 2 起算）是所有更新的唯一定位鍵，比名稱比對可靠。
   欄位順序定義在三個地方，**改一處必須三處一起改**：
   - `apps-script-code.gs` 的 `HEADERS` 與 `FIELD_COLUMN`
   - `src/lib/schema.ts` 的 `COLUMN_ORDER`
   - `src/types/media.ts` 的 `MediaItem`

   建立空白一筆一律用 `schema.ts` 的 `emptyItem()`，不要各自手寫物件字面值 ——
   加欄位時會有人漏掉（新增表單、批次加入、YouTube 搜尋都用它）。

   **會就地改動資料的 modal 要取片庫裡最新的那筆**，不能用開啟當下的快照：
   編輯表單與播放器都踩過這個 —— 綁定排程或按進度 +1 之後畫面不會更新。

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

### 樂觀更新與「還在路上」的那一筆

- 新增現在是**先把卡片畫出來，再送 GAS**。等一兩個來回才顯示，按下加入
  會像沒反應
- 那些還沒拿到真列號的暫時用**負數列號**（`useLibrary` 的 `nextTempRow`）。
  真實列號從 2 起算，負數不可能撞到；卡片看到負數就把編輯、刪除、改進度
  鎖起來 —— 那些操作全靠列號定位，真列號回來之前做會寫到隔壁那部身上
- POST 失敗時要把沒送成功的那幾張**收回去**，否則畫面上會留著一筆後端
  根本沒有的資料
- 表單送出後立刻關閉，不等後端。失敗的話 `library.error` 會浮出來
- 登入用開站時 `init` already 抓好的帳號列表，不再多打一次 GAS

### 卡片設計

改版前是「封面 + 六個堆疊區塊」（狀態／季別／國家／平台各佔一列、進度一列、
開播編輯刪一列），手機兩欄下每張卡都變成一座高塔。現在只留封面、標題、進度：

- **點封面就是開播**，不做成按鈕 —— 十次操作有九次是這個
- 進度只留「點數字直接輸入」，**沒有 ± 按鈕**：從 0 追到第 138 話用按的
  要按一百多次，兩顆按鈕佔的位置換不到對等的價值
- 批次選取時點封面變成勾選而不是開播，右上角的 ⋯ 換成打勾指示
- 編輯／查中文名／刪除收進封面右上的 ⋯。那顆 ⋯ **必須放在封面 `<button>` 外面**，
  否則點它會連帶觸發開播
- ⋯ 的關閉遮罩是一個 `fixed inset-0` 的按鈕，不是 hover 判定 ——
  手機沒有「滑鼠移開」這回事
- **卡片就只有一張封面的高度**：標題與進度疊在封面底部的漸層上，
  而不是排在圖片下面。手機兩欄下實測 193×121
- 「落後幾集」收成封面上的一顆小標籤 —— 那是追連載時唯一想知道的，
  其餘（下一集日期、多久前看過）都拿掉了
- 狀態標籤拿掉了：上方本來就有狀態篩選器，每張卡再標一次是重複資訊

### 待追分頁

- `episodesBehind()` 放在 `schedule.ts`，**卡片提示、分頁篩選、分頁計數三處共用**。
  各自算一份很容易在改動時漂掉，變成分頁裡有這部、卡片上卻說已追上
- 「待追」不是 `MAIN_TYPES` 之一，是一個狀態篩選，所以 `BEHIND_TAB` 是獨立常數
- 沒有落後的作品時整個分頁不顯示，免得多一個永遠是 0 的分頁

### 刪除要用「名稱::連結」定位，不是列號

`removeMany` 收的是 `itemKey` 不是 `rowNumber`。**列號會過期** ——
別台裝置刪過一列、或先前有一次寫入沒同步，本地記的列號就跟 Sheet 對不上：
輕則刪到隔壁那部作品，重則撞上 GAS 的「列號超出範圍」。實測過期兩列的情況下，
舊寫法會把整個片庫刪光還在畫面上留下兩張幽靈卡片。

所以流程是：**先跟後端對一次答案**拿到當下真正的列號 → 由大到小刪
→ 刪完一律重抓，不自己推算新的列號。單筆刪除失敗也改成重抓，
還原一份同樣過期的快照沒有意義。

### 清理重複

- 判重是「連結相同**或**標題相同」：只看標題的話，同一支影片從不同來源加進來
  標題會不一樣；只看連結的話，手動加的常常沒填連結
- **刪除一定要由大到小刪**：Sheet 刪掉一列會讓後面每一列的列號往前移一位，
  由小到大刪的話第二筆之後全部會刪到隔壁的作品

### 外觀設定（主題 / 字級）

- 顏色定義在 `globals.css` 的 `:root[data-theme=...]`，**元件一律用語意 token**
  （`text-mist`、`bg-ink-deep`），所以加主題不必動任何一支元件 ——
  加一個 `[data-theme]` 區塊，再去 `appearance.ts` 登記一列就好
- Tailwind v4 的 `@theme inline` 是刻意的：`inline` 會保留 `var()` 參照而不是
  在建置時解析，執行期改 `--ink-black` 才會傳導出去。**改成非 inline 就換不了主題**
- 字級是縮放 `html` 的 `font-size`（`calc(100% * var(--font-scale))`）。
  Tailwind 的 `text-*` 與間距都是 rem，所以整個介面一起放大，
  不會只有字變大而框沒變。用百分比而不是固定 px，才會尊重瀏覽器本身的字級設定
- **`layout.tsx` 有一段行內腳本在首次繪製前就套好主題**。少了它每次開站都會
  先閃一下墨黑再跳成使用者選的主題 —— 靜態輸出沒有伺服器可以先讀 cookie，
  只能同步讀 localStorage。那段腳本的鍵名與 `appearance.ts` 的
  `APPEARANCE_KEYS` 必須一致
- 淺色主題要把 `--grain-opacity` 設為 0：那層顆粒雜訊是為深底調的，
  鋪在亮底上會變成一層髒污

### 搜尋只有一個搜尋框

來源（Bangumi、TMDB、iTunes、Google Books、MangaDex、Internet Archive、YouTube）
全部合成同一份清單，在 `api.ts` 的 `searchWorks` 收斂。**來源是後端的事**，
不該讓使用者先選分頁再搜 —— 結果列上的來源標籤只是讓人知道資料哪來的。

YouTube 對 `小說`／`漫畫` 不送（查影片對它們沒意義，而且 search 一次 100 單位）。

### 小說漫畫的「去哪裡看」

Bangumi 給的是**資料頁**不是內文，點進去只會看到條目介紹。
`readingLinks()` 把作品名帶到各正版平台的搜尋頁，找到之後把網址存回
`watchUrl`，下次點卡片就直接到那裡。

**這個站不代管也不抓取任何內文** —— 它是連結目錄。這條界線不要跨過去。

### 搜尋加入的流程

- **按「加入」直接寫進片庫，不開表單**。十筆裡有九筆是照抄搜尋結果，
  為了偶爾要改的那一筆每次都跳表單並不划算；要改細節從卡片的「編輯」進去
- 單筆與批次共用同一條路（`onAdd`），批次也是**逐筆送** ——
  `addMany` 本來就不能並行，後端每次 append 都會改變列號
- 補查（TMDB 總集數、Internet Archive 直鏈）只在真的要加入時才做，
  不是每筆結果都查：一次搜尋十筆，全查等於十倍的 API 呼叫
- 結果的識別鍵是 `來源::url::標題`，**不能只用 url** ——
  同一部作品在不同來源會給同一個來源頁，只用 url 會一起被勾選
- **小說漫畫沒有可播的連結時退回來源頁**（`watchUrlOf`）：與其給一顆按不下去的
  「無連結」，不如讓它至少開得到作品頁。既有資料也吃得到 ——
  `watchUrlOf` 找不到 `watchUrl` 時會去備註裡撈第一個 http(s) 網址
- 外開的連結**也要 `recordWatch`**，否則小說漫畫這種只能外開的永遠不會出現在
  「繼續觀看」。沒有秒數可記（開在別的分頁量不到），但「上次看的是這部」才是重點

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
- **片頭片尾標記**（`src/lib/skipMarks.ts`）是整部作品共用的，因為同一部番每集的
  OP 長度幾乎一樣。自動跳過**只作用於片頭** —— 自動跳片尾等於幫使用者結束播放。
  「跳過片尾」是跳到 `duration - 0.5` 讓它自然播完觸發 `ended`，
  進度 +1 那條路才不必在這裡重寫一份
- Media Session API 提供鎖定畫面控制與 Android 的背景音訊
- **背景播放靠 `<video>` → `<audio>` 交接**：iOS 會在螢幕鎖定或切走 app 時
  暫停 `<video>`，那是 WebKit 的規則，Media Session 救不了；但同一個來源餵給
  `<audio>` 就允許在背景播。所以 `visibilitychange` 進背景時暫停影片、
  用音訊從同一個時間點接著播，回前景再換回來
- 交接之後**存進度、鎖定畫面的按鈕、播完 +1 都要認 `activeEl()`**，
  寫死 video 的話一進背景就全部停擺
- HLS 只在瀏覽器原生吃得下 m3u8 時才準備 `<audio>`（等於只有 Safari／iOS）——
  其餘瀏覽器要靠 hls.js，而它們本來就能在背景播音訊，不需要這場接力
- **內嵌 iframe（YouTube / BiliBili）兩者都救不了**：那是對方頁面裡的播放器，
  我們碰不到它的 media 元素
- 鍵盤快捷鍵綁在播放器與全站兩層，**輸入框聚焦時兩邊都要讓開**，
  否則打字會變成亂按播放器

### 靜態輸出限制

- `next.config.js`：`output: 'export'`、`images.unoptimized`。
  **沒有 `basePath`** —— Cloudflare Pages 站台在網域根目錄，加了反而會壞
- 因此**不可使用**任何 server-only 功能（執行期 Route Handlers、`revalidate`、`force-dynamic`）
- `manifest.ts` 必須保留 `export const dynamic = 'force-static'`
- 所有金鑰一律走 `NEXT_PUBLIC_` 打包進 bundle，沒有伺服器端可藏（設計取捨，非 bug）

### 搜尋

搜尋視窗有兩個分頁，解決的是不同問題：
- **作品資料** —— 查作品本身（名稱、封面、集數），**不含能播的連結**
- **YouTube 影片** —— 查實際的影片，加入時連 `watchUrl` 一起帶進去

**YouTube 走 Data API v3，金鑰存 localStorage 不進 bundle**。
靜態站沒有伺服器可以藏東西，寫進建置變數等於公開給所有人用使用者的額度。
爬 YouTube 搜尋頁不是可行的替代 —— 跨域擋掉、HTML 動態產生、也違反 ToS。
額度成本：search 100 單位、videos 與 playlistItems 各 1 單位（每天 10,000）。
所以搜尋結果的長度是**第二次請求**補上的，不要為了省一次請求把它拿掉。

- **TMDB 補電影與影集**：正式繁中片名、海報、總集數。需要免費金鑰，同樣存 localStorage
- 總集數只在按下「加入」時才查，不是每筆結果都查 —— 一次搜尋十筆，全查等於十倍的呼叫
- **watch providers（在台灣哪個平台上架）拿掉了**：那些平台都要另外付費，
  使用者不需要。連帶 JustWatch 的出處標示也不再需要（那是顯示 providers 才有的義務）
- **MangaDex 補漫畫的話數**：Bangumi 的書籍條目幾乎不填話數，等於沒有進度分母。
  它的中文名常常只在 `altTitles` 裡，主 `title` 只有英日文，兩邊都要找
- **Internet Archive 是唯一給得出影片直鏈的來源**。搜尋只給詳情頁，
  按下「加入」時才多打一次 metadata 換成直鏈 —— 拿到直鏈這部片才享有
  原生播放器的全部能力（記進度、跳片頭、鎖定畫面控制）
- **Bangumi 走瀏覽器直打，iTunes 與 Google Books 走後端** —— 差別在 CORS：Bangumi 全開，
  iTunes 不給標頭。加新來源前先確認它給不給 CORS，決定放哪一邊
- 送出前必須 `toSimplified()`：Bangumi 是簡體站，繁體關鍵字碰到字形差異大的字
  （鑽/钻、靈/灵）會完全搜不到
- `src/lib/t2s.ts` 的對照表含 BMP 外的 4 byte 字，**不可以用 `indexOf` 去索引**
  另一串 —— 那是 UTF-16 code unit 位置，surrogate pair 分布不同會整串錯位
  （實測「鑽石王牌」變成「锅石王牌」）。已改成先 `Array.from` 切字元再建表
- Bangumi 的相關度排序會把廣播劇、畫集排在本篇前面，所以再依
  「動畫 → 劇集 → 書籍」分層，同層維持原名次
- **回來的結果一律走 `src/lib/s2t.ts` 轉成繁體**，統一在 `api.ts` 的 `searchWorks`
  收斂處理。不轉的話片庫會同時出現「凡人修仙传」與「凡人修仙傳」——
  使用者按「加入」時存進 Sheet 的就是這個標題。已經是繁體的原樣通過，
  所以 TMDB 那份正式繁中片名不受影響
- **簡→繁不可以把 `t2s.ts` 反過來用**：那是一對多的。「发」可能是發也可能是髮，
  「里」可能是裡也可能是里 —— 只有看詞才分得出來，逐字對照必錯
  （實測只用字表：斗罗大陆 → 鬥羅大陸、钢之炼金术师 → 鋼之煉金術師，都錯）
- 字典是 `scripts/build-s2t.mjs` 從 OpenCC 產出來的精簡版，產物 `src/lib/s2tData.ts`
  已 commit，**正式建置不需要 opencc-js**（它只是 devDependency）。
  為什麼要精簡：完整的 cn2t gzip 後 447KB，對行動裝置優先的 PWA 不合比例。
  詞表裡有八成的詞條逐字套字表就會得到一樣的結果，但**不能直接砍掉** ——
  比對是最長匹配，砍掉「一出去」之後「一出」會搶著匹配變成「一齣去」，
  砍掉「不断发展」之後中間的「断发」會匹配變成「不斷髮展」。
  所以用不動點：砍完拿整份語料跟完整版對答案，把造成差異的詞條補回去，
  補到零差異為止（第二輪就收斂）。壓到 122KB 而且輸出與完整版逐字相同。
  改動後重跑 `npm run build:dict`
- 轉換用的 trie 是自己寫的（`s2t.ts`），不是引用 opencc-js —— 這樣才保證
  只有精簡字典會進 bundle。**改了那支 trie 必須重新跟 opencc-js 對答案**，
  比對規則差一點結果就不一樣了
- 字典跟 hls.js 一樣是 `import()` 動態載入的，不搜尋就不會下載那包
- 設定裡的「片庫轉繁體」是補既有資料用的（自動轉是後來才加的，在那之前存的還是簡體）。
  **一定要先預覽再寫**：那是一次改一整批真實資料，該讓人看過改成什麼樣子；
  而且要逐筆送，並行會被後端擋，失敗了也說不清哪幾筆成功
- 五個來源用 `Promise.allSettled`：舊版 GAS 不認得 `search` 必定失敗，
  但那不該把其他來源的結果一起拖死。**後端那份要濾掉 `source === 'Bangumi'`**
  —— 瀏覽器自己會直打，不濾會出現兩份一樣的結果；但 Apple 與 Google Books
  沒有 CORS，只有後端拿得到，**不可以一起濾掉**（曾經犯過這個錯，小說搜不到東西）

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
- **綁定與排程存 Sheet 的 P–S 欄，不是 localStorage**：原本存本機，
  但那是 per-device 的 —— 在手機綁完換電腦什麼都看不到
- `refreshSchedules()` 由**每天早上 8 點的觸發器**呼叫（設定裡有一鍵安裝）。
  它的 `buildSchedule` 必須與 `src/lib/tvmaze.ts` 那份算出相同結果，
  否則畫面會在「前端剛算完」與「後端隔天更新」之間跳動
- 前端仍保留一次補救性的重抓，**判斷依據是「下一集是不是已經播了」而不是時間戳** ——
  播出表在下一集播出前不會變，用時間輪詢只是白打 API
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

**存在瀏覽器本機的衍生資料**（觀看紀錄、播出排程、片頭片尾標記）共用
`src/lib/itemKey.ts` 的鍵：`名稱::連結`。**不要用 rowNumber** —— 刪除任何一列都會讓
後面的列號整批位移，紀錄就會悄悄對到別部作品上。

`useSettings` 的 `pos.{url}` 是另一回事，鍵是網址：那是「這支影片的續播點」，
換一集就是另一筆；上面那些是「這部作品的」。兩者都留著。

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
