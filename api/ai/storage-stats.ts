import { isSupabaseStorageEnabled, listSupabaseStorageByPrefix } from './_supabase_storage.js';

export const config = {
  runtime: 'nodejs',
};

const MODULES = ['employers', 'approvals', 'workers'] as const;
const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

const respond = (res: any, status: number, body: any) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

const verifyRole = (req: any) => {
  const role = String(req?.headers?.['x-user-role'] || '').toLowerCase();
  return role.includes('admin') || role.includes('manager');
};

const toCapacityBytes = () => {
  const raw = String(process.env.FILE_STORAGE_CAPACITY_BYTES || process.env.SUPABASE_STORAGE_CAPACITY_BYTES || '').trim();
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
};

const readSupabaseUsage = async () => {
  let usedBytes = 0;
  let fileCount = 0;
  for (const moduleName of MODULES) {
    let offset = 0;
    while (true) {
      const rows = await listSupabaseStorageByPrefix(`${moduleName}/`, { limit: 1000, offset });
      if (!Array.isArray(rows) || rows.length === 0) break;
      for (const row of rows) {
        if (!row || String(row?.id || '').endsWith('/')) continue;
        const size = Number(row?.metadata?.size || 0);
        usedBytes += Number.isFinite(size) && size > 0 ? size : 0;
        fileCount += 1;
      }
      if (rows.length < 1000) break;
      offset += rows.length;
    }
  }
  return { usedBytes, fileCount };
};

const readLocalUsage = async () => {
  const local = await import('./_file_store.js');
  await local.ensureDirs();
  const idx = await local.readIndex();
  const rows = Object.values(idx.records || {}).filter((r: any) => !r.deleted_at);
  const usedBytes = rows.reduce((sum: number, r: any) => sum + Math.max(0, Number(r?.size || 0)), 0);
  return { usedBytes, fileCount: rows.length };
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return respond(res, 405, { code: 'METHOD_NOT_ALLOWED', error: 'Method Not Allowed' });
  if (!verifyRole(req)) return respond(res, 403, { code: 'FORBIDDEN', error: 'forbidden' });

  try {
    const backend = isSupabaseStorageEnabled() ? 'supabase' : 'local';
    const usage = backend === 'supabase' ? await readSupabaseUsage() : await readLocalUsage();
    const capacityBytes = toCapacityBytes();
    const remainingBytes = capacityBytes ? Math.max(0, capacityBytes - usage.usedBytes) : null;
    const usageRatio = capacityBytes ? Number((usage.usedBytes / Math.max(1, capacityBytes)).toFixed(4)) : null;
    return respond(res, 200, {
      backend,
      file_count: usage.fileCount,
      used_bytes: usage.usedBytes,
      capacity_bytes: capacityBytes,
      remaining_bytes: remainingBytes,
      usage_ratio: usageRatio,
      max_upload_size_bytes: MAX_UPLOAD_SIZE_BYTES,
      note: capacityBytes
        ? ''
        : '未設定容量上限環境變量（FILE_STORAGE_CAPACITY_BYTES / SUPABASE_STORAGE_CAPACITY_BYTES），僅顯示已使用容量。',
    });
  } catch (e: any) {
    const detail = String(e?.message || e);
    console.error('[storage-stats] READ_FAILED', { detail });
    return respond(res, 500, { code: 'STORAGE_STATS_FAILED', error: 'Storage stats failed', detail });
  }
}

