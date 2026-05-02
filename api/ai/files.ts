import { createHash, createHmac, randomUUID } from 'node:crypto';
import {
  getSupabaseFolderPrefix,
  getSupabaseObjectPath,
  isSupabaseStorageEnabled,
  listSupabaseStorageByPrefix,
  removeFromSupabaseStorage,
  uploadToSupabaseStorage,
} from './_supabase_storage.js';

export const config = {
  runtime: 'nodejs',
};

const ALLOWED = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const MAX_SIZE = 10 * 1024 * 1024;
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
const parseUserId = (req: any) => String(req?.headers?.['x-user-id'] || '').trim();
const parseUserName = (req: any) => {
  const raw = String(req?.headers?.['x-user-name'] || '').trim();
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

const readJsonBody = async (req: any) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
};

const sign = (payload: string) => createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
const createDownloadToken = (payload: any) => {
  const raw = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = sign(raw);
  return `${raw}.${sig}`;
};

const encodeUserSegment = (v: string) => Buffer.from(String(v || ''), 'utf8').toString('base64url');
const decodeUserSegment = (v: string) => {
  try {
    return Buffer.from(String(v || ''), 'base64url').toString('utf8');
  } catch {
    return '';
  }
};
const injectUploaderIntoObjectPath = (objectPath: string, uid: string, uploaderId: string, uploaderName: string) => {
  const marker = `uploader_${encodeUserSegment(uploaderId || 'unknown')}_n_${encodeUserSegment(uploaderName || '')}`;
  return String(objectPath || '').replace(`${uid}__`, `${uid}__${marker}__`);
};
const parseObjectName = (nameRaw: string) => {
  const sep = nameRaw.indexOf('__');
  const uid = sep > 0 ? nameRaw.slice(0, sep) : nameRaw;
  const rest = sep > 0 ? nameRaw.slice(sep + 2) : '';
  const markerMatch = rest.match(/^uploader_([A-Za-z0-9_-]+)_n_([A-Za-z0-9_-]*)__([\s\S]+)$/);
  if (!markerMatch) return { uid, originalName: rest || nameRaw, uploaderId: '', uploaderName: '' };
  return {
    uid,
    uploaderId: decodeUserSegment(markerMatch[1]),
    uploaderName: decodeUserSegment(markerMatch[2]),
    originalName: markerMatch[3] || nameRaw,
  };
};

