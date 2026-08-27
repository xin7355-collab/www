'use client';

import { useState } from 'react';
import Modal from './Modal';
import { installDailyTrigger, maskedUrl, probe, Probe, refreshSchedulesNow } from '@/lib/api';
import { FONT_SCALES, THEMES } from '@/lib/appearance';
import { loadConverter } from '@/lib/s2t';
import { downloadBackup, downloadCsv, findDuplicates, parseBackup } from '@/lib/backup';
import { addShortcut, removeShortcut, SiteShortcut } from '@/lib/shortcuts';
import { DEFAULT_GIMY_DOMAIN } from '@/lib/watchUrl';
import { MAIN_TYPES, MediaItem, MediaPatch, NewMediaItem } from '@/types/media';

interface Props {
  theme: string;
  onSaveTheme: (value: string) => void;
  /** 就地改一筆（片庫轉繁體用） */
  onPatch: (row: number, fields: MediaPatch) => Promise<void>;
  /** 刪掉一列（清理重複用） */
  onRemove: (row: number) => Promise<void>;
  fontScale: string;
  onSaveFontScale: (value: string) => void;
  gimyDomain: string;
  youtubeKey: string;
  onSaveYoutubeKey: (value: string) => void;
  tmdbKey: string;
  onSaveTmdbKey: (value: string) => void;
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
  theme,
  onSaveTheme,
  onPatch,
  onRemove,
  fontScale,
  onSaveFontScale,
  gimyDomain,
  youtubeKey,
  onSaveYoutubeKey,
  tmdbKey,
  onSaveTmdbKey,
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
  /** 片庫轉繁體：先掃出待改清單給使用者看，確認後才真的寫回去 */
  const [convertList, setConvertList] = useState<{ row: number; from: string; to: string }[]>([]);
  const [convertBusy, setConvertBusy] = useState(false);
  const [convertMsg, setConvertMsg] = useState('');
  const [dupGroups, setDupGroups] = useState<MediaItem[][] | null>(null);
  const [dupBusy, setDupBusy] = useState(false);
  const [dupMsg, setDupMsg] = useState('');
  const [ytKey, setYtKey] = useState(youtubeKey);
  const [tmdb, setTmdb] = useState(tmdbKey);
  const [triggerMsg, setTriggerMsg] = useState('');
  const [triggerBusy, setTriggerBusy] = useState(false);

  const runTrigger = async (action: () => Promise<string>) => {
    setTriggerBusy(true);
    setTriggerMsg('');
    try {
      setTriggerMsg(await action());
    } catch (err) {
      setTriggerMsg(err instanceof Error ? err.message : '操作失敗');
    } finally {
      setTriggerBusy(false);
    }
  };

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

  /** 掃出哪些標題會被改。不直接動手 —— 這是一次改一整批資料，該先讓人看過 */
  const scanForSimplified = async () => {
    setConvertBusy(true);
    setConvertMsg('載入字典…');
    try {
      const convert = await loadConverter();
      const pending = items
        .map((it) => ({ row: it.rowNumber, from: it.title, to: convert(it.title) }))
        .filter((c) => c.to !== c.from);

      setConvertList(pending);
      setConvertMsg(pending.length === 0 ? '片庫裡沒有簡體標題，不用轉' : '');
    } catch (err) {
      setConvertMsg(err instanceof Error ? err.message : '字典載入失敗');
    } finally {
      setConvertBusy(false);
    }
  };

  /** 逐筆送。一次全部並行的話後端會被打爆，而且失敗了說不清哪幾筆成功 */
  const applyConversion = async () => {
    setConvertBusy(true);
    let done = 0;
    try {
      for (const c of convertList) {
        setConvertMsg(`轉換中… ${done + 1} / ${convertList.length}`);
        await onPatch(c.row, { title: c.to });
        done += 1;
      }
      setConvertMsg(`轉好了 ${done} 筆`);
      setConvertList([]);
    } catch (err) {
      setConvertMsg(`${err instanceof Error ? err.message : '轉換中斷'}（已完成 ${done} 筆）`);
    } finally {
      setConvertBusy(false);
    }
  };

