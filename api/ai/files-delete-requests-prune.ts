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
import { clearDeleteRequestsFromStore, listDeleteRequestsFromStore, saveDeleteRequestToStore } from './_delete_requests_store.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req: any, res: any) {
  if (!verifyRole(req)) return respond(res, 403, { code: 'FORBIDDEN', error: 'forbidden' });
  if (!verifySuperAdmin(req)) return respond(res, 403, { code: 'SUPER_ADMIN_ONLY', error: 'super admin only' });
  if (req.method !== 'POST') return respond(res, 405, { code: 'METHOD_NOT_ALLOWED', error: 'Method Not Allowed' });
  if (!verifyCsrf(req)) return respond(res, 403, { code: 'CSRF_INVALID', error: 'csrf invalid' });

  try {
    await ensureDirs();
    const idx = await readIndex();
    const rows = await listDeleteRequestsFromStore(idx.delete_requests || {});
    const keepPending = rows.filter((row) => row.status === 'PENDING');
    const removed = rows.length - keepPending.length;

    await clearDeleteRequestsFromStore(idx.delete_requests || {});
    idx.delete_requests = {};
    for (const row of keepPending) {
      idx.delete_requests[row.request_id] = row as any;
      await saveDeleteRequestToStore(row as any, idx.delete_requests || {});
    }

    appendAuditLog(idx, {
      event: 'DELETE_PENDING_STATE_ROLLED_BACK',
      operator_id: parseUserId(req),
      operator_name: parseUserName(req),
      uid: '*',
      request_id: '*',
      original_path: '*',
      ip: parseIp(req),
      user_agent: parseUserAgent(req),
      detail: `prune-completed-delete-requests; removed=${removed}; kept_pending=${keepPending.length}`,
    });
    await writeIndex(idx);

    return respond(res, 200, {
      ok: true,
      code: 'DELETE_REQUESTS_PRUNED',
      removed,
      kept_pending: keepPending.length,
    });
  } catch (e: any) {
    return respond(res, 500, {
      code: 'DELETE_REQUESTS_PRUNE_FAILED',
      error: 'failed to prune delete requests',
      detail: String(e?.message || e),
    });
  }
}
