import { createReadStream } from 'node:fs';
import { ensureDirs, readIndex, respond, verifyOneTimeToken, verifyRole, writeIndex } from './_file_store';
import { downloadFromSupabaseStorage } from './_supabase_storage';

export const config = {
  runtime: 'nodejs',
};

export default async function handler(req: any, res: any) {
  if (!verifyRole(req)) return respond(res, 403, { code: 'FORBIDDEN', error: 'forbidden' });
  if (req.method !== 'GET') return respond(res, 405, { code: 'METHOD_NOT_ALLOWED', error: 'Method Not Allowed' });

  try {
    await ensureDirs();
    const uid = String(req?.query?.uid || '').trim();
    const token = String(req?.query?.token || '').trim();
    if (!uid || !token) return respond(res, 400, { code: 'MISSING_UID_OR_TOKEN', error: 'missing uid/token' });

    const idx = await readIndex();
    const rec = idx.records?.[uid];
    if (!rec || rec.deleted_at) return respond(res, 404, { code: 'FILE_NOT_FOUND', error: 'file not found' });

    const verify = verifyOneTimeToken(uid, token, idx.used_tokens || {});
    if (!verify.ok) return respond(res, 401, { code: 'INVALID_TOKEN', error: `invalid token: ${verify.reason}` });

    idx.used_tokens[token] = new Date().toISOString();
    await writeIndex(idx);

    res.statusCode = 200;
    res.setHeader('Content-Type', String(rec.mime_type || 'application/octet-stream'));
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(String(rec.original_name || rec.stored_name || 'file'))}`);
    if (rec.storage_backend === 'supabase' && rec.storage_object_path) {
      const bytes = await downloadFromSupabaseStorage(rec.storage_object_path);
      res.setHeader('Content-Length', String(bytes.length));
      res.end(bytes);
      return;
    }
    res.setHeader('Content-Length', String(rec.size || 0));
    const stream = createReadStream(rec.stored_path);
    stream.on('error', () => {
      console.error('[files-download] DOWNLOAD_STREAM_FAILED', { uid, storedPath: rec.stored_path });
      if (!res.headersSent) respond(res, 500, { code: 'DOWNLOAD_STREAM_FAILED', error: 'download stream failed' });
      else res.end();
    });
    stream.pipe(res);
  } catch (e: any) {
    const detail = String(e?.message || e);
    console.error('[files-download] DOWNLOAD_FAILED', { detail });
    return respond(res, 500, { code: 'DOWNLOAD_FAILED', error: 'Download failed', detail });
  }
}
