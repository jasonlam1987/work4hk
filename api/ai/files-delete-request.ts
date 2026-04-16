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
    const objectPath = String(body?.object_path || '').trim();
    const moduleName = String(body?.module || '').trim() as any;
    const ownerId = Number(body?.owner_id || 0);
    const folder = String(body?.folder || '').trim();
    const fileName = String(body?.file_name || '').trim();
    const storedPath = String(body?.stored_path || '').trim();
    const uploaderIdFromBody = String(body?.uploader_id || '').trim();
    const uploaderNameFromBody = String(body?.uploader_name || '').trim().toLowerCase();
    if (!uid) return respond(res, 400, { code: 'MISSING_UID', error: 'missing uid' });
    if (reason.length < 3) return respond(res, 400, { code: 'INVALID_REASON', error: '請填寫刪除理由（至少 3 字）' });
    const rec = idx.records?.[uid];
    if (!rec && !objectPath) return respond(res, 404, { code: 'FILE_NOT_FOUND', error: 'file not found' });
    if (rec?.deleted_at) return respond(res, 404, { code: 'FILE_NOT_FOUND', error: 'file not found' });

    if (verifySuperAdmin(req)) {
      return respond(res, 400, { code: 'SUPER_ADMIN_SHOULD_DELETE_DIRECTLY', error: 'super admin should call delete endpoint' });
    }

    const requesterId = parseUserId(req);
    const requesterName = String(parseUserName(req) || '').trim().toLowerCase();
    const uploaderId = String((rec as any)?.uploader_id || uploaderIdFromBody).trim();
    const uploaderName = String((rec as any)?.uploader_name || uploaderNameFromBody).trim().toLowerCase();
    const hasIdMatch = Boolean(requesterId && uploaderId && requesterId === uploaderId);
    const hasNameMatch = Boolean(requesterName && uploaderName && requesterName === uploaderName);
    if (!hasIdMatch && !hasNameMatch) {
      return respond(res, 403, {
        code: 'ONLY_UPLOADER_CAN_REQUEST_DELETE',
        error: '只有該文件上傳者可申請刪除',
      });
    }

    const dup = Object.values(idx.delete_requests || {}).find(
      (it: any) => it.uid === uid && it.status === 'PENDING'
    );
    if (dup) return respond(res, 409, { code: 'DUPLICATE_PENDING_REQUEST', error: '已有待審核刪除申請' });

    const baseRec = rec || {
      uid,
      module: moduleName || 'employers',
      owner_id: ownerId || 0,
      folder: folder || sectionName || '',
      original_name: fileName || uid,
      mime_type: 'application/octet-stream',
      size: 0,
      sha256: '',
      stored_name: '',
      stored_path: storedPath || (objectPath ? `supabase://${objectPath}` : ''),
      storage_backend: objectPath ? 'supabase' : 'local',
      storage_object_path: objectPath || undefined,
      uploader_id: uploaderId || undefined,
      uploader_name: uploaderName || undefined,
      created_at: new Date().toISOString(),
    } as any;

    const row = createDeleteRequestRecord({
      rec: baseRec,
      reason,
      requester_id: requesterId,
      requester_account: requesterId,
      requester_name: parseUserName(req),
      company_name: companyName,
      section_name: sectionName,
    });
    idx.delete_requests[row.request_id] = row;

    const msg = '已向超級管理員申請刪除，待批准後將自動刪除';
    appendAuditLog(idx, {
      event: 'DELETE_REQUEST_CREATED',
      operator_id: row.requester_id,
      operator_name: row.requester_name,
      uid,
      request_id: row.request_id,
      original_path: String(baseRec.stored_path || ''),
      ip: parseIp(req),
      user_agent: parseUserAgent(req),
      detail: `${companyName || '-'} / ${sectionName || row.folder} / ${row.original_name}; reason=${reason}`,
    });
    await writeIndex(idx);
    return respond(res, 200, { ok: true, code: 'DELETE_REQUEST_CREATED', request: row, message: msg });
  } catch (e: any) {
    return respond(res, 500, { code: 'DELETE_REQUEST_FAILED', error: 'delete request failed', detail: String(e?.message || e) });
  }
}
