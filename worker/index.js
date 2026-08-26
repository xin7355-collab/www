/**
 * Workers 部署路線的進入點（`wrangler.jsonc` 的 `main`）。
 *
 * 關鍵在 `assets.run_worker_first: true` —— 沒有它，靜態檔案會先於 Worker 被送出，
 * 閘門就只擋得到「沒有對應檔案的路徑」，JS bundle 直接裸奔。
 */
import { guard } from './gate.js';

const handler = {
  async fetch(request, env) {
    return (await guard(request, env)) ?? env.ASSETS.fetch(request);
  },
};

export default handler;
