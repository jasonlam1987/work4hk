import {
  appendAuditLog,
  ensureDirs,
  parseIp,
  parseUserAgent,
  parseUserId,
  parseUserName,
  readIndex,
  respond,
  verifyCsrf,
  verifyRole,
  verifySuperAdmin,
  writeIndex,
} from './_file_store.js';
import { clearDeleteRequestsFromStore } from './_delete_requests_store.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req: any, res: any) {
  if (!verifyRole(req)) return respond(res, 403, { code: 'FORBIDDEN', error: 'forbidden' });
  if (!verifySuperAdmin(req)) return respond(res, 403, { code: 'SUPER_ADMIN_ONLY', error: 'super admin only' });
  if (req.method !== 'POST') return respond(res, 405, { code: 'METHOD_NOT_ALLOWED', error: 'Method Not Allowed' });
  if (!verifyCsrf(req)) return respond(res, 403, { code: 'CSRF_INVALID', error: 'csrf invalid' });

  try {
    await ensureDirs();
    const idx = await readIndex();
    const cleared = await clearDeleteRequestsFromStore(idx.delete_requests || {});
    idx.delete_requests = {};
    appendAuditLog(idx, {
      event: 'DELETE_PENDING_STATE_ROLLED_BACK',
      operator_id: parseUserId(req),
      operator_name: parseUserName(req),
      uid: '*',
      request_id: '*',
      original_path: '*',
      ip: parseIp(req),
      user_agent: parseUserAgent(req),
      detail: `reset-all-delete-requests; removed=${Number(cleared?.removed || 0)}`,
    });
    await writeIndex(idx);
    return respond(res, 200, {
      ok: true,
      code: 'DELETE_REQUESTS_CLEARED',
      removed: Number(cleared?.removed || 0),
    });
  } catch (e: any) {
    return respond(res, 500, {
      code: 'DELETE_REQUESTS_CLEAR_FAILED',
      error: 'failed to clear delete requests',
      detail: String(e?.message || e),
    });
  }
}
