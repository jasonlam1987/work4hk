const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
const supabaseServiceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const bucket = String(process.env.SUPABASE_STORAGE_BUCKET || 'work4hk-files').trim();

const enabled = Boolean(supabaseUrl && supabaseServiceRoleKey);

export const isSupabaseStorageEnabled = () => enabled;

const encodePath = (p: string) => String(p || '').split('/').map(encodeURIComponent).join('/');

const baseHeaders = () => ({
  apikey: supabaseServiceRoleKey,
  Authorization: `Bearer ${supabaseServiceRoleKey}`,
});

export const getSupabaseObjectPath = (moduleName: string, ownerId: number, uid: string, fileName: string) => {
  const safeName = String(fileName || 'file').replace(/[^\w.\-]/g, '_');
  return `${moduleName}/${ownerId}/${uid}/${safeName}`;
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
