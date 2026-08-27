# 🎬 我的片庫 — 個人影音串流平台

只給自己用的片庫首頁。把作品、進度、評分、觀看連結收在一起，點一下就開播。

**技術組成**：Next.js static export（Cloudflare Pages）＋ Google Apps Script ＋ Google Sheets。
沒有自建伺服器，沒有月費。

---

## 這個平台做什麼

這是**外部連結目錄**，不是媒體伺服器 —— 它不存放也不轉檔影片，存的是「作品資料 + 一段你自己貼上的觀看連結」。
渲染時才判斷那段連結是什麼，決定要內嵌播放還是開新分頁：

| 你貼的連結 | 行為 |
|---|---|
| `.mp4` / `.webm` / `.m3u8` 等直鏈 | 站內原生播放器，**自動記住播到幾分幾秒**，下次接續 |
| YouTube、BiliBili、Vimeo、Dailymotion、Twitch、niconico、Internet Archive、Google Drive、Streamable | 站內播放器內嵌播放 |
| Netflix、Disney+、動畫瘋 等 17 個站 | 認得出平台名稱，新分頁開啟（站方擋內嵌，見下表） |
| gimy 格式（`/vod/12345.html`） | 抽出作品 ID，用「設定」裡的全域網域重組成 `/eps/12345-1-{下一集}.html`，新分頁開啟 |
| 其他任何網址 | 原樣新分頁開啟 |
| 空白 | 不顯示開播按鈕 |

貼上連結時，**「來源平台」欄會自動填好**（已經自己選過就不覆蓋）。

<details>
<summary>支援的來源站完整清單</summary>

**站內播得起來**（有公開內嵌播放器）

YouTube（含 `youtu.be`／Shorts，走 `youtube-nocookie` 且帶 `?t=` 起始秒數）、
BiliBili（含 `b23.tv`，帶分 P）、Vimeo（含未公開影片的驗證雜湊）、
Dailymotion（含 `dai.ly`）、Twitch（VOD／頻道／Clip）、niconico、
Internet Archive、Google Drive（`/file/d/…` 的預覽播放器）、Streamable

**只能新分頁開啟**（DRM 或站方用 `X-Frame-Options` 擋掉內嵌，任何前端都繞不過）

Netflix、Disney+、Prime Video、Max、Apple TV+、CATCHPLAY+、KKTV、LINE TV、
LiTV、MyVideo、Fridays影音、Hami Video、IQiyi、Viu、WeTV、巴哈姆特動畫瘋、Crunchyroll

要再加一個站，改 `src/lib/watchUrl.ts` 的 `SITES` 登記表加一列即可；
平台名稱要同時加進 `src/types/media.ts` 的 `PLATFORMS`（型別會擋住漏加的情況）。

</details>

gimy 那條是重點：**只存作品 ID，網域存在瀏覽器設定裡**。站方換網域時你只改「設定 > 站點網域」一個欄位，片庫裡所有作品的開播連結一起更新，不用逐條改。

## 功能

- **多帳號**：一個帳號 = Google Sheets 的一張分頁，資料互不干擾
- **六大分類**：電影 / 影集 / 綜藝 / 動漫 / 小說 / 漫畫，分類旁顯示筆數
- **進度追蹤**：卡片上 `＋` `−` 直接加減集數，有總集數時顯示進度條
- **搜尋與篩選**：關鍵字（名稱/備註/平台/國家）、觀看狀態、四種排序
- **完整欄位**：季別、國家、來源平台、類別、評分、封面圖、備註
- **樂觀更新**：操作立刻反映在畫面上，背景同步到 Sheets，失敗自動重抓還原
- **PWA**：可安裝到手機主畫面，全螢幕執行、離線也開得起來（見下方）
- **自動封面**：沒填封面時，從 YouTube / Dailymotion / Internet Archive 的網址推導縮圖
- **備份**：一鍵匯出成 JSON，可匯回同帳號或搬到另一個帳號，以「同名同連結」判重
- **連線診斷**：設定裡有「測試連線」，載不到資料時直接告訴你卡在哪一段

