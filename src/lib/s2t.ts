'use client';

/**
 * 簡體 → 繁體（台灣用語）。
 *
 * 為什麼需要：Bangumi 是簡體站，MangaDex 的中文條目也多半是簡體，
 * 搜尋結果直接加進片庫的話，整個片庫會混著「凡人修仙传」跟「凡人修仙傳」。
 *
 * 為什麼不是把 t2s.ts 反過來用：簡→繁是一對多的。「发」可能是發也可能是髮，
 * 「里」可能是裡也可能是里 —— 只有看詞才分得出來，逐字對照必錯。
 *
 * 字典來自 OpenCC，但**沒有整包搬進來**：完整的 cn2t gzip 後 447KB，
 * 對行動裝置優先的 PWA 不合比例。scripts/build-s2t.mjs 砍掉了詞表裡
 * 「逐字轉就會對」的八成詞條（砍法見那支腳本，不是無腦砍），
 * 壓到 122KB 而且輸出與完整版逐字相同。
 *
 * 字典是 `import()` 動態載入的，跟 hls.js 一樣不搜尋就不會下載。
 */

class Node {
  readonly next = new Map<number, Node>();
  value?: string;
}

/** 最長匹配的字典樹，比對規則與 OpenCC 一致 */
class Trie {
  private readonly root = new Node();

  /** 同一組裡先加入的字典優先，所以實際載入時要反過來走一遍 */
  loadGroup(dicts: string[]): void {
    for (const dict of [...dicts].reverse()) {
      for (const entry of dict.split('|')) {
        const sep = entry.indexOf(' ');
        if (sep < 0) continue;
        this.add(entry.slice(0, sep), entry.slice(sep + 1));
      }
    }
  }

  private add(key: string, value: string): void {
    let node = this.root;
    for (const ch of key) {
      const cp = ch.codePointAt(0)!;
      let next = node.next.get(cp);
      if (!next) {
        next = new Node();
        node.next.set(cp, next);
      }
      node = next;
    }
    node.value = value;
  }

  convert(text: string): string {
    const out: string[] = [];
    let plainFrom: number | null = null;

    for (let i = 0; i < text.length; ) {
      const hit = this.matchAt(text, i);
      if (hit) {
        if (plainFrom !== null) {
          out.push(text.slice(plainFrom, i));
          plainFrom = null;
        }
        out.push(hit.value);
        i = hit.end;
      } else {
        if (plainFrom === null) plainFrom = i;
        i += unmatchedLength(text, i);
      }
    }
    if (plainFrom !== null) out.push(text.slice(plainFrom));
    return out.join('');
  }

  /** 從 i 起算最長的一筆匹配；沒有就回 null */
  private matchAt(text: string, i: number): { end: number; value: string } | null {
    let node = this.root;
    let end = 0;
    let value = '';

    for (let j = i; j < text.length; ) {
      const cp = text.codePointAt(j)!;
      j += cp > 0xffff ? 2 : 1;

      const next = node.next.get(cp);
      if (!next) break;
      node = next;

      if (next.value !== undefined) {
        end = j;
        value = next.value;
      }
    }
    return end > 0 ? { end, value } : null;
  }
}

const codePointLength = (text: string, i: number): number => (text.codePointAt(i)! > 0xffff ? 2 : 1);

/** 表意文字描述符（⿰⿱ 這類）後面跟著固定數量的部件 */
function idsArity(cp: number): number {
  if (cp >= 0x2ff2 && cp <= 0x2ff3) return 3;
  if (cp >= 0x2ff0 && cp <= 0x2fff) return 2;
  return 0;
}

/** 一個描述序列要整串跳過，不能拆開來當單字看 */
function idsEnd(text: string, i: number): number {
  const arity = idsArity(text.codePointAt(i)!);
  if (arity === 0) return 0;

  let end = i + codePointLength(text, i);
  for (let n = 0; n < arity; n++) {
    if (end >= text.length) return 0;
    const child = idsEnd(text, end);
    end = child || end + codePointLength(text, end);
  }
  return end;
}

function unmatchedLength(text: string, i: number): number {
  const ids = idsEnd(text, i);
  return ids > i ? ids - i : codePointLength(text, i);
}

export type Converter = (text: string) => string;

let pending: Promise<Converter> | null = null;

/**
 * 取得轉換函式。字典只會下載與建樹一次，之後同一個 Promise 直接回。
 *
 * 轉換分成兩段，順序不能換：先簡→繁，再繁→台灣用語（软件→軟體）。
 */
export function loadConverter(): Promise<Converter> {
  pending ??= import('./s2tData').then((d) => {
    const stages = [
      [d.ST_PHRASES, d.ST_CHARACTERS],
      [d.TW_PHRASES],
      [d.TW_VARIANT_PHRASES, d.TW_VARIANTS],
    ].map((group) => {
      const trie = new Trie();
      trie.loadGroup(group);
      return trie;
    });

    return (text: string) => stages.reduce((acc, trie) => trie.convert(acc), text);
  });
  return pending;
}
