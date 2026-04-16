import { ensureDirs, parseRole, parseUserId, readIndex, respond, verifyRole } from './_file_store.js';
import { listDeleteRequestsFromStore } from './_delete_requests_store.js';

export const config = {
  runtime: 'nodejs',
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return respond(res, 405, { code: 'METHOD_NOT_ALLOWED', error: 'Method Not Allowed' });
  if (!verifyRole(req)) return respond(res, 403, { code: 'FORBIDDEN', error: 'forbidden' });
  try {
    await ensureDirs();
    const idx = await readIndex();
    const role = parseRole(req);
    const userId = parseUserId(req);
    const all = await listDeleteRequestsFromStore(idx.delete_requests || {});
    const items = role.includes('super')
      ? all
      : all.filter((it: any) => String(it.requester_id || '') === String(userId || ''));
    return respond(res, 200, { items });
  } catch (e: any) {
    return respond(res, 500, { code: 'LIST_FAILED', error: 'list failed', detail: String(e?.message || e) });
  }
}