## 貼上網址就自動填好

新增表單裡貼上連結按「自動填」，名稱、封面、總集數、來源平台、分類就自己填好，
**只填空欄位**，你已經打過字的地方不會被蓋掉。

抓取跑在 Apps Script 那邊（瀏覽器不允許跨域讀別人的網頁，靜態站做不到這件事），
優先走官方端點，都對不上才退回抓 HTML 讀 `og:` 標籤：

| 網址 | 走哪條 | 拿得到 |
|---|---|---|
| BiliBili 番劇（ss / ep / md） | 官方 API | 季標題、封面、總集數、分集清單 |
| BiliBili 投稿（BV） | 官方 API | 標題、封面、多 P 集數 |
| YouTube、Vimeo | oEmbed | 標題、縮圖 |
| 其他任何站 | 抓 HTML 讀 og: | 標題、封面 |

標題會清洗掉各站尾巴的招牌（`_番劇_bilibili_哔哩哔哩`、`- YouTube`…），
但只砍認得出來的站名 —— 作品名本身就可能含 `-` 或 `:`。

番劇抓到分集清單時，**預設不會攤成很多筆**：一部番在片庫裡就是一筆，
用「總集數 + 目前進度」追就好。若每一話其實是獨立作品，可以按
「改成每話各建一筆」帶進批次加入。

## 搜尋

搜尋視窗有兩個分頁：

**YouTube 影片** —— 直接搜 YouTube，看縮圖挑片，一鍵加進片庫（**連觀看連結都自動填好**），
也能貼一份播放清單網址整份匯入。需要在設定填 YouTube Data API 金鑰，
金鑰只存在你這台裝置的瀏覽器，不會上傳也不在程式碼裡。
免費額度每天約 100 次搜尋，播放清單匯入幾乎不花額度。

**作品資料** —— 查作品本身

片庫右上角 🔍，輸入名稱就查得到封面與集數，一鍵帶進新增表單。
三個來源都不需要 API key：**Apple iTunes**（電影／影集）、
**Bangumi**（動漫／漫畫）、**Google Books**（小說）。

查到的是**作品資料，不含觀看連結** —— 這些來源給的是資料頁不是片源，
而且每個人訂閱的平台不一樣，連結還是要自己貼。

**按「加入」直接進片庫，不會跳出表單**。也可以打勾多筆一次加入。
搜過的關鍵字會記在搜尋框下方，點一下就重查。

小說與漫畫通常查不到「能看的連結」，這時會先指到來源頁（Bangumi、MangaDex 的作品頁），
至少點得進去；之後找到真正在看的站，再從卡片的「編輯」換掉即可。

**搜尋結果會自動轉成繁體**。Bangumi 是簡體站、MangaDex 的中文條目也多半是簡體，
不轉的話片庫裡會同時出現「凡人修仙传」跟「凡人修仙傳」。轉換用的是 OpenCC 的
詞表（不是逐字硬換 —— 那會把「斗罗大陆」轉成「鬥羅大陸」），
並且順帶換成台灣用語。已經是繁體的原樣不動。
字典是用到才下載的，平常開 App 不會多花流量。

這個功能是後來才加的，**在那之前存進去的標題還是簡體** ——
設定裡有「片庫轉繁體」可以一次補轉，會先列出要改成什麼樣子，確認後才寫回去。

## 外觀

設定裡可以換**背景**（墨黑／純黑／深藍夜／羊皮紙）與**字體大小**（小／標準／大／特大）。
字級會連同間距一起縮放，不是只有字變大而框沒變。

兩者都只影響這台裝置 —— 手機想放大字、電腦維持原樣，互不干擾。

## 站點目錄

內建 46 個常見正版服務，按分類分組，點站名直接前往或「＋ 捷徑」釘到片庫上方。
要加目錄以外的站，用下面的「常用站點捷徑」自己填。

## 四種快速加入的方式

打字是加片最大的摩擦點，所以有四條路都能把「在別處看到的連結」變成片庫裡的一筆：

