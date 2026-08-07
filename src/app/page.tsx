'use client';

import { useState } from 'react';
import ConfirmModal from '@/components/ConfirmModal';
import FilterBar from '@/components/FilterBar';
import ItemForm from '@/components/ItemForm';
import LoginScreen from '@/components/LoginScreen';
import MediaCard from '@/components/MediaCard';
import PlayerModal from '@/components/PlayerModal';
import SettingsModal from '@/components/SettingsModal';
import { useAccounts } from '@/hooks/useAccounts';
import { useLibrary } from '@/hooks/useLibrary';
import { useSettings } from '@/hooks/useSettings';
import { resolveWatch } from '@/lib/watchUrl';
import { MediaItem, NewMediaItem } from '@/types/media';

type Dialog =
  | { kind: 'none' }
  | { kind: 'add' }
  | { kind: 'edit'; item: MediaItem }
  | { kind: 'play'; item: MediaItem }
  | { kind: 'delete'; item: MediaItem }
  | { kind: 'settings' };

export default function Home() {
  const accounts = useAccounts();
  const { gimyDomain, saveGimyDomain } = useSettings();
  const library = useLibrary(accounts.isLoggedIn ? accounts.currentAccount : '');
  const [dialog, setDialog] = useState<Dialog>({ kind: 'none' });

  const close = () => setDialog({ kind: 'none' });

  if (accounts.initializing) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-xs tracking-[0.3em] text-mist-shadow">LOADING…</p>
      </main>
    );
  }

  if (!accounts.isLoggedIn) {
    return (
      <LoginScreen
        accounts={accounts.accounts}
        loginName={accounts.loginName}
        loginError={accounts.loginError}
        verifying={accounts.verifying}
        onNameChange={(v) => {
          accounts.setLoginName(v);
          accounts.setLoginError('');
        }}
        onLogin={accounts.handleLogin}
        onCreate={accounts.handleCreateAccount}
      />
    );
  }

  /** 能內嵌的就開站內播放器，其餘（gimy / 一般外站）直接開新分頁 */
  const handlePlay = (item: MediaItem) => {
    const watch = resolveWatch(item.watchUrl, item.progress, gimyDomain);
    if (watch.kind === 'none') return;
    if (watch.inApp) {
      setDialog({ kind: 'play', item });
    } else {
      window.open(watch.url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleSubmit = async (values: NewMediaItem) => {
    if (dialog.kind === 'edit') {
      await library.patchItem(dialog.item.rowNumber, values);
      close();
      return;
    }
    const ok = await library.addItem(values);
    if (ok) close();
  };

  // 各分類的筆數，給 FilterBar 顯示
  const counts: Record<string, number> = { 全部: library.items.length };
  for (const it of library.items) {
    if (it.mainType) counts[it.mainType] = (counts[it.mainType] ?? 0) + 1;
  }

  return (
    <main className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6">
      {/* Header */}
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl tracking-widest text-mist">我的片庫</h1>
          <p className="mt-1 text-[11px] text-mist-shadow">
            {accounts.currentAccount} ・ 共 {library.stats.total} 部 ・ 觀看中{' '}
            {library.stats.watching} ・ 已完成 {library.stats.done}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => library.reload()}
            disabled={library.refreshing}
            className="h-9 w-9 rounded-lg border border-ink-border-strong text-mist-silver transition hover:border-moon-soft hover:text-moon disabled:opacity-40"
            aria-label="重新整理"
            title="重新整理"
          >
            {library.refreshing ? '…' : '↻'}
          </button>
          <button
            onClick={() => setDialog({ kind: 'settings' })}
            className="h-9 w-9 rounded-lg border border-ink-border-strong text-mist-silver transition hover:border-moon-soft hover:text-moon"
            aria-label="設定"
            title="設定"
          >
            ⚙
          </button>
          <button
            onClick={() => setDialog({ kind: 'add' })}
            className="h-9 rounded-lg bg-moon px-4 text-sm font-medium text-ink-black transition hover:bg-moon-soft"
          >
            ＋ 新增
          </button>
        </div>
      </header>

      <FilterBar
        tab={library.tab}
        setTab={library.setTab}
        statusFilter={library.statusFilter}
        setStatusFilter={library.setStatusFilter}
        search={library.search}
        setSearch={library.setSearch}
        sortKey={library.sortKey}
        setSortKey={library.setSortKey}
        counts={counts}
      />

      {library.error && (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-cinnabar/40 bg-cinnabar/10 px-3 py-2">
          <p className="flex-1 text-xs leading-relaxed text-cinnabar">{library.error}</p>
          <button
            onClick={() => library.setError('')}
            className="text-cinnabar/70 transition hover:text-cinnabar"
            aria-label="關閉提示"
          >
            ×
          </button>
        </div>
      )}

      {/* 片庫 */}
      <section className="mt-5">
        {library.loading ? (
          <p className="py-20 text-center text-xs tracking-[0.3em] text-mist-shadow">
            載入片庫…
          </p>
        ) : library.visible.length === 0 ? (
          <div className="py-20 text-center">
            <p className="mb-2 text-sm text-mist-silver">
              {library.items.length === 0 ? '片庫還是空的' : '沒有符合條件的作品'}
            </p>
            <p className="text-xs text-mist-shadow">
              {library.items.length === 0
                ? '點右上角「＋ 新增」加入第一部作品'
                : '換個分類或清空搜尋看看'}
            </p>
          </div>
        ) : (
          <div className="grid-stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {library.visible.map((item) => (
              <MediaCard
                key={item.rowNumber}
                item={item}
                gimyDomain={gimyDomain}
                onPlay={handlePlay}
                onEdit={(it) => setDialog({ kind: 'edit', item: it })}
                onDelete={(it) => setDialog({ kind: 'delete', item: it })}
                onBump={library.bumpProgress}
              />
            ))}
          </div>
        )}
      </section>

      {/* Dialogs */}
      {(dialog.kind === 'add' || dialog.kind === 'edit') && (
        <ItemForm
          initial={dialog.kind === 'edit' ? dialog.item : undefined}
          gimyDomain={gimyDomain}
          busy={library.busy}
          onSubmit={handleSubmit}
          onClose={close}
        />
      )}

      {dialog.kind === 'play' &&
        (() => {
          // 播放中按「看完這集 +1」會改動清單，這裡取最新的那筆，
          // 否則 footer 的進度會停在開啟播放器當下的快照
          const live =
            library.items.find((it) => it.rowNumber === dialog.item.rowNumber) ?? dialog.item;
          return (
            <PlayerModal
              item={live}
              watch={resolveWatch(live.watchUrl, live.progress, gimyDomain)}
              onClose={close}
              onBump={library.bumpProgress}
            />
          );
        })()}

      {dialog.kind === 'delete' && (
        <ConfirmModal
          title="刪除作品"
          message={`確定要從片庫移除「${dialog.item.title}」嗎？這會一併刪掉 Google Sheets 裡的該列紀錄。`}
          confirmLabel="刪除"
          onConfirm={() => library.removeItem(dialog.item.rowNumber)}
          onClose={close}
        />
      )}

      {dialog.kind === 'settings' && (
        <SettingsModal
          gimyDomain={gimyDomain}
          account={accounts.currentAccount}
          onSave={saveGimyDomain}
          onClose={close}
          onLogout={accounts.handleLogout}
          onDeleteAccount={accounts.handleDeleteAccount}
        />
      )}
    </main>
  );
}
