import { createClient } from '@supabase/supabase-js';

const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
const supabaseServiceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const bucket = String(process.env.SUPABASE_STORAGE_BUCKET || 'work4hk-files').trim();

const enabled = Boolean(supabaseUrl && supabaseServiceRoleKey);

const client = enabled
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

export const isSupabaseStorageEnabled = () => enabled;

export const getSupabaseObjectPath = (moduleName: string, ownerId: number, uid: string, fileName: string) => {
  const safeName = String(fileName || 'file').replace(/[^\w.\-]/g, '_');
  return `${moduleName}/${ownerId}/${uid}/${safeName}`;
};

export const uploadToSupabaseStorage = async (
  objectPath: string,
  bytes: Buffer,
  mimeType: string
) => {
  if (!client) throw new Error('supabase storage not configured');
  const { error } = await client.storage.from(bucket).upload(objectPath, bytes, {
    contentType: mimeType || 'application/octet-stream',
    upsert: true,
  });
  if (error) throw new Error(`supabase upload failed: ${error.message}`);
};

export const downloadFromSupabaseStorage = async (objectPath: string) => {
  if (!client) throw new Error('supabase storage not configured');
  const { data, error } = await client.storage.from(bucket).download(objectPath);
  if (error || !data) throw new Error(`supabase download failed: ${error?.message || 'not found'}`);
  const arr = await data.arrayBuffer();
  return Buffer.from(arr);
};

export const removeFromSupabaseStorage = async (objectPath: string) => {
  if (!client) return;
  const { error } = await client.storage.from(bucket).remove([objectPath]);
  if (error) throw new Error(`supabase remove failed: ${error.message}`);
};

export const getSupabaseStorageBucket = () => bucket;