| 方式 | 怎麼用 | 適合 |
|---|---|---|
| **剪貼簿** | 複製網址 → 按片庫右上角 📋 | 隨手一筆 |
| **手機分享** | 在任何 app 點分享 → 選「我的片庫」 | Android（iOS 不支援分享目標） |
| **書籤小工具** | 設定裡複製程式碼 → 存成書籤 → 在影片頁點一下 | 桌機，**會連網頁標題一起帶回來** |
| **批次加入** | 新增表單左下「批次加入」→ 一行一筆 | 一次搬很多筆 |

批次支援三種寫法：`名稱 | 連結`、只有連結（自動推一個暫定名稱）、只有名稱（連結之後再補）。

長按手機上的 app 圖示也有「新增作品」的捷徑。

## 常用站點捷徑

設定裡可以自訂常去的來源站，片庫上方就會出現一排一鍵前往的連結。
捷徑可以綁分類 —— 綁了「動漫」的只在動漫分類出現，不綁的每個分類都顯示。

## 播放器

- **HLS 串流**：`.m3u8` 只有 Safari 原生播得動，其他瀏覽器靠動態載入的 hls.js
- **快捷鍵**：空白鍵播放/暫停、`←` `→` 快轉 10 秒、`↑` `↓` 音量、`F` 全螢幕、`M` 靜音
- **倍速**（0.75×–2×）與**子母畫面**
- **螢幕不休眠**：播放中請求 Wake Lock，手機橫躺看片不會熄螢幕
- **鎖定畫面控制**：接上 Media Session API，鎖定畫面／通知列會出現播放控制，
  Android 上關掉螢幕後音訊能繼續。
  兩個擋不掉的限制：iOS Safari 螢幕鎖定時會暫停 `<video>`；
  內嵌的 YouTube / BiliBili 是對方 iframe 裡的播放器，我們碰不到它的 media session
- **續播**：顯示「從 12:34 接續」，也可以一鍵從頭播放
- **播完自動記一集**：影片播到結束就進度 +1，並清掉續播點
- **跳過片頭片尾**：在播放器按「片頭到這」標一次，之後每一集共用。
  播到片頭區間時浮出「跳過片頭」，可設成自動跳過（自動只作用於片頭 ——
  自動跳片尾等於幫你結束播放）。只對直鏈影片有效，內嵌的播放器我們碰不到

片庫本身也有快捷鍵：`/` 聚焦搜尋、`n` 新增、`r` 重新整理，`🎲` 從還沒看完的裡面隨機挑一部。

> **關於擋廣告**：站內播放器是用 `iframe` 內嵌對方網站，跨網域的內容瀏覽器不允許我們讀取或修改，
> 所以**前端無法對內嵌的第三方站擋廣告** —— 這是瀏覽器的同源政策，不是還沒做。
> 真的要擋只能靠瀏覽器層的擴充功能或 DNS 層過濾。站內能做的是：YouTube 走 `youtube-nocookie`，
> 而直鏈影片用原生播放器，本來就沒有廣告。

## 安裝到手機

站台是完整的 PWA，裝起來跟原生 app 沒兩樣 —— 有自己的圖示、全螢幕執行、沒有網址列。

- **iPhone / iPad**：Safari 開啟 → 分享按鈕 → **加入主畫面**
- **Android**：Chrome 開啟 → 網址列右側或選單的 **安裝應用程式**

離線時 app 本身照樣打得開（介面、圖示、樣式都預先快取了），
只是**讀不到片庫內容** —— 資料在 Google Sheets，沒網路就拿不到。

Service worker 的快取策略：

| 請求 | 策略 | 理由 |
|---|---|---|
| 開啟頁面 | network-first | 永遠優先拿最新版，離線才退回快取 |
| `/_next/static/*` | cache-first + 建置時預快取 | 檔名帶內容雜湊，同網址內容永不變 |
| Apps Script API | 完全不快取 | 片庫進度必須即時，快取只會讓你看到舊資料 |

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

### 第三步：部署到 Cloudflare Pages

