'use client';

import { useEffect, useState } from 'react';
import * as api from '@/lib/api';
import { clearStored, setStored, useStored } from '@/lib/localStore';

const LAST_ACCOUNT = 'myStream.lastAccount';

/**
 * 「目前登入誰」的真實來源是 localStorage，不是 React state ——
 * 這樣重新整理就自動回到上次的帳號，也不需要在 effect 裡補寫 state。
 */
export function useAccounts() {
  const currentAccount = useStored(LAST_ACCOUNT, '');
  const isLoggedIn = Boolean(currentAccount);

  const [accounts, setAccounts] = useState<string[]>([]);
  const [initializing, setInitializing] = useState(true);
  const [loginName, setLoginName] = useState('');
  const [loginError, setLoginError] = useState('');
  const [verifying, setVerifying] = useState(false);

  const refreshAccounts = async () => {
    const list = await api.fetchAccounts();
    setAccounts(list);
    return list;
  };

  // 開站時抓一次帳號列表。已經有登入帳號的話是背景同步，
  // 抓失敗也不要用錯誤訊息打斷使用者。
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const hadAccount = Boolean(localStorage.getItem(LAST_ACCOUNT));
      try {
        if (!api.isConfigured()) {
          throw new api.ApiError(
            '尚未設定 NEXT_PUBLIC_APPS_SCRIPT_URL，請參考 README 建立 .env.local',
          );
        }
        const list = await api.fetchAccounts();
        if (!cancelled) setAccounts(list);
      } catch (err) {
        if (!cancelled && !hadAccount) {
          setLoginError(err instanceof Error ? err.message : '無法取得帳號列表');
        }
      } finally {
        if (!cancelled) setInitializing(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogin = async () => {
    const name = loginName.trim();
    if (!name) return;

    setVerifying(true);
    setLoginError('');
    try {
      const list = await refreshAccounts();
      const matched = list.find((a) => a.toLowerCase() === name.toLowerCase());
      if (matched) {
        setStored(LAST_ACCOUNT, matched);
      } else {
        const hint = list.length ? `（現有帳號：${list.join('、')}）` : '（目前沒有任何帳號）';
        setLoginError(`找不到帳號「${name}」${hint}`);
      }
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : '登入失敗，請檢查網路或 Apps Script 部署');
    } finally {
      setVerifying(false);
    }
  };

  const handleCreateAccount = async () => {
    const name = loginName.trim();
    if (!name) return;

    setVerifying(true);
    setLoginError('');
    try {
      await api.createAccount(name);
      await refreshAccounts();
      setStored(LAST_ACCOUNT, name);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : '建立失敗');
    } finally {
      setVerifying(false);
    }
  };

  const handleLogout = () => {
    clearStored(LAST_ACCOUNT);
    setLoginName('');
    setLoginError('');
  };

  const handleDeleteAccount = async () => {
    if (!currentAccount) return;
    try {
      await api.deleteAccount(currentAccount);
      handleLogout();
      await refreshAccounts();
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : '註銷失敗');
    }
  };

  return {
    accounts,
    currentAccount,
    isLoggedIn,
    initializing,
    loginName,
    loginError,
    verifying,
    setLoginName,
    setLoginError,
    handleLogin,
    handleCreateAccount,
    handleLogout,
    handleDeleteAccount,
  };
}