  /**
   * 清掉重複的，每組只留第一筆。
   *
   * **一定要由大到小刪** —— Sheet 刪掉一列會讓後面每一列的列號往前移一位，
   * 由小到大刪的話第二筆之後全部會刪到隔壁的作品。
   */
  const cleanDuplicates = async () => {
    if (!dupGroups) return;
    const rows = dupGroups
      .flatMap((group) => group.slice(1).map((it) => it.rowNumber))
      .sort((a, b) => b - a);

    setDupBusy(true);
    let done = 0;
    try {
      for (const row of rows) {
        setDupMsg(`刪除中… ${done + 1} / ${rows.length}`);
        await onRemove(row);
        done += 1;
      }
      setDupMsg(`刪掉了 ${done} 筆重複`);
      setDupGroups(null);
    } catch (err) {
      setDupMsg(`${err instanceof Error ? err.message : '刪除中斷'}（已刪 ${done} 筆）`);
    } finally {
      setDupBusy(false);
    }
  };

  return (
    <Modal title="設定" onClose={onClose}>
      <div className="space-y-6">
        <section>
          <h3 className="mb-1 text-sm text-mist">站點網域</h3>
          <p className="mb-2.5 text-[11px] leading-relaxed text-mist-shadow">
            站方換網域時改這裡，所有作品的開播連結一起更新。
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
          <h3 className="mb-1 text-sm text-mist">
            YouTube 搜尋金鑰
            {youtubeKey && <span className="ml-2 text-[11px] text-jade">已設定</span>}
          </h3>
          <p className="mb-2.5 text-[11px] leading-relaxed text-mist-shadow">
            搜尋會多一份 YouTube 影片。免費額度每天約 100 次搜尋。
          </p>
          <div className="flex gap-2">
            <input
              className="field min-w-0 flex-1 font-num"
              type="password"
              value={ytKey}
              onChange={(e) => setYtKey(e.target.value)}
              placeholder="AIza…"
              autoComplete="off"
            />
            <button
              onClick={() => onSaveYoutubeKey(ytKey)}
              className="shrink-0 rounded-lg bg-moon px-4 text-sm font-medium text-ink-black transition hover:bg-moon-soft"
            >
              儲存
            </button>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-mist-shadow">
            到{' '}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noopener noreferrer"
              className="text-moon underline-offset-2 hover:underline"
            >
              Google Cloud Console
            </a>{' '}
            建立 API 金鑰，並啟用「YouTube Data API v3」。
            <span className="text-mist-silver">金鑰只存在這台裝置的瀏覽器</span>，
            不會上傳、也不在程式碼裡 —— 換裝置要各自填一次。
          </p>
        </section>

        <section className="border-t border-ink-border pt-5">
          <h3 className="mb-1 text-sm text-mist">
            TMDB 金鑰（電影與影集）
            {tmdbKey && <span className="ml-2 text-[11px] text-jade">已設定</span>}
          </h3>
          <p className="mb-2.5 text-[11px] leading-relaxed text-mist-shadow">
            搜尋電影與影集會多一份 TMDB 的結果，還會告訴你<span className="text-mist-silver">在台灣哪裡看得到</span>。
          </p>
          <div className="flex gap-2">
            <input
              className="field min-w-0 flex-1 font-num"
              type="password"
              value={tmdb}
              onChange={(e) => setTmdb(e.target.value)}
              placeholder="TMDB API Key"
              autoComplete="off"
            />
            <button
              onClick={() => onSaveTmdbKey(tmdb)}
              className="shrink-0 rounded-lg bg-moon px-4 text-sm font-medium text-ink-black transition hover:bg-moon-soft"
            >
              儲存
            </button>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-mist-shadow">
            在{' '}
            <a
              href="https://www.themoviedb.org/settings/api"
              target="_blank"
              rel="noopener noreferrer"
              className="text-moon underline-offset-2 hover:underline"
            >
              themoviedb.org
            </a>{' '}
            免費申請（註冊後即發）。同樣只存在這台裝置。
          </p>
        </section>

        <section className="border-t border-ink-border pt-5">
          <h3 className="mb-1 text-sm text-mist">快速加入</h3>
          <button
            onClick={copyBookmarklet}
            className="w-full rounded-lg border border-ink-border-strong py-2 text-xs text-mist-silver transition hover:border-moon-soft hover:text-moon"
          >
            {copied ? '已複製 —— 貼進新書籤的網址欄即可' : '複製書籤小工具程式碼'}
          </button>
        </section>

        <section className="border-t border-ink-border pt-5">
          <h3 className="mb-1 text-sm text-mist">外觀</h3>
          <p className="mb-2.5 text-[11px] leading-relaxed text-mist-shadow">
            只影響這台裝置。
          </p>

          <p className="mb-1.5 text-[11px] text-mist-silver">背景</p>
          <div className="mb-3 grid grid-cols-2 gap-1.5">
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => onSaveTheme(t.id)}
                className={`rounded-lg border px-2.5 py-2 text-left transition ${
                  theme === t.id
                    ? 'border-moon-soft bg-moon/10'
                    : 'border-ink-border hover:border-moon-soft/60'
                }`}
              >
                <span className={`block text-xs ${theme === t.id ? 'text-moon' : 'text-mist'}`}>
                  {t.label}
                </span>
                <span className="block text-[10px] text-mist-shadow">{t.hint}</span>
              </button>
            ))}
          </div>

          <p className="mb-1.5 text-[11px] text-mist-silver">字體大小</p>
          <div className="flex gap-1.5">
            {FONT_SCALES.map((f) => (
              <button
                key={f.id}
                onClick={() => onSaveFontScale(f.id)}
                className={`flex-1 rounded-lg border py-2 text-xs transition ${
                  fontScale === f.id
                    ? 'border-moon-soft bg-moon/10 text-moon'
                    : 'border-ink-border text-mist-silver hover:border-moon-soft/60'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </section>

        <section className="border-t border-ink-border pt-5">
          <h3 className="mb-1 text-sm text-mist">片庫轉繁體</h3>
          <p className="mb-2.5 text-[11px] leading-relaxed text-mist-shadow">
            把片庫裡既有的簡體標題一次補轉。只改名稱，會先讓你看過再寫。
          </p>

          {convertList.length === 0 ? (
            <button
              onClick={scanForSimplified}
              disabled={convertBusy}
              className="w-full rounded-lg border border-ink-border-strong py-2 text-xs text-mist-silver transition hover:border-moon-soft hover:text-moon disabled:opacity-40"
            >
              {convertBusy ? '檢查中…' : '檢查有幾筆要轉'}
            </button>
          ) : (
            <>
              <div className="mb-2 max-h-32 space-y-1 overflow-y-auto rounded-lg border border-ink-border p-2">
                {convertList.map((c) => (
                  <p key={c.row} className="truncate text-[11px] text-mist-silver">
                    <span className="text-mist-shadow">{c.from}</span> → {c.to}
                  </p>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={applyConversion}
                  disabled={convertBusy}
                  className="flex-1 rounded-lg bg-moon py-2 text-xs font-medium text-ink-black transition hover:bg-moon-soft disabled:opacity-40"
                >
                  {convertBusy ? '轉換中…' : `確認轉換 ${convertList.length} 筆`}
                </button>
                <button
                  onClick={() => { setConvertList([]); setConvertMsg(''); }}
                  disabled={convertBusy}
                  className="rounded-lg border border-ink-border-strong px-3 text-xs text-mist-silver transition hover:text-mist disabled:opacity-40"
                >
                  取消
                </button>
              </div>
            </>
          )}
          {convertMsg && <p className="mt-2 text-[11px] text-mist-silver">{convertMsg}</p>}
        </section>

        <section className="border-t border-ink-border pt-5">
          <h3 className="mb-1 text-sm text-mist">每日排程更新</h3>
          <p className="mb-2.5 text-[11px] leading-relaxed text-mist-shadow">
            後端每天早上 8 點自己更新已播集數與下一集日期，<span className="text-mist-silver">所有裝置一致</span>。裝一次就好。
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => runTrigger(installDailyTrigger)}
              disabled={triggerBusy}
              className="flex-1 rounded-lg border border-ink-border-strong py-2 text-xs text-mist-silver transition hover:border-moon-soft hover:text-moon disabled:opacity-40"
            >
              安裝每日更新
            </button>
            <button
              onClick={() => runTrigger(refreshSchedulesNow)}
              disabled={triggerBusy}
              className="flex-1 rounded-lg border border-ink-border-strong py-2 text-xs text-mist-silver transition hover:border-moon-soft hover:text-moon disabled:opacity-40"
            >
              立刻更新一次
            </button>
          </div>
          {(triggerBusy || triggerMsg) && (
            <p className="mt-2 text-[11px] leading-relaxed text-mist-silver">
              {triggerBusy ? '執行中…' : triggerMsg}
            </p>
          )}
        </section>

        <section className="border-t border-ink-border pt-5">
          <h3 className="mb-1 text-sm text-mist">備份</h3>
          <p className="mb-2.5 text-[11px] leading-relaxed text-mist-shadow">
            片庫只存在一份 Google 試算表裡，誤刪就沒有第二份。
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
          <button
            onClick={() => downloadCsv(account, items)}
            disabled={items.length === 0}
            className="mt-2 w-full rounded-lg border border-ink-border-strong py-2 text-xs text-mist-silver transition hover:border-moon-soft hover:text-moon disabled:opacity-40"
          >
            匯出 CSV（給試算表看的）
          </button>
          {importMsg && <p className="mt-2 text-[11px] text-mist-silver">{importMsg}</p>}
        </section>

        <section className="border-t border-ink-border pt-5">
          <h3 className="mb-1 text-sm text-mist">找出重複</h3>
          <p className="mb-2.5 text-[11px] leading-relaxed text-mist-shadow">
            <span className="text-mist-silver">連結相同或名稱相同</span>就算同一部，每組留最早的那筆。
          </p>

          {dupGroups === null ? (
            <button
              onClick={() => {
                const found = findDuplicates(items);
                // 空陣列不是 null，直接塞進去會讓畫面切到「確認刪除」那一支，
                // 顯示一顆「刪掉 0 筆重複」的按鈕。沒找到就維持在原本的狀態
                setDupGroups(found.length > 0 ? found : null);
                setDupMsg(found.length === 0 ? '沒有重複的' : '');
              }}
              className="w-full rounded-lg border border-ink-border-strong py-2 text-xs text-mist-silver transition hover:border-moon-soft hover:text-moon"
            >
              檢查重複
            </button>
          ) : (
            <>
              <div className="mb-2 max-h-40 space-y-2 overflow-y-auto rounded-lg border border-ink-border p-2">
                {dupGroups.map((group) => (
                  <div key={group[0].rowNumber}>
                    <p className="truncate text-[11px] text-mist">{group[0].title}</p>
                    <p className="text-[10px] text-mist-shadow">
                      共 {group.length} 筆，會刪掉其中 {group.length - 1} 筆
                    </p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={cleanDuplicates}
                  disabled={dupBusy}
                  className="flex-1 rounded-lg bg-moon py-2 text-xs font-medium text-ink-black transition hover:bg-moon-soft disabled:opacity-40"
                >
                  {dupBusy
                    ? '刪除中…'
                    : `刪掉 ${dupGroups.reduce((n, g) => n + g.length - 1, 0)} 筆重複`}
                </button>
                <button
                  onClick={() => { setDupGroups(null); setDupMsg(''); }}
                  disabled={dupBusy}
                  className="rounded-lg border border-ink-border-strong px-3 text-xs text-mist-silver transition hover:text-mist disabled:opacity-40"
                >
                  取消
                </button>
              </div>
            </>
          )}
          {dupMsg && <p className="mt-2 text-[11px] text-mist-silver">{dupMsg}</p>}
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
