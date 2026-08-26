/**
 * Pages 部署路線的閘門。
 *
 * ⚠️ Pages 的靜態資源可能先於 Functions 被送出（本機模擬器就是如此），
 * 那樣這道閘門只擋得到「沒有對應檔案的路徑」。部署後**務必用無痕視窗實測**：
 * 沒擋住的話改走 Workers 路線（`worker/index.js` + `run_worker_first`），那條是確定的。
 */
import { guard } from '../worker/gate.js';

export async function onRequest({ request, env, next }) {
  return (await guard(request, env)) ?? next();
}
