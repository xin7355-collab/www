'use client';

import { useState } from 'react';
import Modal from './Modal';
import { maskedUrl, probe, Probe } from '@/lib/api';
import { DEFAULT_GIMY_DOMAIN } from '@/lib/watchUrl';

interface Props {
  gimyDomain: string;
  account: string;
  onSave: (domain: string) => void;
  onClose: () => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
}

export default function SettingsModal({
  gimyDomain,
  account,
  onSave,
  onClose,
  onLogout,
  onDeleteAccount,
}: Props) {
  const [domain, setDomain] = useState(gimyDomain);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<Probe | null>(null);

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
