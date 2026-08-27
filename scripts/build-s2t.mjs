/**
 * 產生簡→繁（台灣用語）轉換用的精簡字典 —— src/lib/s2tData.ts
 *
 * 為什麼要自己產一份，而不是直接用 opencc-js：
 * opencc-js 的 cn2t 整包 gzip 後 447KB。這個站是行動裝置優先的 PWA，
 * 為了把搜尋結果的簡體標題轉成繁體而讓使用者下載將近半 MB 不合比例。
 *
 * 觀察：STPhrases（詞表）裡有八成的詞條，逐字套 STCharacters（字表）就會得到
 * 一模一樣的結果 —— 那些詞條是白佔位置的。但**不能**直接把它們全砍掉：
 * 比對是最長匹配，砍掉「一出去」之後「一出」會搶著匹配，變成「一齣去」；
 * 砍掉「不断发展」之後中間的「断发」會匹配，變成「不斷髮展」。
 * 所以用不動點：先砍，再拿整份語料跟完整版對答案，把造成差異的詞條補回去，
 * 補到零差異為止。實測第二輪就收斂，gzip 後 447KB → 122KB，輸出逐字相同。
 *
 * 產物已 commit，正式建置不需要 opencc-js。改動時重跑：
 *   node scripts/build-s2t.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DICT = path.join(ROOT, 'node_modules/opencc-js/dist/esm-lib');

let ConverterFactory;
try {
  ({ ConverterFactory } = await import(path.join(DICT, 'core.js')));
} catch {
  console.error('找不到 opencc-js —— 這支腳本只在重新產生字典時需要它：npm i -D opencc-js');
  process.exit(1);
}

const load = async (name) => (await import(path.join(DICT, 'dict', `${name}.js`))).default;
const parse = (s) => s.split('|').map((e) => { const i = e.indexOf(' '); return [e.slice(0, i), e.slice(i + 1)]; });
const serialize = (pairs) => pairs.map(([a, b]) => `${a} ${b}`).join('|');

const [STPhrases, STCharacters, TWPhrases, TWVariantsPhrases, TWVariants, STGenerated] = await Promise.all(
  ['STPhrases', 'STCharacters', 'TWPhrases', 'TWVariantsPhrases', 'TWVariants',
   'STPhrases_GeneratedFromRegionalPhrases'].map(load),
);

// 第二階段（繁體 → 台灣用語）原封不動搬過來，本來就不大
const TO_GROUPS = [[TWPhrases], [TWVariantsPhrases, TWVariants]];
const reference = ConverterFactory([[STPhrases, STCharacters]], TO_GROUPS);

const phrases = parse(STPhrases);
const byKey = new Map(phrases);
const chars = new Map(parse(STCharacters));
const charwise = (s) => Array.from(s).map((c) => chars.get(c) ?? c).join('');

// 對答案用的語料：兩份詞表的來源字串，涵蓋所有可能被誤配的組合
const corpus = [...phrases.map(([s]) => s), ...parse(STGenerated).map(([s]) => s), ...parse(TWPhrases).map(([s]) => s)];

const keep = new Map(phrases.filter(([s, t]) => charwise(s) !== t));
let rounds = 0;
for (; rounds < 10; rounds++) {
  const lean = ConverterFactory([[[...keep], STCharacters]], TO_GROUPS);
  const wrong = corpus.filter((s) => reference(s) !== lean(s));
  console.log(`  第 ${rounds + 1} 輪：詞表 ${keep.size} 筆，差異 ${wrong.length} 筆`);
  if (wrong.length === 0) break;

  let added = 0;
  // 差異是「較短的詞搶了匹配」造成的，把出現在這串裡的所有詞條都補回去
  for (const s of wrong) {
    for (let i = 0; i < s.length; i++) {
      for (let j = i + 1; j <= s.length; j++) {
        const sub = s.slice(i, j);
        if (byKey.has(sub) && !keep.has(sub)) { keep.set(sub, byKey.get(sub)); added++; }
      }
    }
  }
  if (added === 0) { console.error('補不動了 —— 精簡規則有問題，中止'); process.exit(1); }
}
if (rounds === 10) { console.error('不動點沒有收斂，中止'); process.exit(1); }

const leanPhrases = serialize([...keep]);
const out = `/* 由 scripts/build-s2t.mjs 產生，請勿手改 —— 來源 opencc-js（Apache-2.0）*/
export const ST_PHRASES = ${JSON.stringify(leanPhrases)};
export const ST_CHARACTERS = ${JSON.stringify(STCharacters)};
export const TW_PHRASES = ${JSON.stringify(TWPhrases)};
export const TW_VARIANT_PHRASES = ${JSON.stringify(TWVariantsPhrases)};
export const TW_VARIANTS = ${JSON.stringify(TWVariants)};
`;
fs.writeFileSync(path.join(ROOT, 'src/lib/s2tData.ts'), out);

const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)}KB`;
console.log(`\n詞表 ${phrases.length} → ${keep.size} 筆（${kb(STPhrases)} → ${kb(leanPhrases)}）`);
console.log(`寫入 src/lib/s2tData.ts，共 ${kb(out)}`);
