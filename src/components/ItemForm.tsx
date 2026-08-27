'use client';

import { useState } from 'react';
import Modal from './Modal';
import ScheduleBinder from './ScheduleBinder';
import { fetchMeta } from '@/lib/api';
import { emptyItem } from '@/lib/schema';
import { describeUrl, detectPlatform } from '@/lib/watchUrl';
import {
  COUNTRIES,
  GENRES,
  MAIN_TYPES,
  MediaItem,
  MediaPatch,
  NewMediaItem,
  PLATFORMS,
  STATUSES,
} from '@/types/media';

interface Props {
  /** 有值＝編輯模式，沒值＝新增模式 */
  initial?: MediaItem;
  /** 新增模式時的預填內容（剪貼簿 / 分享目標 / 書籤小工具 / 搜尋帶進來的） */
  prefill?: Partial<NewMediaItem> & { url?: string };
  gimyDomain: string;
  busy?: boolean;
  onSubmit: (item: NewMediaItem) => void | Promise<void>;
  onClose: () => void;
  /** 只有新增模式給：切換到批次加入，可帶預先填好的內容 */
  onBulk?: (prefillText?: string) => void;
  /** 編輯模式才給：把排程綁定寫回 Sheet */
  onPatch?: (fields: MediaPatch) => void;
}



