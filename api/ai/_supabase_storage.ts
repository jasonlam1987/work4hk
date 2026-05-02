const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
const supabaseServiceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const bucket = String(process.env.SUPABASE_STORAGE_BUCKET || 'work4hk-files').trim();

const enabled = Boolean(supabaseUrl && supabaseServiceRoleKey);

export const isSupabaseStorageEnabled = () => enabled;

const encodePath = (p: string) => String(p || '').split('/').map(encodeURIComponent).join('/');
const safeFileName = (v: string) => {
  const raw = String(v || 'file').trim() || 'file';
  const dot = raw.lastIndexOf('.');
  const hasExt = dot > 0 && dot < raw.length - 1;
  const base = hasExt ? raw.slice(0, dot) : raw;
  const ext = hasExt ? raw.slice(dot + 1) : '';
  const cleanPart = (s: string) =>
    String(s || '')
      .normalize('NFKD')
      .replace(/[\/\\]/g, '_')
      .replace(/[\u0000-\u001F\u007F]/g, '_')
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^[_\.-]+|[_\.-]+$/g, '');
  const safeBase = cleanPart(base) || 'file';
  const safeExt = cleanPart(ext);
  return safeExt ? `${safeBase}.${safeExt}` : safeBase;
};
const folderSegment = (folder: string) => `f_${Buffer.from(String(folder || ''), 'utf8').toString('base64url')}`;

const baseHeaders = () => ({
  apikey: supabaseServiceRoleKey,
  Authorization: `Bearer ${supabaseServiceRoleKey}`,
});

export type SupabaseStorageListRow = {
  name?: string;
  id?: string;
  metadata?: {
    size?: number;
    mimetype?: string;
  };
  created_at?: string;
};

export const getSupabaseObjectPath = (
  moduleName: string,
  ownerId: number,
  folder: string,
  uid: string,
  fileName: string
) => {
  const safeName = safeFileName(fileName);
  return `${moduleName}/${ownerId}/${folderSegment(folder)}/${uid}__${safeName}`;
};

export const getSupabaseFolderPrefix = (moduleName: string, ownerId: number, folder: string) =>
  `${moduleName}/${ownerId}/${folderSegment(folder)}/`;

export const listSupabaseStorageByPrefix = async (prefix: string, opts?: { limit?: number; offset?: number }) => {
  if (!enabled) throw new Error('supabase storage not configured');
  const limit = Math.max(1, Math.min(1000, Number(opts?.limit || 1000)));
  const offset = Math.max(0, Number(opts?.offset || 0));
  const url = `${supabaseUrl}/storage/v1/object/list/${encodePath(bucket)}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { ...baseHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prefix,
      limit,
      offset,
      sortBy: { column: 'created_at', order: 'desc' },
    }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`supabase list failed: ${resp.status} ${detail}`);
  }
  const json = await resp.json().catch(() => []);
  return Array.isArray(json) ? json : [];
};

export const listSupabaseStorageRecursive = async (rootPrefix: string) => {
  if (!enabled) throw new Error('supabase storage not configured');
  const out: Array<{ objectPath: string; row: SupabaseStorageListRow }> = [];
  const queue = [String(rootPrefix || '')];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const prefix = queue.shift() || '';
    if (visited.has(prefix)) continue;
    visited.add(prefix);
    let offset = 0;
    while (true) {
      const rows = (await listSupabaseStorageByPrefix(prefix, { limit: 1000, offset })) as SupabaseStorageListRow[];
      if (!Array.isArray(rows) || rows.length === 0) break;
      for (const row of rows) {
        const name = String(row?.name || '');
        if (!name) continue;
        const nextPath = `${prefix}${name}`;
        const isFolder = String(row?.id || '').endsWith('/');
        if (isFolder) {
          queue.push(`${nextPath}/`);
        } else {
          out.push({ objectPath: nextPath, row });
        }
      }
      if (rows.length < 1000) break;
      offset += rows.length;
    }
  }
  return out;
};

export const uploadToSupabaseStorage = async (
  objectPath: string,
  bytes: Buffer,
  mimeType: string
) => {
  if (!enabled) throw new Error('supabase storage not configured');
  const url = `${supabaseUrl}/storage/v1/object/${encodePath(bucket)}/${encodePath(objectPath)}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      ...baseHeaders(),
      'Content-Type': mimeType || 'application/octet-stream',
      'x-upsert': 'true',
    },
    body: bytes,
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`supabase upload failed: ${resp.status} ${detail}`);
  }
};

export const downloadFromSupabaseStorage = async (objectPath: string) => {
  if (!enabled) throw new Error('supabase storage not configured');
  const url = `${supabaseUrl}/storage/v1/object/${encodePath(bucket)}/${encodePath(objectPath)}`;
  const resp = await fetch(url, { headers: baseHeaders() });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`supabase download failed: ${resp.status} ${detail}`);
  }
  const arr = await resp.arrayBuffer();
  return Buffer.from(arr);
};

export const removeFromSupabaseStorage = async (objectPath: string) => {
  if (!enabled) return;
  const url = `${supabaseUrl}/storage/v1/object/${encodePath(bucket)}`;
  const resp = await fetch(url, {
    method: 'DELETE',
    headers: { ...baseHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: [objectPath] }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`supabase remove failed: ${resp.status} ${detail}`);
  }
};

export const getSupabaseStorageBucket = () => bucket;

export const getSupabaseObjectSize = async (objectPath: string) => {
  if (!enabled) throw new Error('supabase storage not configured');
  const url = `${supabaseUrl}/storage/v1/object/${encodePath(bucket)}/${encodePath(objectPath)}`;
  const resp = await fetch(url, { method: 'HEAD', headers: baseHeaders() });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`supabase head failed: ${resp.status} ${detail}`);
  }
  const len = Number(resp.headers.get('content-length') || 0);
  return Number.isFinite(len) && len > 0 ? len : 0;
};
