'use client';

import { useEffect, useRef, useState } from 'react';
import BulkAddModal from '@/components/BulkAddModal';
import ConfirmModal from '@/components/ConfirmModal';
import FilterBar from '@/components/FilterBar';
import ItemForm from '@/components/ItemForm';
import LoginScreen from '@/components/LoginScreen';
import MediaCard from '@/components/MediaCard';
import PlayerModal from '@/components/PlayerModal';
import SearchModal from '@/components/SearchModal';
import ReadingLinksModal from '@/components/ReadingLinksModal';
import RenameModal from '@/components/RenameModal';
import SettingsModal from '@/components/SettingsModal';
import SiteCatalogModal from '@/components/SiteCatalogModal';
import SiteShortcuts from '@/components/SiteShortcuts';
import { useAccounts } from '@/hooks/useAccounts';
import { useLibrary } from '@/hooks/useLibrary';
import { useSettings } from '@/hooks/useSettings';
import { useAppearance } from '@/lib/appearance';
import { applyScheme, isYouTube } from '@/lib/externalApp';
import { historyKey, indexHistory, recordWatch, useHistory } from '@/lib/history';
import { BEHIND_TAB, episodesBehind } from '@/lib/schedule';
import { needsRefresh } from '@/lib/schedule';
import { fetchSchedule } from '@/lib/tvmaze';
import { clearShared, useSharedInput } from '@/lib/quickAdd';
import { useShortcuts } from '@/lib/shortcuts';
import { resolveWatch, watchUrlOf } from '@/lib/watchUrl';
import { MediaItem, NewMediaItem } from '@/types/media';

/**
 * 隨機取一個。刻意定義在元件外：Math.random 是不純函式，
 * 寫在元件內會被 React Compiler 擋下（同一次 render 可能得到不同結果）。
 */


type Dialog =
  | { kind: 'none' }
  | { kind: 'add'; prefill?: { url?: string; title?: string } }
  | { kind: 'bulk'; text?: string }
  | { kind: 'edit'; item: MediaItem }
  | { kind: 'play'; item: MediaItem }
  | { kind: 'delete'; item: MediaItem }
  | { kind: 'rename'; item: MediaItem }
  | { kind: 'bulkDelete'; keys: string[] }
  | { kind: 'whereToRead'; item: MediaItem }
  | { kind: 'settings' }
  | { kind: 'sites' }
  | { kind: 'search'; q?: string };

