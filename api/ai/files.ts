import {
  createOneTimeToken,
  ensureDirs,
  readIndex,
  readJsonBody,
  respond,
  storeFileFromDataUrl,
  verifyRole,
  writeIndex,
} from './_file_store';

export const config = {
  runtime: 'nodejs',
};

export default async function handler(req: any, res: any) {
  if (!verifyRole(req)) return respond(res, 403, { code: 'FORBIDDEN', error: 'forbidden' });
  if (!['POST', 'DELETE', 'GET'].includes(req.method)) return respond(res, 405, { code: 'METHOD_NOT_ALLOWED', error: 'Method Not Allowed' });

  try {
    await ensureDirs();
    const idx = await readIndex();

    if (req.method === 'GET') {
      const moduleName = String(req?.query?.module || '').trim();
      const ownerId = Number(req?.query?.owner_id || 0);
      const folder = String(req?.query?.folder || '').trim();
      const listRaw = Object.values(idx.records || {})
        .filter((r: any) => !r.deleted_at)
        .filter((r: any) => (!moduleName || r.module === moduleName))
        .filter((r: any) => (!ownerId || Number(r.owner_id) === ownerId))
        .filter((r: any) => (!folder || r.folder === folder))
        .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)));
      const list = listRaw.map((r: any) => {
        const token = createOneTimeToken(r.uid);
        return {
          ...r,
          download_url: `/api/ai/files-download?uid=${encodeURIComponent(r.uid)}&token=${encodeURIComponent(token)}`,
          token_expires_in: 600,
        };
      });
      return respond(res, 200, { items: list });
    }

    const body = await readJsonBody(req);

    if (req.method === 'DELETE') {
      const uid = String(body?.uid || '').trim();
      if (!uid) return respond(res, 400, { code: 'MISSING_UID', error: 'missing uid' });
      const rec = idx.records[uid];
      if (!rec) return respond(res, 404, { code: 'FILE_NOT_FOUND', error: 'file not found' });
      rec.deleted_at = new Date().toISOString();
      idx.records[uid] = rec;
      await writeIndex(idx);
      return respond(res, 200, { ok: true });
    }

    const rec = await storeFileFromDataUrl(body);
    idx.records[rec.uid] = rec;
    await writeIndex(idx);

    const token = createOneTimeToken(rec.uid);
    return respond(res, 200, {
      uid: rec.uid,
      module: rec.module,
      owner_id: rec.owner_id,
      folder: rec.folder,
      original_name: rec.original_name,
      mime_type: rec.mime_type,
      size: rec.size,
      sha256: rec.sha256,
      stored_path: rec.stored_path,
      download_url: `/api/ai/files-download?uid=${encodeURIComponent(rec.uid)}&token=${encodeURIComponent(token)}`,
      token_expires_in: 600,
    });
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (msg.includes('file too large')) {
      console.error('[files] FILE_TOO_LARGE', { detail: msg });
      return respond(res, 400, { code: 'FILE_TOO_LARGE', error: '檔案大小超過 10 MB，請壓縮後再上傳' });
    }
    if (msg.includes('unsupported file type')) {
      console.error('[files] UNSUPPORTED_FILE_TYPE', { detail: msg });
      return respond(res, 400, { code: 'UNSUPPORTED_FILE_TYPE', error: 'Unsupported file type' });
    }
    console.error('[files] UPLOAD_FAILED', { detail: msg });
    return respond(res, 500, { code: 'UPLOAD_FAILED', error: 'Upload failed', detail: msg });
  }
}