用 Cloudflare 而不是 GitHub Pages，理由有兩個：**私有 repo 也能免費部署**，以及可以用
Cloudflare Access 把整個站鎖成「只有我的 Google 帳號能登入」—— GitHub Pages 做不到這件事
（即使 repo 是 private，產出的網站仍然是公開的）。

Cloudflare 目前有 **Pages** 和 **Workers** 兩條路，儀表板會依版本把你導向其中一條。
兩條都能用，repo 已經同時備好。**建議優先走 Pages**，因為它有現成的 Access 開關（見第四步）。

#### 路線 A：Pages（建議）

1. 到 [dash.cloudflare.com](https://dash.cloudflare.com) 註冊（免費方案就夠）
2. **Workers & Pages > Create**，選 **Pages** 分頁 > **Connect to Git**，授權 GitHub 後選這個 repo
3. 建置設定：

   | 欄位 | 值 |
   |---|---|
   | Framework preset | `Next.js (Static HTML Export)` |
   | Build command | `npm run build` |
   | Build output directory | `out` |

4. 展開 **Environment variables**，新增 `NEXT_PUBLIC_APPS_SCRIPT_URL` = 第一步的網址
5. **Save and Deploy**

網址會是 `https://<專案名>.pages.dev`。

#### 路線 B：Workers

如果建立畫面上寫的是「Configure your **Worker** project」、Deploy command 是
`npx wrangler deploy`、而且**找不到 Build output directory 欄位**，那你在 Workers 流程。
這條路靠 repo 根目錄的 [`wrangler.jsonc`](./wrangler.jsonc) 指定進入點與靜態資源目錄，照著填即可
（**想用第四步的密碼閘門就得走這條**）：

| 欄位 | 值 |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Path | `/` |
| Variable name | `NEXT_PUBLIC_APPS_SCRIPT_URL` |
| Variable value | 第一步的網址 |

網址會是 `https://<專案名>.<你的子網域>.workers.dev`。

---

兩條路都一樣：Node 版本由 `.nvmrc` 決定（不必另外設 `NODE_VERSION`），
之後每次 push 到 `main` 都會自動重新部署。

### 第四步（重要）：把站鎖起來

到這一步為止，任何知道網址的人都能打開你的片庫。**而且不只是看畫面** ——
`NEXT_PUBLIC_APPS_SCRIPT_URL` 打包在 JS bundle 裡，抓得到 bundle 就等於拿到你試算表的讀寫權。
所以閘門必須擋住**所有靜態檔案**，只擋 HTML 是沒有用的。

兩種鎖法，擇一即可。

#### 鎖法 A：Cloudflare Access（Email 驗證碼，最正統）

1. **Zero Trust > Access > Applications > Add an application > Self-hosted**
2. Application domain 填你的站台網址（Pages 專案就選 `<專案名>` + `pages.dev`）
3. Policy：Action 選 **Allow**，Include 選 **Emails** 並填你自己的 email

任何人打開網址都會先看到 Cloudflare 的登入頁，只有白名單 email 收得到驗證碼。
免費方案含 50 個使用者，個人用綽綽有餘。

**代價**：要先啟用 Zero Trust。Free 方案最終金額是 $0，但註冊流程仍會要求綁定付款方式。

#### 鎖法 B：內建密碼閘門（不用綁卡，需走 Workers 路線）

repo 內建一道密碼閘門，程式在 [`worker/gate.js`](./worker/gate.js)：

- 驗證通過後發一張 **HMAC 簽章的 cookie**（30 天），簽章金鑰就是密碼本身 ——
  改密碼等於讓所有舊 cookie 失效，不必另外管理 session
- 密碼比對先各自雜湊再比，長度固定，不從比對耗時洩漏長度
- **沒設 `SITE_PASSWORD` 時直接放行** —— 寧可沒鎖，也不要因為忘了設而把自己關在門外

設定方式（**必須是 Workers 路線**，見下方說明）：

1. 專案 **Settings > Variables and Secrets** 新增 **Secret**（不是普通變數）
   `SITE_PASSWORD` = 你要用的密碼
2. 重新部署一次讓它生效
3. **用無痕視窗實測**：應該看到黑底的密碼頁，輸入正確密碼才進得去

⚠️ **為什麼一定要 Workers 路線**：關鍵是 `wrangler.jsonc` 的
`assets.run_worker_first: true` —— 它保證 Worker 跑在靜態資源**之前**。
沒有這個保證的話，`/index.html`、`/_next/*.js` 這些「有對應檔案的路徑」會直接被送出，
閘門只擋得到不存在的路徑，等於沒鎖。

repo 裡也放了 Pages 版本的 [`functions/_middleware.js`](./functions/_middleware.js)，
但 Pages 的靜態資源可能先於 Functions 被送出（本機模擬器實測就是如此）。
**若你走 Pages 路線，務必用無痕視窗確認真的擋住了**；沒擋住就改走 Workers。

**代價**：單一共用密碼，沒有 MFA、沒有多帳號、沒有登入紀錄。個人用夠，要正經權限控管請用鎖法 A。

### 第五步：第一次使用

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

每個帳號分頁固定 19 欄，第 1 列為凍結表頭：

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
| P | 排程ID | `tvmazeId` |
| Q | 已播集數 | `airedEp` |
| R | 下一集日期 | `nextAirDate` |
| S | 下一集集數 | `nextEpLabel` |

P–S 四欄由 Apps Script 的每日觸發器維護（設定裡按「安裝每日更新」裝一次即可），
所以播出排程在所有裝置上都一致，開 App 時也不用等 API。

改動欄位順序會同時破壞 `apps-script-code.gs` 的 `HEADERS`/`FIELD_COLUMN` 與 `src/lib/schema.ts` 的 `COLUMN_ORDER`，三處必須一起改。

### 從舊的追番 app 沿用同一份試算表

舊的 5 欄 schema（`最後更新時間 / 作品名稱 / 目前進度 / 最新進度(AI) / 追蹤`）可以直接接上：
前 3 欄語意完全相同，後端讀取時會自動補足表頭與欄位，**不會動到既有資料**。

兩個遺留欄位的落點：

- D 欄「最新進度(AI)」→ 落到 `總集數`。數字通常還算合理，先留著，不對就直接編輯
- E 欄「追蹤 TRUE/FALSE」→ 落到 `類型`，前端偵測到 `TRUE`/`FALSE` 會濾掉顯示成空白，重新選分類即可

---

## 已知限制

- **不託管影片**：靜態站沒有儲存空間也沒有轉檔能力。想放自己的影片檔要改成自架方案（Docker + 資料庫 + ffmpeg）
- **iframe 內嵌只對允許內嵌的站有效**：YouTube、BiliBili 可以；多數影音站會用 `X-Frame-Options` 擋掉，所以那些一律走新分頁開啟
- **設定存在 localStorage**：站點網域與播放進度是 per-browser 的，換裝置要重設
- **Apps Script URL 會被打包進 bundle**：靜態站沒有伺服器端可藏密鑰（見上方警告）。
  第四步的閘門（Access 或密碼閘門）是這一點的實質防線 —— 沒通過的人連 bundle 都下載不到。
  但**閘門擋不到 Apps Script 本身**：那串 `/exec` 網址不經過 Cloudflare，知道的人仍可直接讀寫試算表
- **沒有測試框架**：`npm run lint` 是唯一的自動化檢查

## 資料來源與授權

- **TVmaze**（播出排程）—— CC BY-SA。綁定區塊那個連回 TVmaze 作品頁的連結是授權要求，不可以拿掉
- **TMDB / JustWatch**（上架平台）—— TMDB 條款要求標示 providers 資料來自 JustWatch，
  結果列那個 JustWatch 連結不可以拿掉
- **OpenCC**（簡→繁字典）—— Apache-2.0。`src/lib/s2tData.ts` 是從它的詞表產出來的精簡版，
  產生方式見 `scripts/build-s2t.mjs`
- **Bangumi、MangaDex、Internet Archive、Apple iTunes、Google Books** —— 皆為免金鑰的公開 API