export default function Home() {
  const accounts = useAccounts();
  const {
    gimyDomain,
    saveGimyDomain,
    youtubeKey,
    saveYoutubeKey,
    tmdbKey,
    saveTmdbKey,
    backgroundAudio,
    saveBackgroundAudio,
    externalScheme,
    saveExternalScheme,
    preferredSource,
    savePreferredSource,
  } = useSettings();
  const library = useLibrary(accounts.isLoggedIn ? accounts.currentAccount : '');
  const shortcuts = useShortcuts();
  const shared = useSharedInput();
  // 這個 hook 同時負責把主題／字級寫到 <html>，所以一定要在這裡呼叫
  const { theme, scale: fontScale, saveTheme, saveScale: saveFontScale } = useAppearance();
  const history = useHistory();

  const [dialog, setDialog] = useState<Dialog>({ kind: 'none' });
  /**
   * 批次選取：不是 null 就代表在選取模式。
   * 存的是 itemKey（名稱::連結）**不是列號** —— 列號會因為刪除而整批位移，
   * 拿過期的列號去刪會刪到隔壁那部作品。
   */
  const [picked, setPicked] = useState<string[] | null>(null);

  /**
   * 排程過期就在背景重抓一次並寫回 Sheet。
   *
   * 正常情況下 Apps Script 的每日觸發器會先一步更新好，這裡是給
   * 「還沒裝觸發器」或「剛好在觸發器跑之前打開」的補救。
   * 判斷依據是「下一集是不是已經播了」而不是時間戳 —— 播出表在下一集
   * 播出之前不會變，用時間輪詢只是白打 API。
   *
   * 一次最多處理 3 筆：每筆都會寫回 Sheet，一次全送會塞爆後端。
   *
   * 位置很重要：必須在下面那幾個 early return **之前** ——
   * hooks 的呼叫順序每次 render 都得一樣。
   */
  const refreshing = useRef(new Set<number>());
  const stale = library.items.filter((it) => needsRefresh(it)).slice(0, 3);
  const staleSignature = stale.map((it) => `${it.rowNumber}#${it.tvmazeId}`).join('|');
  const patchItem = library.patchItem;

  useEffect(() => {
    if (!staleSignature) return;
    const inFlight = refreshing.current;

    for (const entry of staleSignature.split('|')) {
      const [rowText, showId] = entry.split('#');
      const row = Number(rowText);
      if (!showId || inFlight.has(row)) continue;

      inFlight.add(row);
      fetchSchedule(Number(showId), titleOf(row))
        .then((schedule) =>
          patchItem(row, {
            airedEp: String(schedule.aired),
            nextAirDate: schedule.nextDate,
            nextEpLabel: schedule.nextLabel,
          }),
        )
        .catch(() => {
          // 抓不到就維持舊資料，下次進來再試 —— 不值得為此打斷使用者
        })
        .finally(() => inFlight.delete(row));
    }

    /** 從列號取回作品名稱：季別判斷要用它，但不想讓 effect 相依整份片庫 */
    function titleOf(row: number): string {
      return stale.find((it) => it.rowNumber === row)?.title ?? '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staleSignature, patchItem]);


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
   * 回到 App 時自動同步一次。
   *
   * 這是取代手動「重新整理」鍵的做法：新增本來就是樂觀更新（卡片立刻出現），
   * 真正需要重抓的情境是「在別台裝置改過、或放著很久」——那正好對應
   * 「切回這個分頁」。silent 是刻意的，背景同步不該閃一個載入中。
   */
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) reload(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

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

  /**
   * 交給外部 App 開。設了樣板才會有這條路，見 externalApp.ts。
   * 一律記一筆觀看紀錄 —— 送出去之後我們就看不到了，至少要知道看過這部。
   */
  const openExternally = (item: MediaItem, url: string) => {
    const target = applyScheme(externalScheme, url);
    if (!target) return false;
    recordWatch(item);
    // 用 assign 而不是指派 location.href —— React Compiler 的 immutability
    // 規則會把後者當成「改動元件外的變數」而擋下來
    window.location.assign(target);
    return true;
  };

  /**
   * 卡片選單的「用外部 App 開」。
   *
   * **沒設定樣板時不是藏起來，而是把人帶去設定頁** —— 藏起來的入口
   * 等於這個功能不存在，使用者永遠不會知道有這回事。
   */
  const openInApp = (item: MediaItem) => {
    if (!externalScheme.trim()) {
      setDialog({ kind: 'settings' });
      return;
    }
    openExternally(item, resolveWatch(watchUrlOf(item), item.progress, gimyDomain).url);
  };

  /** 能內嵌的就開站內播放器，其餘（gimy / 一般外站）直接開新分頁 */
  const handlePlay = (item: MediaItem) => {
    const watch = resolveWatch(watchUrlOf(item), item.progress, gimyDomain);
    if (watch.kind === 'none') return;

    // YouTube 交給外部 App —— 網頁播不了背景，那些原生 App 可以
    if (isYouTube(watch.url) && openExternally(item, watch.url)) return;

    if (watch.inApp) {
      setDialog({ kind: 'play', item });
    } else {
      // 外開的也要記一筆，否則小說漫畫這種只能外開的永遠不會出現在「繼續觀看」。
      // 沒有秒數可記（開在別的分頁，量不到），但「上次看的是這部、看到第幾話」才是重點
      recordWatch(item);
      window.open(watch.url, '_blank', 'noopener,noreferrer');
    }
  };

  /**
   * 表單送出後**立刻關閉**，不等後端。新增與編輯都是樂觀更新，
   * 卡片會馬上出現／更新；等 GAS 那一兩秒只會讓人以為當掉了。
   * 真的失敗的話 library.error 會浮出來。
   */
  const handleSubmit = (values: NewMediaItem) => {
    if (active.kind === 'edit') {
      void library.patchItem(active.item.rowNumber, values);
    } else {
      void library.addItem(values);
    }
    close();
  };

  const watched = indexHistory(history);


  /**
   * 繼續觀看：依觀看時間排序的最近幾部，只在「全部」分類且沒有其他篩選時出現 ——
   * 使用者正在找特定東西的時候，上面多一排無關的卡片只會擋路。
   */
  const resumeList =
    library.tab === '全部' && library.statusFilter === '全部' && !library.search.trim()
      ? history
          .map((entry) => library.items.find((it) => historyKey(it) === entry.key))
          .filter((it): it is MediaItem => Boolean(it) && it!.status !== '已完成')
          .slice(0, 6)
      : [];

  // 各分類的筆數，給 FilterBar 顯示
  const counts: Record<string, number> = { 全部: library.items.length, [BEHIND_TAB]: 0 };
  for (const it of library.items) {
    if (it.mainType) counts[it.mainType] = (counts[it.mainType] ?? 0) + 1;
    if (episodesBehind(it) > 0) counts[BEHIND_TAB] += 1;
  }

  return (
    <main className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6">
      {/* Header */}
      {/*
        搜尋框放在標題旁邊那塊本來就空著的地方 —— 它是最常用的東西，
        不該再往下佔一整行。min-w-0 是必要的：flex 子元素預設不會縮到
        內容以下，少了它輸入框會把頁首撐爆。
      */}
      <header className="mb-4 flex items-center gap-2">
        <h1 className="shrink-0 font-display text-xl tracking-widest text-mist sm:text-2xl">
          墨影
        </h1>

        <form
          className="min-w-0 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            const q = library.search.trim();
            if (q) setDialog({ kind: 'search', q });
          }}
        >
          <input
            className="field"
            id="library-search"
            placeholder="篩片庫；Enter 上網找"
            value={library.search}
            onChange={(e) => library.setSearch(e.target.value)}
          />
        </form>

        <div className="flex shrink-0 items-center gap-1.5">
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
        </div>
      </header>

      <FilterBar
        tab={library.tab}
        setTab={library.setTab}
        statusFilter={library.statusFilter}
        setStatusFilter={library.setStatusFilter}
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

      {resumeList.length > 0 && !library.loading && (
        <section className="mt-5">
          <h2 className="mb-2 text-[11px] tracking-[0.2em] text-mist-shadow">繼續觀看</h2>
          <div className="custom-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
            {resumeList.map((item) => (
              <div key={`resume-${item.rowNumber}`} className="w-40 shrink-0 sm:w-48">
                <MediaCard
                  item={item}
                  gimyDomain={gimyDomain}
                  history={watched.get(historyKey(item))}
                  onPlay={handlePlay}
                  onEdit={(it) => setDialog({ kind: 'edit', item: it })}
                  onDelete={(it) => setDialog({ kind: 'delete', item: it })}
                  onSetProgress={library.setProgress}
                  onFindName={(it) => setDialog({ kind: 'rename', item: it })}
                  onWhereToRead={(it) => setDialog({ kind: 'whereToRead', item: it })}
                  onOpenExternal={openInApp}
                />
              </div>
            ))}
          </div>
        </section>
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
                ? '用右上角的 🔍 搜尋，或 📋 貼上網址加入第一部'
                : '換個分類或清空搜尋看看'}
            </p>
          </div>
        ) : (
          <>
            <div className="mb-2.5 flex items-center gap-2">
              {picked === null ? (
                <button
                  onClick={() => setPicked([])}
                  className="ml-auto rounded-full border border-ink-border px-2.5 py-1 text-[11px] text-mist-shadow transition hover:border-moon-soft hover:text-moon"
                >
                  選取
                </button>
              ) : (
                <>
                  <button
                    onClick={() =>
                      setPicked(
                        picked.length === library.visible.length
                          ? []
                          : library.visible.map(historyKey),
                      )
                    }
                    className="rounded-full border border-ink-border px-2.5 py-1 text-[11px] text-mist-silver transition hover:border-moon-soft hover:text-moon"
                  >
                    {picked.length === library.visible.length ? '取消全選' : '全選'}
                  </button>
                  <span className="text-[11px] text-mist-shadow">已選 {picked.length} 部</span>
                  <button
                    onClick={() => setPicked(null)}
                    className="ml-auto rounded-full border border-ink-border px-2.5 py-1 text-[11px] text-mist-shadow transition hover:text-mist"
                  >
                    結束選取
                  </button>
                  <button
                    onClick={() => setDialog({ kind: 'bulkDelete', keys: picked })}
                    disabled={picked.length === 0}
                    className="rounded-full border border-cinnabar/50 px-2.5 py-1 text-[11px] text-cinnabar transition hover:bg-cinnabar/10 disabled:opacity-40"
                  >
                    刪除 {picked.length} 部
                  </button>
                </>
              )}
            </div>

            <div className="grid-stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {library.visible.map((item) => (
                <MediaCard
                  key={item.rowNumber}
                  item={item}
                  gimyDomain={gimyDomain}
                  history={watched.get(historyKey(item))}
                    onPlay={handlePlay}
                  onEdit={(it) => setDialog({ kind: 'edit', item: it })}
                  onDelete={(it) => setDialog({ kind: 'delete', item: it })}
                  onSetProgress={library.setProgress}
                  onFindName={(it) => setDialog({ kind: 'rename', item: it })}
                  onWhereToRead={(it) => setDialog({ kind: 'whereToRead', item: it })}
                  onOpenExternal={openInApp}
                  selectMode={picked !== null}
                  selected={picked?.includes(historyKey(item)) ?? false}
                  onToggleSelect={(it) =>
                    setPicked((prev) => {
                      if (prev === null) return prev;
                      const key = historyKey(it);
                      return prev.includes(key)
                        ? prev.filter((k) => k !== key)
                        : [...prev, key];
                    })
                  }
                />
              ))}
            </div>
          </>
        )}
      </section>

      {/* Dialogs */}
      {(active.kind === 'add' || active.kind === 'edit') && (
        <ItemForm
          // 綁定排程會就地改動這筆，所以要取片庫裡最新的那份 ——
          // 用開啟表單當下的快照，綁完之後畫面不會更新（播放器也是同一個理由）
          initial={
            active.kind === 'edit'
              ? (library.items.find((it) => it.rowNumber === active.item.rowNumber) ?? active.item)
              : undefined
          }
          prefill={active.kind === 'add' ? active.prefill : undefined}
          gimyDomain={gimyDomain}
          busy={library.busy}
          onSubmit={handleSubmit}
          onClose={close}
          onBulk={active.kind === 'add' ? (text) => setDialog({ kind: 'bulk', text }) : undefined}
          onPatch={
            active.kind === 'edit'
              ? (fields) => library.patchItem(active.item.rowNumber, fields)
              : undefined
          }
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
              watch={resolveWatch(watchUrlOf(live), live.progress, gimyDomain)}
              onBump={library.bumpProgress}
              backgroundAudio={backgroundAudio}
              onOpenExternal={openInApp}
              onClose={close}
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

      {active.kind === 'bulkDelete' && (
        <ConfirmModal
          title="批次刪除"
          message={`確定要刪掉選取的 ${active.keys.length} 部嗎？這會一併刪掉 Google Sheets 裡對應的列，沒辦法復原。`}
          confirmLabel={`刪除 ${active.keys.length} 部`}
          onConfirm={async () => {
            await library.removeMany(active.keys);
            setPicked(null);
          }}
          onClose={close}
        />
      )}

      {active.kind === 'whereToRead' && (
        <ReadingLinksModal
          item={active.item}
          onUse={(url) => {
            void library.patchItem(active.item.rowNumber, { watchUrl: url });
            close();
          }}
          onClose={close}
        />
      )}

      {active.kind === 'rename' && (
        <RenameModal
          item={active.item}
          tmdbKey={tmdbKey}
          onRename={(title) => {
            if (title && title !== active.item.title) {
              void library.patchItem(active.item.rowNumber, { title });
            }
            close();
          }}
          onClose={close}
        />
      )}

      {active.kind === 'search' && (
        <SearchModal
          initialQuery={active.q}
          onAdd={library.addMany}
          onClose={close}
          youtubeKey={youtubeKey}
          tmdbKey={tmdbKey}
          preferredSource={preferredSource}
        />
      )}

      {active.kind === 'sites' && (
        <SiteCatalogModal shortcuts={shortcuts} onClose={close} />
      )}

      {active.kind === 'settings' && (
        <SettingsModal
          theme={theme}
          onSaveTheme={saveTheme}
          backgroundAudio={backgroundAudio}
          onSaveBackgroundAudio={saveBackgroundAudio}
          externalScheme={externalScheme}
          onSaveExternalScheme={saveExternalScheme}
          preferredSource={preferredSource}
          onSavePreferredSource={savePreferredSource}
          onPatch={library.patchItem}
          onRemove={library.removeItem}
          fontScale={fontScale}
          onSaveFontScale={saveFontScale}
          gimyDomain={gimyDomain}
          youtubeKey={youtubeKey}
          onSaveYoutubeKey={saveYoutubeKey}
          tmdbKey={tmdbKey}
          onSaveTmdbKey={saveTmdbKey}
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
