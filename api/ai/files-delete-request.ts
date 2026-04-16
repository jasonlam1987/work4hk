import {
  appendAuditLog,
  createDeleteRequestRecord,
  ensureDirs,
  parseIp,
  parseRole,
  parseUserAgent,
  parseUserId,
  parseUserName,
  readIndex,
  readJsonBody,
  respond,
  verifyCsrf,
  verifySuperAdmin,
  writeIndex,
} from './_file_store.js';
export const config = {
  runtime: 'nodejs',
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return respond(res, 405, { code: 'METHOD_NOT_ALLOWED', error: 'Method Not Allowed' });
  if (!verifyCsrf(req)) return respond(res, 403, { code: 'CSRF_INVALID', error: 'csrf invalid' });
  if (!parseRole(req)) return respond(res, 403, { code: 'FORBIDDEN', error: 'role required' });

  try {
    await ensureDirs();
    const idx = await readIndex();
    const body = await readJsonBody(req);
    const uid = String(body?.uid || '').trim();
    const reason = String(body?.reason || '').trim();
    const companyName = String(body?.company_name || '').trim();
    const sectionName = String(body?.section_name || '').trim();
    if (!uid) return respond(res, 400, { code: 'MISSING_UID', error: 'missing uid' });
    if (reason.length < 3) return respond(res, 400, { code: 'INVALID_REASON', error: '請填寫刪除理由（至少 3 字）' });
    const rec = idx.records?.[uid];
    if (!rec || rec.deleted_at) return respond(res, 404, { code: 'FILE_NOT_FOUND', error: 'file not found' });

    if (verifySuperAdmin(req)) {
      return respond(res, 400, { code: 'SUPER_ADMIN_SHOULD_DELETE_DIRECTLY', error: 'super admin should call delete endpoint' });
    }

    const dup = Object.values(idx.delete_requests || {}).find(
      (it: any) => it.uid === uid && it.status === 'PENDING'
    );
    if (dup) return respond(res, 409, { code: 'DUPLICATE_PENDING_REQUEST', error: '已有待審核刪除申請' });

    const row = createDeleteRequestRecord({
      rec,
      reason,
      requester_id: parseUserId(req),
      requester_name: parseUserName(req),
    });
    idx.delete_requests[row.request_id] = row;

    const msg = `用戶 ${row.requester_name} 於 ${row.created_at} 申請刪除 ${companyName || '-'} 隸屬 ${sectionName || row.folder} 的檔案 ${row.original_name}`;
    appendAuditLog(idx, {
      event: 'DELETE_REQUEST_CREATED',
      operator_id: row.requester_id,
      operator_name: row.requester_name,
      uid,
      request_id: row.request_id,
      original_path: rec.stored_path,
      ip: parseIp(req),
      user_agent: parseUserAgent(req),
      detail: `${msg}; reason=${reason}`,
    });
    await writeIndex(idx);
    return respond(res, 200, { ok: true, code: 'DELETE_REQUEST_CREATED', request: row, message: msg });
  } catch (e: any) {
    return respond(res, 500, { code: 'DELETE_REQUEST_FAILED', error: 'delete request failed', detail: String(e?.message || e) });
  }
}
