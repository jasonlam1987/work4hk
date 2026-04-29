import { createHmac } from 'node:crypto';
import { downloadFromSupabaseStorage, isSupabaseStorageEnabled } from './_supabase_storage.js';

export const config = {
  runtime: 'nodejs',
};

const TOKEN_SECRET = String(process.env.FILE_TOKEN_SECRET || 'work4hk-file-secret');
const respond = (res: any, status: number, body: any) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};
const verifyRole = (req: any) => {
  const role = String(req?.headers?.['x-user-role'] || '').toLowerCase();
  return role.includes('admin') || role.includes('manager');
};
const sign = (payload: string) => createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
const parseToken = (token: string) => {
  const [raw, sig] = String(token || '').split('.');
  if (!raw || !sig || sign(raw) !== sig) return null;
  const payload = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  if (!payload || Number(payload.exp || 0) < Math.floor(Date.now() / 1000)) return null;
  return payload as {
    uid: string;
    object_path: string;
    mime_type: string;
    original_name: string;
  };
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return respond(res, 405, { code: 'METHOD_NOT_ALLOWED', error: 'Method Not Allowed' });

  try {
    const tokenInQuery = String(req?.query?.t || req?.query?.token || '').trim();
    if (!tokenInQuery && !verifyRole(req)) return respond(res, 403, { code: 'FORBIDDEN', error: 'forbidden' });

    if (!isSupabaseStorageEnabled()) {
      const local = await import('./_file_store.js');
      await local.ensureDirs();
      const uid = String(req?.query?.uid || '').trim();
      const tokenRaw = String(req?.query?.token || '').trim();
      if (!uid || !tokenRaw) return respond(res, 400, { code: 'MISSING_UID_OR_TOKEN', error: 'missing uid/token' });
      const idx = await local.readIndex();
      const rec = idx.records?.[uid];
      if (!rec || rec.deleted_at) return respond(res, 404, { code: 'FILE_NOT_FOUND', error: 'file not found' });
      const verify = local.verifyOneTimeToken(uid, tokenRaw, idx.used_tokens || {});
      if (!verify.ok) return respond(res, 401, { code: 'INVALID_TOKEN', error: `invalid token: ${verify.reason}` });
      idx.used_tokens[tokenRaw] = new Date().toISOString();
      await local.writeIndex(idx);
      const fs = await import('node:fs');
      res.statusCode = 200;
      res.setHeader('Content-Type', String(rec.mime_type || 'application/octet-stream'));
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(String(rec.original_name || rec.stored_name || 'file'))}`);
      res.setHeader('Content-Length', String(rec.size || 0));
      const stream = fs.createReadStream(rec.stored_path);
      stream.on('error', () => {
        if (!res.headersSent) respond(res, 500, { code: 'DOWNLOAD_STREAM_FAILED', error: 'download stream failed' });
        else res.end();
      });
      stream.pipe(res);
      return;
    }

    const token = String(req?.query?.t || '').trim();
    if (!token) return respond(res, 400, { code: 'MISSING_TOKEN', error: 'missing token' });
    const payload = parseToken(token);
    if (!payload) return respond(res, 401, { code: 'INVALID_TOKEN', error: 'invalid token' });

    res.statusCode = 200;
    res.setHeader('Content-Type', String(payload.mime_type || 'application/octet-stream'));
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(String(payload.original_name || 'file'))}`);
    const bytes = await downloadFromSupabaseStorage(payload.object_path);
    res.setHeader('Content-Length', String(bytes.length));
    res.end(bytes);
  } catch (e: any) {
    const detail = String(e?.message || e);
    console.error('[files-download] DOWNLOAD_FAILED', { detail });
    return respond(res, 500, { code: 'DOWNLOAD_FAILED', error: 'Download failed', detail });
  }
}
