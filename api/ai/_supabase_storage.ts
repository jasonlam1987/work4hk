const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
const supabaseServiceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const bucket = String(process.env.SUPABASE_STORAGE_BUCKET || 'work4hk-files').trim();

const enabled = Boolean(supabaseUrl && supabaseServiceRoleKey);

export const isSupabaseStorageEnabled = () => enabled;

const encodePath = (p: string) => String(p || '').split('/').map(encodeURIComponent).join('/');
const safeFileName = (v: string) =>
  String(v || 'file')
    .replace(/[\/\\]/g, '_')
    .replace(/[\u0000-\u001F\u007F]/g, '_')
    .trim() || 'file';
const folderSegment = (folder: string) => `f_${Buffer.from(String(folder || ''), 'utf8').toString('base64url')}`;

const baseHeaders = () => ({
  apikey: supabaseServiceRoleKey,
  Authorization: `Bearer ${supabaseServiceRoleKey}`,
});

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

export const listSupabaseStorageByPrefix = async (prefix: string) => {
  if (!enabled) throw new Error('supabase storage not configured');
  const url = `${supabaseUrl}/storage/v1/object/list/${encodePath(bucket)}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { ...baseHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prefix,
      limit: 1000,
      offset: 0,
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
    body: JSON.stringify([objectPath]),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`supabase remove failed: ${resp.status} ${detail}`);
  }
};

export const getSupabaseStorageBucket = () => bucket;