function Label({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-[11px] tracking-wider text-mist-shadow">{children}</span>;
}

export default function ItemForm({
  initial,
  prefill,
  gimyDomain,
  busy,
  onSubmit,
  onClose,
  onBulk,
  onPatch,
}: Props) {
  const [form, setForm] = useState<NewMediaItem>(() => {
    if (!initial) {
      const { url, ...rest } = prefill ?? {};
      const watchUrl = (url ?? rest.watchUrl ?? '').trim();
      return {
        ...emptyItem(),
        ...rest,
        title: (rest.title ?? '').trim(),
        watchUrl,
        platform: rest.platform || (watchUrl ? detectPlatform(watchUrl) : ''),
      };
    }
    const { rowNumber: _r, updatedAt: _u, ...rest } = initial;
    void _r;
    void _u;
    return rest;
  });

  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState('');
  const [episodes, setEpisodes] = useState<{ index: string; title: string; url: string }[]>([]);

  const set = <K extends keyof NewMediaItem>(key: K, value: NewMediaItem[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  /** 貼上連結時順手把「來源平台」填好；已經選過就不覆蓋，人的選擇優先 */
  const setWatchUrl = (value: string) =>
    setForm((f) => ({
      ...f,
      watchUrl: value,
      platform: f.platform || detectPlatform(value),
    }));

  const urlHint = describeUrl(form.watchUrl, gimyDomain);

  /**
   * 請後端去對方網站抓名稱、封面、總集數。
   * **只填空欄位** —— 已經打過字的地方不覆蓋，人的輸入永遠優先。
   */
  const autoFill = async () => {
    const url = form.watchUrl.trim();
    if (!url) return;

    setFetching(true);
    setFetchMsg('');
    try {
      const meta = await fetchMeta(url);
      setEpisodes(meta.episodes ?? []);
      setForm((f) => ({
        ...f,
        title: f.title.trim() || meta.title,
        cover: f.cover.trim() || meta.cover,
        totalEp: f.totalEp.trim() || meta.totalEp,
        platform: f.platform.trim() || meta.platform,
        mainType: f.mainType.trim() || (meta.mainType ?? ''),
      }));
      const bits = [`抓到「${meta.title}」`];
      if (meta.totalEp) bits.push(`共 ${meta.totalEp} 集`);
      if (meta.latestEp) bits.push(`最新第 ${meta.latestEp} 話`);
      setFetchMsg(bits.join('・'));
    } catch (err) {
      setEpisodes([]);
      setFetchMsg(err instanceof Error ? err.message : '抓取失敗');
    } finally {
      setFetching(false);
    }
  };

  /**
   * 把分集攤成批次加入的內容。
   *
   * 預設**不**這樣做：一部番在片庫裡就是一筆，用「目前進度 / 總集數」
   * 追就好，攤成 188 筆只會把清單洗版。這個入口是留給
   * 「每一集其實是獨立作品」的情況（單元劇、合輯）。
   */
  const spillEpisodes = () => {
    const base = form.title.trim() || '未命名';
    onBulk?.(
      episodes
        .map((ep) => {
          const name = [base, ep.index && `第 ${ep.index} 話`, ep.title].filter(Boolean).join(' ');
          return ep.url ? `${name} | ${ep.url}` : name;
        })
        .join('\n'),
    );
  };

  // 舊資料可能存著不在清單裡的平台字串（或手動改過 Sheet）。
  // 不補這一個 option 的話 select 會顯示空白，一存檔就把原值洗掉。
  const platformOptions: readonly string[] =
    form.platform && !PLATFORMS.includes(form.platform as (typeof PLATFORMS)[number])
      ? [form.platform, ...PLATFORMS]
      : PLATFORMS;
  const canSubmit = Boolean(form.title.trim()) && !busy;

  return (
    <Modal
      title={initial ? '編輯作品' : '新增作品'}
      onClose={onClose}
      footer={
        <div className="flex items-center gap-2">
          {onBulk && (
            <button
              onClick={() => onBulk()}
              className="shrink-0 text-[11px] text-mist-shadow underline-offset-2 transition hover:text-moon hover:underline"
            >
              批次加入
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-ink-border-strong py-2 text-sm text-mist-silver transition hover:text-mist"
          >
            取消
          </button>
          <button
            onClick={() => canSubmit && onSubmit({ ...form, title: form.title.trim() })}
            disabled={!canSubmit}
            className="flex-1 rounded-lg bg-moon py-2 text-sm font-medium text-ink-black transition hover:bg-moon-soft disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? '儲存中…' : '儲存'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>作品名稱 *</Label>
          <input
            className="field"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="例：進擊的巨人 最終季"
            autoFocus
          />
        </div>

        {initial && onPatch && (
          <div>
            <Label>播出排程</Label>
            <p className="mb-1.5 text-[11px] leading-relaxed text-mist-shadow">
              綁定後進度分母改用「已播集數」，並顯示下一集日期 ——
              追連載時真正想知道的是離最新一集差幾集。
            </p>
            <ScheduleBinder item={initial} onPatch={onPatch} />
          </div>
        )}

        <div>
          <Label>觀看連結</Label>
          <div className="flex gap-2">
            <input
              className="field min-w-0 flex-1"
              value={form.watchUrl}
              onChange={(e) => setWatchUrl(e.target.value)}
              placeholder="貼上 YouTube / BiliBili / 影片直鏈 / 站點網址"
            />
            <button
              type="button"
              onClick={autoFill}
              disabled={!form.watchUrl.trim() || fetching}
              className="shrink-0 rounded-lg border border-moon-soft/50 px-3 text-xs text-moon transition hover:bg-moon/10 disabled:cursor-not-allowed disabled:border-ink-border disabled:text-mist-shadow"
              title="請後端去對方網站抓名稱、封面與總集數，只填空欄位"
            >
              {fetching ? '抓取中…' : '自動填'}
            </button>
          </div>
          {fetchMsg && (
            <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-relaxed text-mist-silver">
              {fetchMsg}
            </p>
          )}
          {episodes.length > 0 && onBulk && (
            <p className="mt-1 text-[11px] leading-relaxed text-mist-shadow">
              抓到 {episodes.length} 話的清單。一般用「總集數 + 目前進度」追就好；
              若每一話其實是獨立作品，
              <button
                type="button"
                onClick={spillEpisodes}
                className="text-moon underline-offset-2 hover:underline"
              >
                改成每話各建一筆
              </button>
              。
            </p>
          )}
          {urlHint && (
            <p
              className={`mt-1.5 text-[11px] ${
                form.watchUrl.trim() && !urlHint.includes('看不懂')
                  ? 'text-jade'
                  : 'text-cinnabar'
              }`}
            >
              {urlHint}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>類型</Label>
            <select
              className="field"
              value={form.mainType}
              onChange={(e) => set('mainType', e.target.value)}
            >
              <option value="">未分類</option>
              {MAIN_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>狀態</Label>
            <select
              className="field"
              value={form.status}
              onChange={(e) => set('status', e.target.value)}
            >
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>目前進度</Label>
            <input
              className="field font-num"
              value={form.progress}
              onChange={(e) => set('progress', e.target.value)}
              inputMode="numeric"
            />
          </div>
          <div>
            <Label>總集數</Label>
            <input
              className="field font-num"
              value={form.totalEp}
              onChange={(e) => set('totalEp', e.target.value)}
              placeholder="—"
              inputMode="numeric"
            />
          </div>
          <div>
            <Label>季別</Label>
            <input
              className="field"
              value={form.season}
              onChange={(e) => set('season', e.target.value)}
              placeholder="S1"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>國家</Label>
            <select
              className="field"
              value={form.country}
              onChange={(e) => set('country', e.target.value)}
            >
              <option value="">—</option>
              {COUNTRIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>來源平台</Label>
            <select
              className="field"
              value={form.platform}
              onChange={(e) => set('platform', e.target.value)}
            >
              <option value="">—</option>
              {platformOptions.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>類別</Label>
            <select
              className="field"
              value={form.genre}
              onChange={(e) => set('genre', e.target.value)}
            >
              <option value="">—</option>
              {GENRES.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>評分</Label>
            <select
              className="field"
              value={form.rating}
              onChange={(e) => set('rating', e.target.value)}
            >
              <option value="">未評分</option>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={String(n)}>
                  {'★'.repeat(n)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <Label>封面圖網址</Label>
          <input
            className="field"
            value={form.cover}
            onChange={(e) => set('cover', e.target.value)}
            placeholder="選填，貼上一張圖片網址讓卡片好看一點"
          />
        </div>

        <div>
          <Label>備註</Label>
          <textarea
            className="field resize-none"
            rows={2}
            value={form.note}
            onChange={(e) => set('note', e.target.value)}
            placeholder="選填"
          />
        </div>
      </div>
    </Modal>
  );
}
