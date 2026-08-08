/**
 * 建置後處理：把實際的產物清單注入 service worker。
 *
 * 為什麼需要這一步：Next 的資源檔名帶內容雜湊，靜態的 sw.js 事先不可能
 * 知道要快取哪些檔案。若只靠 cache-first 被動累積，第一次造訪時 SW 尚未
 * 接管，那些 JS chunk 不會進快取 —— 結果就是離線時 HTML 開得起來但畫面全白。
 *
 * 所以在這裡掃描 out/，把清單與一組內容雜湊寫進 out/sw.js。
 * 雜湊同時當作快取版本：產物有變才換 key，沒變就沿用舊快取。
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';

const OUT = 'out';
const SW = join(OUT, 'sw.js');

/** 遞迴列出 out/ 底下所有檔案的相對路徑 */
function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...walk(full));
    else found.push(full);
  }
  return found;
}

const files = walk(OUT);

const toUrl = (file) => '/' + relative(OUT, file).split(sep).join(posix.sep);

// 要離線可用的東西：app shell、PWA 資源，以及所有帶雜湊的靜態資源。
// 刻意排除 sw.js 自己（不能快取自己）與 .txt 的 RSC payload（單頁站用不到）。
const precache = files
  .map(toUrl)
  .filter((url) => {
    if (url === '/sw.js') return false;
    if (url.startsWith('/_next/static/')) return !url.endsWith('.map');
    return ['/index.html', '/404.html', '/manifest.webmanifest'].includes(url) ||
      /^\/(icon|apple-touch-icon)[\w.-]*\.(png|svg)$/.test(url);
  })
  // '/' 才是導覽時真正請求的網址，index.html 只是它的檔案形式
  .map((url) => (url === '/index.html' ? '/' : url))
  .sort();

// 版本 = 所有被快取檔案內容的雜湊。內容沒變就不會產生新快取。
const hash = createHash('sha256');
for (const file of files.filter((f) => toUrl(f) !== '/sw.js').sort()) {
  hash.update(readFileSync(file));
}
const buildId = hash.digest('hex').slice(0, 12);

const source = readFileSync(SW, 'utf8');

for (const marker of ['__BUILD_ID__', "const PRECACHE_URLS = ['/'];"]) {
  if (!source.includes(marker)) {
    throw new Error(`sw.js 找不到佔位符 ${marker} —— public/sw.js 是不是改過了？`);
  }
}

const patched = source
  .replace('__BUILD_ID__', buildId)
  .replace(
    "const PRECACHE_URLS = ['/'];",
    `const PRECACHE_URLS = ${JSON.stringify(precache, null, 2)};`,
  );

writeFileSync(SW, patched);

console.log(`✓ sw.js：預快取 ${precache.length} 個檔案，版本 ${buildId}`);
