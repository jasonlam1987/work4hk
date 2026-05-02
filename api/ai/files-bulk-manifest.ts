import { createHmac } from 'node:crypto';
import { isSupabaseStorageEnabled, listSupabaseStorageRecursive } from './_supabase_storage.js';

export const config = {
  runtime: 'nodejs',
};

const MODULES = ['employers', 'approvals', 'workers'] as const;
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
const createDownloadToken = (payload: any) => {
  const raw = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = sign(raw);
  return `${raw}.${sig}`;
};

const decodeUserSegment = (v: string) => {
  try {
    return Buffer.from(String(v || ''), 'base64url').toString('utf8');
  } catch {
    return '';
  }
};

const decodeFolder = (segment: string) => {
  const raw = String(segment || '');
  if (!raw.startsWith('f_')) return raw;
  try {
    return Buffer.from(raw.slice(2), 'base64url').toString('utf8') || raw;
  } catch {
    return raw;
  }
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

type ManifestItem = {
  uid: string;
  module: string;
  owner_id: number;
  folder: string;
  original_name: string;
  mime_type: string;
  size: number;
  created_at: string;
  uploader_id?: string;
  uploader_name?: string;
  download_url: string;
};

const readSupabaseManifest = async () => {
  const out: ManifestItem[] = [];
  for (const moduleName of MODULES) {
    const rows = await listSupabaseStorageRecursive(`${moduleName}/`);
    for (const rowWrap of rows) {
      const row = rowWrap?.row as any;
      const objectPath = String(rowWrap?.objectPath || '');
      if (!objectPath) continue;
      const parts = objectPath.split('/');
      if (parts.length < 4) continue;
      const ownerId = Number(parts[1] || 0);
      const folder = decodeFolder(parts[2] || '');
      const nameRaw = parts.slice(3).join('/');
      const parsedName = parseObjectName(nameRaw);
      const mimeType = String(row?.metadata?.mimetype || 'application/octet-stream');
      const size = Number(row?.metadata?.size || 0);
      const createdAt = String(row?.created_at || new Date().toISOString());
      const token = createDownloadToken({
        uid: parsedName.uid,
        object_path: objectPath,
        mime_type: mimeType,
        original_name: parsedName.originalName,
        exp: Math.floor(Date.now() / 1000) + 10 * 60,
      });
      out.push({
        uid: parsedName.uid,
        module: moduleName,
        owner_id: ownerId,
        folder,
        original_name: parsedName.originalName,
        mime_type: mimeType,
        size: Number.isFinite(size) ? size : 0,
        created_at: createdAt,
        uploader_id: parsedName.uploaderId || '',
        uploader_name: parsedName.uploaderName || '',
        download_url: `/api/ai/files-download?t=${encodeURIComponent(token)}`,
      });
    }
  }
  return out.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
};

const readLocalManifest = async () => {
  const local = await import('./_file_store.js');
  await local.ensureDirs();
  const idx = await local.readIndex();
  const rows = Object.values(idx.records || {})
    .filter((r: any) => !r.deleted_at)
    .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)));
  return rows.map((r: any) => {
    const token = local.createOneTimeToken(r.uid);
    return {
      uid: r.uid,
      module: r.module,
      owner_id: Number(r.owner_id || 0),
      folder: String(r.folder || ''),
      original_name: String(r.original_name || ''),
      mime_type: String(r.mime_type || 'application/octet-stream'),
      size: Number(r.size || 0),
      created_at: String(r.created_at || new Date().toISOString()),
      uploader_id: String(r.uploader_id || ''),
      uploader_name: String(r.uploader_name || ''),
      download_url: `/api/ai/files-download?uid=${encodeURIComponent(r.uid)}&token=${encodeURIComponent(token)}`,
    } as ManifestItem;
  });
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return respond(res, 405, { code: 'METHOD_NOT_ALLOWED', error: 'Method Not Allowed' });
  if (!verifyRole(req)) return respond(res, 403, { code: 'FORBIDDEN', error: 'forbidden' });
  try {
    const backend = isSupabaseStorageEnabled() ? 'supabase' : 'local';
    const items = backend === 'supabase' ? await readSupabaseManifest() : await readLocalManifest();
    return respond(res, 200, {
      backend,
      total: items.length,
      items,
    });
  } catch (e: any) {
    const detail = String(e?.message || e);
    console.error('[files-bulk-manifest] READ_FAILED', { detail });
    return respond(res, 500, { code: 'FILES_BULK_MANIFEST_FAILED', error: 'Files manifest failed', detail });
  }
}
