'use client';

import { useEffect, useState } from 'react';
import BulkAddModal from '@/components/BulkAddModal';
import ConfirmModal from '@/components/ConfirmModal';
import FilterBar from '@/components/FilterBar';
import ItemForm from '@/components/ItemForm';
import LoginScreen from '@/components/LoginScreen';
import MediaCard from '@/components/MediaCard';
import PlayerModal from '@/components/PlayerModal';
import SearchModal from '@/components/SearchModal';
import SettingsModal from '@/components/SettingsModal';
import SiteCatalogModal from '@/components/SiteCatalogModal';
import SiteShortcuts from '@/components/SiteShortcuts';
import { useAccounts } from '@/hooks/useAccounts';
import { useLibrary } from '@/hooks/useLibrary';
import { useSettings } from '@/hooks/useSettings';
import { clearShared, useSharedInput } from '@/lib/quickAdd';
import { useShortcuts } from '@/lib/shortcuts';
import { resolveWatch } from '@/lib/watchUrl';
import { MediaItem, NewMediaItem } from '@/types/media';

/**
 * 隨機取一個。刻意定義在元件外：Math.random 是不純函式，
 * 寫在元件內會被 React Compiler 擋下（同一次 render 可能得到不同結果）。
 */
function pickRandom<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

type Dialog =
  | { kind: 'none' }
  | { kind: 'add'; prefill?: { url?: string; title?: string } }
  | { kind: 'bulk'; text?: string }
  | { kind: 'edit'; item: MediaItem }
  | { kind: 'play'; item: MediaItem }
  | { kind: 'delete'; item: MediaItem }
  | { kind: 'settings' }
  | { kind: 'sites' }
  | { kind: 'search' };

export default function Home() {
  const accounts = useAccounts();
  const { gimyDomain, saveGimyDomain } = useSettings();
  const library = useLibrary(accounts.isLoggedIn ? accounts.currentAccount : '');
  const shortcuts = useShortcuts();
  const shared = useSharedInput();
  const [dialog, setDialog] = useState<Dialog>({ kind: 'none' });

  const close = () => {
    setDialog({ kind: 'none' });
    clearShared();
  };

  const dialogKind = dialog.kind;
  const reload = library.reload;

  /**
   * 從外面帶網址進來（手機分享、書籤小工具）時直接開新增表單。
   * 刻意由 query 推導而不是在 effect 裡 setState —— 靜態輸出下那會造成
   * hydration mismatch，這個專案把該規則設成 error。
   */
  const active: Dialog = dialog.kind === 'none' && shared ? { kind: 'add', prefill: shared } : dialog;

  /**
   * 全站快捷鍵。只在沒有任何 modal 開著時生效 ——
   * 播放器自己也綁了空白鍵與方向鍵，兩邊搶會很難用。
   */
  const sharedOpen = Boolean(shared);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (dialogKind !== 'none' || sharedOpen) return;

      switch (e.key) {
        case '/':
          e.preventDefault();
          document.getElementById('library-search')?.focus();
          break;
        case 'n':
        case 'N':
          setDialog({ kind: 'add' });
          break;
        case 'r':
        case 'R':
          reload();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialogKind, sharedOpen, reload]);

  /**
   * 隨機挑一部來看。從「目前篩選結果中還沒看完、而且有連結」的裡面抽 ——
   * 抽到已完成或沒連結的都等於沒抽。
   */
  const playRandom = () => {
    const pool = library.visible.filter(
      (it) => it.status !== '已完成' && resolveWatch(it.watchUrl, it.progress, gimyDomain).kind !== 'none',
    );
    if (pool.length === 0) {
      library.setError('目前的篩選條件下沒有可以播的作品');
      return;
    }
    handlePlay(pickRandom(pool));
  };

  /** 剪貼簿裡若是網址就直接帶進新增表單，省掉「開表單→貼上」兩步 */
  const addFromClipboard = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      const url = /https?:\/\/\S+/.exec(text)?.[0] ?? '';
      if (!url) {
        library.setError('剪貼簿裡沒有網址');
        return;
      }
      setDialog({ kind: 'add', prefill: { url } });
    } catch {
      library.setError('讀不到剪貼簿 —— 瀏覽器可能擋了權限，直接用「＋ 新增」貼上即可');
    }
  };

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
    if (active.kind === 'edit') {
      await library.patchItem(active.item.rowNumber, values);
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
            onClick={() => setDialog({ kind: 'search' })}
            className="h-9 w-9 rounded-lg border border-ink-border-strong text-mist-silver transition hover:border-moon-soft hover:text-moon"
            aria-label="搜尋作品資料"
            title="搜尋作品資料（名稱、封面、集數）"
          >
            🔍
          </button>
          <button
            onClick={playRandom}
            className="h-9 w-9 rounded-lg border border-ink-border-strong text-mist-silver transition hover:border-moon-soft hover:text-moon"
            aria-label="隨機挑一部"
            title="隨機挑一部來看"
          >
            🎲
          </button>
          <button
            onClick={addFromClipboard}
            className="h-9 w-9 rounded-lg border border-ink-border-strong text-mist-silver transition hover:border-moon-soft hover:text-moon"
            aria-label="貼上網址新增"
            title="從剪貼簿貼上網址新增"
          >
            📋
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

      <SiteShortcuts
        shortcuts={shortcuts}
        tab={library.tab}
        onManage={() => setDialog({ kind: 'settings' })}
        onBrowse={() => setDialog({ kind: 'sites' })}
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
      {(active.kind === 'add' || active.kind === 'edit') && (
        <ItemForm
          initial={active.kind === 'edit' ? active.item : undefined}
          prefill={active.kind === 'add' ? active.prefill : undefined}
          gimyDomain={gimyDomain}
          busy={library.busy}
          onSubmit={handleSubmit}
          onClose={close}
          onBulk={active.kind === 'add' ? (text) => setDialog({ kind: 'bulk', text }) : undefined}
        />
      )}

      {active.kind === 'bulk' && (
        <BulkAddModal
          initialText={active.text}
          busy={library.busy}
          onSubmit={library.addMany}
          onClose={close}
        />
      )}

      {active.kind === 'play' &&
        (() => {
          // 播放中按「看完這集 +1」會改動清單，這裡取最新的那筆，
          // 否則 footer 的進度會停在開啟播放器當下的快照
          const live =
            library.items.find((it) => it.rowNumber === active.item.rowNumber) ?? active.item;
          return (
            <PlayerModal
              item={live}
              watch={resolveWatch(live.watchUrl, live.progress, gimyDomain)}
              onClose={close}
              onBump={library.bumpProgress}
            />
          );
        })()}

      {active.kind === 'delete' && (
        <ConfirmModal
          title="刪除作品"
          message={`確定要從片庫移除「${active.item.title}」嗎？這會一併刪掉 Google Sheets 裡的該列紀錄。`}
          confirmLabel="刪除"
          onConfirm={() => library.removeItem(active.item.rowNumber)}
          onClose={close}
        />
      )}

      {active.kind === 'search' && (
        <SearchModal
          onPick={(prefill) => setDialog({ kind: 'add', prefill })}
          onClose={close}
        />
      )}

      {active.kind === 'sites' && (
        <SiteCatalogModal shortcuts={shortcuts} onClose={close} />
      )}

      {active.kind === 'settings' && (
        <SettingsModal
          gimyDomain={gimyDomain}
          shortcuts={shortcuts}
          items={library.items}
          onImport={library.addMany}
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
