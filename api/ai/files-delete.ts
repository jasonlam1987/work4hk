import {
  appendAuditLog,
  deletePhysicalFileAndArtifacts,
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
} from './_file_store';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return respond(res, 405, { code: 'METHOD_NOT_ALLOWED', error: 'Method Not Allowed' });
  if (!verifyCsrf(req)) return respond(res, 403, { code: 'CSRF_INVALID', error: 'csrf invalid' });
  if (!verifySuperAdmin(req)) return respond(res, 403, { code: 'FORBIDDEN', error: 'super admin required' });

  try {
    await ensureDirs();
    const idx = await readIndex();
    const body = await readJsonBody(req);
    const uid = String(body?.uid || '').trim();
    const confirmText = String(body?.confirm_text || '').trim();
    if (!uid) return respond(res, 400, { code: 'MISSING_UID', error: 'missing uid' });
    if (confirmText !== 'DELETE') return respond(res, 400, { code: 'INVALID_CONFIRM_TEXT', error: 'confirm text mismatch' });

    const rec = idx.records?.[uid];
    if (!rec || rec.deleted_at) return respond(res, 404, { code: 'FILE_NOT_FOUND', error: 'file not found' });

    try {
      await deletePhysicalFileAndArtifacts(rec);
      rec.deleted_at = new Date().toISOString();
      idx.records[uid] = rec;
      appendAuditLog(idx, {
        event: 'FILE_PHYSICALLY_DELETED',
        operator_id: parseUserId(req),
        operator_name: parseUserName(req),
        uid,
        original_path: rec.stored_path,
        ip: parseIp(req),
        user_agent: parseUserAgent(req),
        detail: `role=${parseRole(req)}`,
      });
      await writeIndex(idx);
      return respond(res, 200, { ok: true, code: 'DELETE_COMPLETED', message: '刪除完成' });
    } catch (e: any) {
      appendAuditLog(idx, {
        event: 'FILE_DELETE_FAILED',
        operator_id: parseUserId(req),
        operator_name: parseUserName(req),
        uid,
        original_path: rec.stored_path,
        ip: parseIp(req),
        user_agent: parseUserAgent(req),
        detail: String(e?.message || e),
      });
      await writeIndex(idx);
      return respond(res, 500, { code: 'DELETE_FAILED', error: 'delete failed', detail: String(e?.message || e) });
    }
  } catch (e: any) {
    return respond(res, 500, { code: 'DELETE_FAILED', error: 'delete failed', detail: String(e?.message || e) });
  }
}