export default async function handler(req: any, res: any) {
  if (!verifyRole(req)) return respond(res, 403, { code: 'FORBIDDEN', error: 'forbidden' });
  if (!['POST', 'DELETE', 'GET'].includes(req.method)) return respond(res, 405, { code: 'METHOD_NOT_ALLOWED', error: 'Method Not Allowed' });

  try {
    if (!isSupabaseStorageEnabled()) {
      const local = await import('./_file_store.js');
      await local.ensureDirs();
      const idx = await local.readIndex();

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
          const token = local.createOneTimeToken(r.uid);
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
        await local.writeIndex(idx);
        return respond(res, 200, { ok: true });
      }

      const rec = await local.storeFileFromDataUrl(body, {
        user_id: parseUserId(req),
        user_name: parseUserName(req),
      });
      idx.records[rec.uid] = rec;
      await local.writeIndex(idx);
      const token = local.createOneTimeToken(rec.uid);
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
        uploader_id: rec.uploader_id || '',
        uploader_name: rec.uploader_name || '',
        download_url: `/api/ai/files-download?uid=${encodeURIComponent(rec.uid)}&token=${encodeURIComponent(token)}`,
        token_expires_in: 600,
      });
    }

    if (req.method === 'GET') {
      const moduleName = String(req?.query?.module || '').trim() as 'employers' | 'approvals' | 'workers';
      const ownerId = Number(req?.query?.owner_id || 0);
      const folder = String(req?.query?.folder || '').trim();
      if (!moduleName || !['employers', 'approvals', 'workers'].includes(moduleName)) {
        return respond(res, 400, { code: 'INVALID_MODULE', error: 'invalid module' });
      }
      if (!ownerId || ownerId < 1) return respond(res, 400, { code: 'INVALID_OWNER_ID', error: 'invalid owner_id' });
      if (!folder) return respond(res, 200, { items: [] });

      const prefix = getSupabaseFolderPrefix(moduleName, ownerId, folder);
      const rows = await listSupabaseStorageByPrefix(prefix);
      const items = rows
        .filter((it: any) => it && !it.id?.endsWith('/'))
        .map((it: any) => {
          const nameRaw = String(it.name || '');
          const parsedName = parseObjectName(nameRaw);
          const uid = parsedName.uid;
          const originalName = parsedName.originalName;
          const objectPath = `${prefix}${nameRaw}`;
          const mimeType = String(it?.metadata?.mimetype || 'application/octet-stream');
          const size = Number(it?.metadata?.size || 0);
          const createdAt = String(it?.created_at || new Date().toISOString());
          const token = createDownloadToken({
            uid,
            object_path: objectPath,
            mime_type: mimeType,
            original_name: originalName,
            exp: Math.floor(Date.now() / 1000) + 10 * 60,
          });
          return {
            uid,
            module: moduleName,
            owner_id: ownerId,
            folder,
            original_name: originalName,
            mime_type: mimeType,
            size,
            stored_path: `supabase://${objectPath}`,
            object_path: objectPath,
            uploader_id: parsedName.uploaderId || '',
            uploader_name: parsedName.uploaderName || '',
            created_at: createdAt,
            download_url: `/api/ai/files-download?t=${encodeURIComponent(token)}`,
            token_expires_in: 600,
          };
        })
        .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)));
      return respond(res, 200, { items });
    }

    const body = await readJsonBody(req);

    if (req.method === 'DELETE') {
      const objectPath = String(body?.object_path || '').trim();
      if (!objectPath) return respond(res, 400, { code: 'MISSING_OBJECT_PATH', error: 'missing object_path' });
      if (isSupabaseStorageEnabled()) await removeFromSupabaseStorage(objectPath);
      return respond(res, 200, { ok: true });
    }

    const moduleName = String(body?.module || '').trim() as 'employers' | 'approvals' | 'workers';
    const ownerId = Number(body?.owner_id || 0);
    const folder = String(body?.folder || '').trim();
    const fileName = String(body?.file_name || '').trim();
    const mimeType = String(body?.mime_type || '').trim();
    const dataUrl = String(body?.data_url || '').trim();
    if (!moduleName || !['employers', 'approvals', 'workers'].includes(moduleName)) throw new Error('invalid module');
    if (!ownerId || ownerId < 1) throw new Error('invalid owner_id');
    if (!folder || !fileName || !mimeType || !dataUrl.startsWith('data:')) throw new Error('invalid payload');
    if (!ALLOWED.has(mimeType)) throw new Error('unsupported file type');
    const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : '';
    if (!base64) throw new Error('invalid file data');
    const bytes = Buffer.from(base64, 'base64');
    if (bytes.length > MAX_SIZE) throw new Error('file too large');

    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const requesterId = parseUserId(req);
    const requesterName = parseUserName(req);
    let uid = '';
    let objectPath = '';
    let uploaded = false;
    let lastUploadError: any = null;
    for (let i = 0; i < 3; i += 1) {
      uid = randomUUID();
      const baseObjectPath = getSupabaseObjectPath(moduleName, ownerId, folder, uid, fileName);
      objectPath = injectUploaderIntoObjectPath(baseObjectPath, uid, requesterId, requesterName);
      try {
        await uploadToSupabaseStorage(objectPath, bytes, mimeType);
        uploaded = true;
        break;
      } catch (uploadErr: any) {
        lastUploadError = uploadErr;
        const msg = String(uploadErr?.message || uploadErr);
        const isConflict = msg.includes('statusCode":"409"') || msg.toLowerCase().includes('resource already exists');
        if (!isConflict) break;
      }
    }
    if (!uploaded) throw lastUploadError || new Error('supabase upload failed');
    const token = createDownloadToken({
      uid,
      object_path: objectPath,
      mime_type: mimeType,
      original_name: fileName,
      exp: Math.floor(Date.now() / 1000) + 10 * 60,
    });
    return respond(res, 200, {
      uid,
      module: moduleName,
      owner_id: ownerId,
      folder,
      original_name: fileName,
      mime_type: mimeType,
      size: bytes.length,
      sha256,
      stored_path: `supabase://${objectPath}`,
      object_path: objectPath,
      uploader_id: requesterId || '',
      uploader_name: requesterName || '',
      download_url: `/api/ai/files-download?t=${encodeURIComponent(token)}`,
      token_expires_in: 600,
    });
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (msg.includes('invalid module') || msg.includes('invalid owner_id') || msg.includes('invalid payload') || msg.includes('invalid file data')) {
      console.error('[files] INVALID_REQUEST', { detail: msg });
      return respond(res, 400, { code: 'INVALID_REQUEST', error: msg, detail: msg });
    }
    if (msg.includes('file too large')) {
      console.error('[files] FILE_TOO_LARGE', { detail: msg });
      return respond(res, 400, { code: 'FILE_TOO_LARGE', error: '檔案大小超過 10 MB，請壓縮後再上傳' });
    }
    if (msg.includes('unsupported file type')) {
      console.error('[files] UNSUPPORTED_FILE_TYPE', { detail: msg });
      return respond(res, 400, { code: 'UNSUPPORTED_FILE_TYPE', error: 'Unsupported file type' });
    }
    const action = req?.method === 'DELETE' ? 'DELETE' : req?.method === 'GET' ? 'LIST' : 'UPLOAD';
    console.error(`[files] ${action}_FAILED`, { detail: msg });
    const code = action === 'DELETE' ? 'DELETE_FAILED' : action === 'LIST' ? 'LIST_FAILED' : 'UPLOAD_FAILED';
    const error = action === 'DELETE' ? 'Delete failed' : action === 'LIST' ? 'List failed' : 'Upload failed';
    return respond(res, 500, { code, error, detail: msg });
  }
}
