'use client';

import { useState } from 'react';
import Modal from './Modal';
import { maskedUrl, probe, Probe } from '@/lib/api';
import { downloadBackup, parseBackup } from '@/lib/backup';
import { addShortcut, removeShortcut, SiteShortcut } from '@/lib/shortcuts';
import { DEFAULT_GIMY_DOMAIN } from '@/lib/watchUrl';
import { MAIN_TYPES, MediaItem, NewMediaItem } from '@/types/media';

interface Props {
  gimyDomain: string;
  shortcuts: SiteShortcut[];
  account: string;
  items: MediaItem[];
  onImport: (items: NewMediaItem[]) => Promise<number>;
  onSave: (domain: string) => void;
  onClose: () => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
}

export default function SettingsModal({
  gimyDomain,
  shortcuts,
  account,
  items,
  onImport,
  onSave,
  onClose,
  onLogout,
  onDeleteAccount,
}: Props) {
  const [domain, setDomain] = useState(gimyDomain);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<Probe | null>(null);
  const [scLabel, setScLabel] = useState('');
  const [scUrl, setScUrl] = useState('');
  const [scType, setScType] = useState('');
  const [copied, setCopied] = useState(false);
  const [importMsg, setImportMsg] = useState('');

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    const { items: incoming, skipped, error } = parseBackup(await file.text(), items);
    if (error) {
      setImportMsg(error);
      return;
    }
    if (incoming.length === 0) {
      setImportMsg(skipped ? `${skipped} 筆都已經在片庫裡了，沒有新增` : '檔案裡沒有可匯入的資料');
      return;
    }
    setImportMsg(`匯入中… 共 ${incoming.length} 筆`);
    const added = await onImport(incoming);
    setImportMsg(
      `匯入了 ${added} 筆${skipped ? `，略過 ${skipped} 筆重複` : ''}${
        added < incoming.length ? '（其餘失敗，可再試一次）' : ''
      }`,
    );
  };

  const submitShortcut = () => {
    if (!scUrl.trim()) return;
    addShortcut(shortcuts, scLabel, scUrl, scType);
    setScLabel('');
    setScUrl('');
  };

  /**
   * 書籤小工具：在任何網頁點一下，就把該頁的網址與標題帶回片庫的新增表單。
   * 標題只有在該頁自己的執行環境才拿得到 —— 靜態站沒有伺服器可以代抓網頁。
   */
  const copyBookmarklet = async () => {
    const origin = window.location.origin;
    const code = `javascript:void(window.open('${origin}/?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title)))`;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const runProbe = async () => {
    setTesting(true);
    setResult(null);
    try {
      setResult(await probe());
    } finally {
      setTesting(false);
    }
  };

  return (
    <Modal title="設定" onClose={onClose}>
      <div className="space-y-6">
        <section>
          <h3 className="mb-1 text-sm text-mist">站點網域</h3>
          <p className="mb-2.5 text-[11px] leading-relaxed text-mist-shadow">
            會換網域的站點只存作品 ID，網址在渲染時才組回去。
            站方換網域時改這一個欄位，所有作品的開播連結就一起更新。
          </p>
          <div className="flex gap-2">
            <input
              className="field font-num"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder={DEFAULT_GIMY_DOMAIN}
            />
            <button
              onClick={() => {
                onSave(domain);
                onClose();
              }}
              className="shrink-0 rounded-lg bg-moon px-4 text-sm font-medium text-ink-black transition hover:bg-moon-soft"
            >
              儲存
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-mist-shadow">
            此設定存在瀏覽器本機，換裝置需要重設一次。
          </p>
        </section>

        <section className="border-t border-ink-border pt-5">
          <h3 className="mb-1 text-sm text-mist">常用站點捷徑</h3>
          <p className="mb-2.5 text-[11px] leading-relaxed text-mist-shadow">
            片庫上方會出現這些連結，一鍵前往你常去找片的站。
            綁了分類的捷徑只在該分類出現，不綁就是每個分類都顯示。
          </p>

          {shortcuts.length > 0 && (
            <div className="mb-2.5 space-y-1">
              {shortcuts.map((sc) => (
                <div
                  key={sc.id}
                  className="flex items-center gap-2 rounded-lg border border-ink-border px-2.5 py-1.5"
                >
                  <span className="shrink-0 text-xs text-mist">{sc.label}</span>
                  {sc.type && (
                    <span className="shrink-0 rounded border border-ink-border-strong px-1 text-[10px] text-mist-shadow">
                      {sc.type}
                    </span>
                  )}
                  <span className="flex-1 truncate text-[10px] text-mist-shadow">{sc.url}</span>
                  <button
                    onClick={() => removeShortcut(shortcuts, sc.id)}
                    className="shrink-0 text-mist-shadow transition hover:text-cinnabar"
                    aria-label={`刪除 ${sc.label}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <input
              className="field w-24 shrink-0"
              value={scLabel}
              onChange={(e) => setScLabel(e.target.value)}
              placeholder="名稱"
            />
            <input
              className="field min-w-40 flex-1"
              value={scUrl}
              onChange={(e) => setScUrl(e.target.value)}
              placeholder="https://…"
            />
            <select
              className="field w-auto shrink-0"
              value={scType}
              onChange={(e) => setScType(e.target.value)}
            >
              <option value="">所有分類</option>
              {MAIN_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button
              onClick={submitShortcut}
              disabled={!scUrl.trim()}
              className="shrink-0 rounded-lg border border-ink-border-strong px-3 text-sm text-mist-silver transition hover:border-moon-soft hover:text-moon disabled:opacity-40"
            >
              加入
            </button>
          </div>
        </section>

        <section className="border-t border-ink-border pt-5">
          <h3 className="mb-1 text-sm text-mist">快速加入</h3>
          <p className="mb-2.5 text-[11px] leading-relaxed text-mist-shadow">
            三種不用手動打字的加入方式：
          </p>
          <ul className="mb-3 space-y-1.5 text-[11px] leading-relaxed text-mist-shadow">
            <li>
              <span className="text-mist-silver">📋 剪貼簿</span> —— 複製網址後，按片庫右上角的
              📋，自動帶入新增表單
            </li>
            <li>
              <span className="text-mist-silver">手機分享</span> ——
              在瀏覽器或任何 app 點分享，選「我的片庫」（需先把本站加到主畫面；iOS 不支援這個功能）
            </li>
            <li>
              <span className="text-mist-silver">書籤小工具</span> ——
              桌機在任何影片頁點一下，連網頁標題一起帶回來
            </li>
          </ul>
          <button
            onClick={copyBookmarklet}
            className="w-full rounded-lg border border-ink-border-strong py-2 text-xs text-mist-silver transition hover:border-moon-soft hover:text-moon"
          >
            {copied ? '已複製 —— 貼進新書籤的網址欄即可' : '複製書籤小工具程式碼'}
          </button>
        </section>

        <section className="border-t border-ink-border pt-5">
          <h3 className="mb-1 text-sm text-mist">備份</h3>
          <p className="mb-2.5 text-[11px] leading-relaxed text-mist-shadow">
            片庫只存在一份 Google 試算表裡，誤刪就沒有第二份。
            匯出的是純 JSON，人看得懂，也能匯進另一個帳號。
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => downloadBackup(account, items)}
              disabled={items.length === 0}
              className="flex-1 rounded-lg border border-ink-border-strong py-2 text-xs text-mist-silver transition hover:border-moon-soft hover:text-moon disabled:opacity-40"
            >
              匯出 {items.length} 筆
            </button>
            <label className="flex-1 cursor-pointer rounded-lg border border-ink-border-strong py-2 text-center text-xs text-mist-silver transition hover:border-moon-soft hover:text-moon">
              匯入備份
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => handleImport(e.target.files?.[0])}
              />
            </label>
          </div>
          {importMsg && <p className="mt-2 text-[11px] text-mist-silver">{importMsg}</p>}
        </section>

        <section className="border-t border-ink-border pt-5">
          <h3 className="mb-1 text-sm text-mist">後端連線</h3>
          <p className="mb-2.5 text-[11px] leading-relaxed text-mist-shadow">
            片庫資料存在 Google Sheets，由 Apps Script 提供。載不到資料時先按這裡，
            它會告訴你問題在哪一段。
          </p>
          <p className="mb-2.5 break-all rounded-lg border border-ink-border bg-ink-black/40 px-3 py-2 font-num text-[11px] text-mist-shadow">
            {maskedUrl()}
          </p>
          <button
            onClick={runProbe}
            disabled={testing}
            className="w-full rounded-lg border border-ink-border-strong py-2 text-xs text-mist-silver transition hover:border-moon-soft hover:text-moon disabled:opacity-40"
          >
            {testing ? '測試中…' : '測試連線'}
          </button>

          {result && (
            <div
              className={`mt-2.5 rounded-lg border px-3 py-2.5 ${
                result.ok
                  ? 'border-moon-soft/40 bg-moon/10 text-moon'
                  : 'border-cinnabar/40 bg-cinnabar/10 text-cinnabar'
              }`}
            >
              <p className="text-xs font-medium">
                {result.ok ? '✓ ' : '✕ '}
                {result.summary}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-[11px] leading-relaxed opacity-80">
                {result.detail}
              </p>
            </div>
          )}
        </section>

        <section className="border-t border-ink-border pt-5">
          <h3 className="mb-1 text-sm text-mist">帳號</h3>
          <p className="mb-2.5 text-[11px] text-mist-shadow">
            目前登入：<span className="text-mist-silver">{account}</span>
          </p>
          <div className="flex gap-2">
            <button
              onClick={onLogout}
              className="flex-1 rounded-lg border border-ink-border-strong py-2 text-xs text-mist-silver transition hover:text-mist"
            >
              登出
            </button>
            <button
              onClick={() => setConfirmingDelete(true)}
              className="flex-1 rounded-lg border border-cinnabar/40 py-2 text-xs text-cinnabar transition hover:bg-cinnabar/10"
            >
              註銷此帳號
            </button>
          </div>

          {confirmingDelete && (
            <div className="mt-3 rounded-lg border border-cinnabar/40 bg-cinnabar/10 p-3">
              <p className="mb-2.5 text-[11px] leading-relaxed text-cinnabar">
                這會永久刪除 Google Sheets 中「{account}」整張分頁與所有作品紀錄，無法復原。
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="flex-1 rounded border border-ink-border-strong py-1.5 text-xs text-mist-silver"
                >
                  取消
                </button>
                <button
                  onClick={onDeleteAccount}
                  className="flex-1 rounded bg-cinnabar py-1.5 text-xs text-mist"
                >
                  確定刪除
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
