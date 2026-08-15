'use client';

import { useState } from 'react';
import Modal from './Modal';
import { describeUrl, detectPlatform } from '@/lib/watchUrl';
import {
  COUNTRIES,
  GENRES,
  MAIN_TYPES,
  MediaItem,
  NewMediaItem,
  PLATFORMS,
  STATUSES,
} from '@/types/media';

interface Props {
  /** 有值＝編輯模式，沒值＝新增模式 */
  initial?: MediaItem;
  gimyDomain: string;
  busy?: boolean;
  onSubmit: (item: NewMediaItem) => void | Promise<void>;
  onClose: () => void;
}

const blank = (): NewMediaItem => ({
  title: '',
  progress: '0',
  totalEp: '',
  mainType: '',
  country: '',
  status: '未觀看',
  rating: '',
  platform: '',
  watchUrl: '',
  cover: '',
  season: '',
  genre: '',
  note: '',
  addedDate: '',
});

function Label({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-[11px] tracking-wider text-mist-shadow">{children}</span>;
}

export default function ItemForm({ initial, gimyDomain, busy, onSubmit, onClose }: Props) {
  const [form, setForm] = useState<NewMediaItem>(() => {
    if (!initial) return blank();
    const { rowNumber: _r, updatedAt: _u, ...rest } = initial;
    void _r;
    void _u;
    return rest;
  });

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
        <div className="flex gap-2">
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

        <div>
          <Label>觀看連結</Label>
          <input
            className="field"
            value={form.watchUrl}
            onChange={(e) => setWatchUrl(e.target.value)}
            placeholder="貼上 YouTube / BiliBili / 影片直鏈 / 站點網址"
          />
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
