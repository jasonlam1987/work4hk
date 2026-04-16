import { createReadStream } from 'node:fs';
import { ensureDirs, readIndex, respond, verifyOneTimeToken, verifyRole, writeIndex } from './_file_store';

export default async function handler(req: any, res: any) {
  if (!verifyRole(req)) return respond(res, 403, { error: 'forbidden' });
  if (req.method !== 'GET') return respond(res, 405, { error: 'Method Not Allowed' });

  try {
    await ensureDirs();
    const uid = String(req?.query?.uid || '').trim();
    const token = String(req?.query?.token || '').trim();
    if (!uid || !token) return respond(res, 400, { error: 'missing uid/token' });

    const idx = await readIndex();
    const rec = idx.records?.[uid];
    if (!rec || rec.deleted_at) return respond(res, 404, { error: 'file not found' });

    const verify = verifyOneTimeToken(uid, token, idx.used_tokens || {});
    if (!verify.ok) return respond(res, 401, { error: `invalid token: ${verify.reason}` });

    idx.used_tokens[token] = new Date().toISOString();
    await writeIndex(idx);

    res.statusCode = 200;
    res.setHeader('Content-Type', String(rec.mime_type || 'application/octet-stream'));
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(String(rec.original_name || rec.stored_name || 'file'))}`);
    res.setHeader('Content-Length', String(rec.size || 0));
    const stream = createReadStream(rec.stored_path);
    stream.on('error', () => {
      if (!res.headersSent) respond(res, 500, { error: 'download stream failed' });
      else res.end();
    });
    stream.pipe(res);
  } catch (e: any) {
    return respond(res, 500, { error: 'Download failed', detail: String(e?.message || e) });
  }
}
