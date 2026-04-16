import {
  appendAuditLog,
  deletePhysicalFileAndArtifacts,
  ensureDirs,
  parseIp,
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
import { listDeleteRequestsFromStore, saveDeleteRequestToStore } from './_delete_requests_store.js';
export const config = {
  runtime: 'nodejs',
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return respond(res, 405, { code: 'METHOD_NOT_ALLOWED', error: 'Method Not Allowed' });
  if (!verifyCsrf(req)) return respond(res, 403, { code: 'CSRF_INVALID', error: 'csrf invalid' });
  if (!verifySuperAdmin(req)) return respond(res, 403, { code: 'FORBIDDEN', error: 'super admin required' });

  try {
    await ensureDirs();
    const idx = await readIndex();
    const body = await readJsonBody(req);
    const requestId = String(body?.request_id || '').trim();
    const action = String(body?.action || '').trim().toUpperCase();
    const rejectReason = String(body?.reject_reason || '').trim();

    const fromStore = await listDeleteRequestsFromStore(idx.delete_requests || {});
    const row = fromStore.find((it: any) => it.request_id === requestId) || idx.delete_requests?.[requestId];
    if (!row) return respond(res, 404, { code: 'REQUEST_NOT_FOUND', error: 'request not found' });
    if (row.status !== 'PENDING') return respond(res, 409, { code: 'REQUEST_ALREADY_REVIEWED', error: 'request already reviewed' });

    row.reviewer_id = parseUserId(req);
    row.reviewer_name = parseUserName(req);
    row.reviewed_at = new Date().toISOString();

    if (action === 'REJECT') {
      row.status = 'REJECTED';
      row.reject_reason = rejectReason || '';
      idx.delete_requests[requestId] = row;
      await saveDeleteRequestToStore(row as any, idx.delete_requests || {});
      appendAuditLog(idx, {
        event: 'DELETE_REQUEST_REJECTED',
        operator_id: row.reviewer_id,
        operator_name: row.reviewer_name || 'unknown',
        uid: row.uid,
        request_id: row.request_id,
        original_path: row.stored_path,
        ip: parseIp(req),
        user_agent: parseUserAgent(req),
        detail: rejectReason,
      });
      await writeIndex(idx);
      return respond(res, 200, { ok: true, code: 'REQUEST_REJECTED', request: row });
    }

    if (action !== 'APPROVE') return respond(res, 400, { code: 'INVALID_ACTION', error: 'invalid action' });

    const rec = idx.records?.[row.uid];
    const recForDelete =
      rec ||
      ({
        uid: row.uid,
        module: row.module,
        owner_id: row.owner_id,
        folder: row.folder,
        original_name: row.original_name,
        mime_type: 'application/octet-stream',
        size: 0,
        sha256: '',
        stored_name: '',
        stored_path: row.stored_path,
        storage_backend: row.storage_object_path ? 'supabase' : 'local',
        storage_object_path: row.storage_object_path,
        created_at: row.created_at,
      } as any);
    if (rec?.deleted_at) return respond(res, 404, { code: 'FILE_NOT_FOUND', error: 'file not found' });
    await deletePhysicalFileAndArtifacts(recForDelete);
    if (rec) {
      rec.deleted_at = new Date().toISOString();
      idx.records[row.uid] = rec;
    }
    row.status = 'APPROVED';
    idx.delete_requests[requestId] = row;
    await saveDeleteRequestToStore(row as any, idx.delete_requests || {});

    appendAuditLog(idx, {
      event: 'DELETE_REQUEST_APPROVED',
      operator_id: row.reviewer_id,
      operator_name: row.reviewer_name || 'unknown',
      uid: row.uid,
      request_id: row.request_id,
      original_path: row.stored_path,
      ip: parseIp(req),
      user_agent: parseUserAgent(req),
      detail: row.reason,
    });
    appendAuditLog(idx, {
      event: 'FILE_PHYSICALLY_DELETED',
      operator_id: row.reviewer_id,
      operator_name: row.reviewer_name || 'unknown',
      uid: row.uid,
      request_id: row.request_id,
      original_path: row.stored_path,
      ip: parseIp(req),
      user_agent: parseUserAgent(req),
      detail: 'approved request',
    });
    await writeIndex(idx);
    return respond(res, 200, { ok: true, code: 'REQUEST_APPROVED_AND_FILE_DELETED', request: row });
  } catch (e: any) {
    return respond(res, 500, { code: 'REQUEST_REVIEW_FAILED', error: 'request review failed', detail: String(e?.message || e) });
  }
}
