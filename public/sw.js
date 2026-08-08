/**
 * 我的片庫 —— Service Worker
 *
 * 手寫而不用 next-pwa：那套已停止維護，且對 Next 16 的 app router
 * 支援不完整。這個站是純靜態輸出，快取規則簡單到不值得引入依賴。
 *
 * ⚠️ 這是「原始檔」。`npm run build` 會跑 scripts/build-sw.mjs，
 * 把下面兩個 __佔位符__ 換成實際的建置產物清單再寫進 out/sw.js。
 * 直接部署這一份（未經處理）不會壞，只是失去離線能力。
 *
 * 三條規則，依請求類型分流：
 *
 * 1. 導覽請求（開頁面）      → network-first
 *    永遠優先拿最新的頁面；離線時退回快取，至少開得起來。
 *
 * 2. /_next/static/*        → cache-first
 *    Next 的檔名帶內容雜湊，同一個網址的內容永不改變，
 *    所以直接吃快取最快，也不會拿到過期的東西。
 *
 * 3. 其他（含 Apps Script） → 完全不經手
 *    片庫資料必須即時，快取只會讓你看到舊進度。
 *    跨網域請求也一律放行，避免干擾 GAS 的重導向。
 */

const BUILD = '__BUILD_ID__';
const PRECACHE_URLS = ['/'];

const SHELL_CACHE = `shell-${BUILD}`;
const ASSET_CACHE = `assets-${BUILD}`;

const OFFLINE_FALLBACK = '/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(ASSET_CACHE)
      .then((cache) =>
        // 逐一加入而非 cache.addAll —— 後者只要有一個檔案失敗就整批放棄，
        // 少一個圖示不該讓整個離線能力消失
        Promise.all(
          PRECACHE_URLS.map((url) =>
            cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 跨網域（Apps Script、YouTube、封面圖…）一律不碰
  if (url.origin !== self.location.origin) return;

  // 1. 導覽：network-first
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(OFFLINE_FALLBACK, copy));
          return response;
        })
        .catch(() =>
          caches
            .match(OFFLINE_FALLBACK, { ignoreSearch: true })
            .then((hit) => hit || caches.match(request, { ignoreSearch: true }))
            .then(
              (hit) =>
                hit ||
                new Response('離線中，且尚未快取任何頁面。', {
                  status: 503,
                  headers: { 'Content-Type': 'text/plain; charset=utf-8' },
                }),
            ),
        ),
    );
    return;
  }

  // 2. 同源靜態資源：cache-first
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
