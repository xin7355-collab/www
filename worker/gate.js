/**
 * 密碼閘門的共用邏輯 —— Pages Functions 與 Workers 兩條部署路線都用這一份。
 *
 * 密碼放在 Cloudflare 專案的 Secret `SITE_PASSWORD`。
 * 沒設這個變數時直接放行 —— 寧可沒鎖，也不要因為忘了設而把自己關在門外。
 *
 * 通過驗證後發一張 HMAC 簽章的 cookie，簽章金鑰就是密碼本身：
 * 改密碼 = 舊 cookie 全部失效，不必另外管理 session。
 */

const COOKIE_NAME = 'ms_gate';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 天
export const LOGIN_PATH = '/__login';

/**
 * 檢查這個請求該不該被擋下。
 * @returns 要回給瀏覽器的 Response；`null` 代表放行，交給後面的靜態資源處理
 */
export async function guard(request, env) {
  const password = env.SITE_PASSWORD;
  if (!password) return null;

  const url = new URL(request.url);

  if (url.pathname === LOGIN_PATH) {
    if (request.method !== 'POST') return redirectHome();

    const form = await request.formData();
    if (!(await sameSecret(String(form.get('password') ?? ''), password))) {
      return loginPage('密碼錯誤', 401);
    }

    const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
    return new Response(null, {
      status: 303,
      headers: {
        Location: '/',
        'Set-Cookie': `${COOKIE_NAME}=${exp}.${await sign(String(exp), password)}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
        'Cache-Control': 'no-store',
      },
    });
  }

  if (await hasValidToken(request, password)) return null;
  return loginPage('', 401);
}

// ─── Token ────────────────────────────────────────────────────

async function hasValidToken(request, password) {
  const raw = readCookie(request, COOKIE_NAME);
  if (!raw) return false;

  const dot = raw.lastIndexOf('.');
  if (dot < 1) return false;

  const exp = Number(raw.slice(0, dot));
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;

  return timingSafeEqual(raw.slice(dot + 1), await sign(String(exp), password));
}

function readCookie(request, name) {
  const header = request.headers.get('Cookie');
  if (!header) return '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return '';
}

// ─── 密碼學 ───────────────────────────────────────────────────

const bytes = (s) => new TextEncoder().encode(s);

const toBase64Url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

async function sign(data, key) {
  const k = await crypto.subtle.importKey('raw', bytes(key), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return toBase64Url(await crypto.subtle.sign('HMAC', k, bytes(data)));
}

/** 先各自雜湊再比對：長度固定，不會從比對耗時洩漏密碼長度 */
async function sameSecret(a, b) {
  const [ha, hb] = await Promise.all([digest(a), digest(b)]);
  return timingSafeEqual(ha, hb);
}

async function digest(s) {
  return toBase64Url(await crypto.subtle.digest('SHA-256', bytes(s)));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ─── 登入頁 ───────────────────────────────────────────────────

function redirectHome() {
  return new Response(null, { status: 303, headers: { Location: '/', 'Cache-Control': 'no-store' } });
}

function loginPage(error, status) {
  const message = error
    ? `<p class="err">${error}</p>`
    : '';

  return new Response(
    `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<title>我的片庫</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;
       padding:calc(1.5rem + env(safe-area-inset-top)) 1.5rem calc(1.5rem + env(safe-area-inset-bottom));
       background:#0a0a0c;color:#e8e6e1;
       font-family:"Noto Sans TC",system-ui,-apple-system,"PingFang TC","Microsoft JhengHei",sans-serif}
  form{width:100%;max-width:20rem;text-align:center}
  .logo{font-size:3rem;margin-bottom:1rem}
  h1{font-size:1.5rem;letter-spacing:.2em;margin:0 0 .5rem;font-weight:500}
  .sub{font-size:.7rem;letter-spacing:.3em;color:#6b6a72;text-transform:uppercase;margin:0 0 2.5rem}
  .err{margin:0 0 1rem;padding:.55rem .75rem;border:1px solid rgba(203,74,58,.4);
       background:rgba(203,74,58,.1);border-radius:.5rem;font-size:.75rem;color:#cb4a3a}
  input{width:100%;padding:.7rem .9rem;margin-bottom:.75rem;border-radius:.5rem;
        border:1px solid #2a2a30;background:#141418;color:#e8e6e1;font-size:1rem;text-align:center}
  input:focus{outline:none;border-color:#e2c178}
  button{width:100%;padding:.7rem;border:0;border-radius:.5rem;background:#e2c178;color:#0a0a0c;
         font-size:.875rem;font-weight:500;cursor:pointer}
  button:hover{background:#eed296}
</style>
</head>
<body>
<form method="POST" action="${LOGIN_PATH}">
  <div class="logo">🎬</div>
  <h1>我的片庫</h1>
  <p class="sub">Personal Stream</p>
  ${message}
  <input type="password" name="password" placeholder="輸入通行密碼" autofocus autocomplete="current-password" required>
  <button type="submit">進入</button>
</form>
</body>
</html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
}
