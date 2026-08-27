'use client';

interface Props {
  loginName: string;
  loginError: string;
  verifying: boolean;
  onNameChange: (v: string) => void;
  onLogin: () => void;
  onCreate: () => void;
}

export default function LoginScreen({
  loginName,
  loginError,
  verifying,
  onNameChange,
  onLogin,
  onCreate,
}: Props) {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm star-rise">
        <div className="text-center mb-10">
          <div className="text-5xl mb-4">🎬</div>
          <h1 className="font-display text-3xl tracking-widest text-mist">墨影</h1>
        </div>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            onLogin();
          }}
        >
          <input
            className="field text-center"
            placeholder="輸入你的帳號名稱"
            value={loginName}
            onChange={(e) => onNameChange(e.target.value)}
            autoFocus
          />

          <button
            type="submit"
            disabled={verifying || !loginName.trim()}
            className="w-full rounded-lg bg-moon py-2.5 text-sm font-medium text-ink-black transition hover:bg-moon-soft disabled:cursor-not-allowed disabled:opacity-40"
          >
            {verifying ? '驗證中…' : '進入片庫'}
          </button>

          <button
            type="button"
            onClick={onCreate}
            disabled={verifying || !loginName.trim()}
            className="w-full rounded-lg border border-ink-border-strong py-2.5 text-sm text-mist-silver transition hover:border-moon-soft hover:text-moon disabled:cursor-not-allowed disabled:opacity-40"
          >
            以此名稱建立新帳號
          </button>
        </form>

        {loginError && (
          <p className="mt-4 rounded-lg border border-cinnabar/40 bg-cinnabar/10 px-3 py-2 text-xs leading-relaxed text-cinnabar">
            {loginError}
          </p>
        )}

      </div>
    </main>
  );
}
