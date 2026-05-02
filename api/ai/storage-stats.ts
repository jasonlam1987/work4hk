import { getSupabaseObjectSize, isSupabaseStorageEnabled, listSupabaseStorageRecursive } from './_supabase_storage.js';

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
  const fromFile = String(process.env.FILE_STORAGE_CAPACITY_BYTES || '').trim();
  const fromSupabase = String(process.env.SUPABASE_STORAGE_CAPACITY_BYTES || '').trim();
  const raw = fromFile || fromSupabase;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return {
    value: Math.floor(n),
    source: fromFile ? 'FILE_STORAGE_CAPACITY_BYTES' : 'SUPABASE_STORAGE_CAPACITY_BYTES',
  };
};

const parseFirstMetric = (text: string, names: string[]) => {
  const lines = String(text || '').split(/\r?\n/);
  for (const name of names) {
    const re = new RegExp(`^${name}(?:\\{[^}]*\\})?\\s+([0-9.eE+-]+)$`);
    for (const line of lines) {
      const m = line.match(re);
      if (!m) continue;
      const n = Number(m[1]);
      if (Number.isFinite(n) && n >= 0) return n;
    }
  }
  return null;
};

const readSupabaseMetrics = async () => {
  const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceRoleKey) return { usedBytes: null as number | null, capacityBytes: null as number | null, fileCount: null as number | null };
  const base = supabaseUrl.replace(/\/+$/, '');
  const metricsUrl = `${base}/customer/v1/privileged/metrics`;
  const basic = Buffer.from(`service_role:${serviceRoleKey}`, 'utf8').toString('base64');
  const resp = await fetch(metricsUrl, { headers: { Authorization: `Basic ${basic}` } });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`supabase metrics failed: ${resp.status} ${detail}`);
  }
  const text = await resp.text();
  const usedBytes = parseFirstMetric(text, ['storage_size_bytes', 'storage_objects_size_bytes', 'supabase_storage_size_bytes']);
  const capacityBytes = parseFirstMetric(text, ['storage_quota_bytes', 'storage_limit_bytes', 'storage_max_bytes']);
  const fileCount = parseFirstMetric(text, ['storage_objects_total', 'storage_objects_count']);
  return { usedBytes, capacityBytes, fileCount };
};

const readSupabaseUsage = async () => {
  let usedBytes = 0;
  let fileCount = 0;
  const byModule: Record<string, number> = { employers: 0, approvals: 0, workers: 0, other: 0 };
  const warnings: string[] = [];
  for (const moduleName of MODULES) {
    try {
      const rows = await listSupabaseStorageRecursive(`${moduleName}/`);
      for (const item of rows) {
        const objectPath = String(item?.objectPath || '');
        if (!objectPath) continue;
        let size = Number((item as any)?.row?.metadata?.size || 0);
        if (!Number.isFinite(size) || size <= 0) {
          try {
            size = await getSupabaseObjectSize(objectPath);
          } catch {
            size = 0;
          }
        }
        usedBytes += Number.isFinite(size) && size > 0 ? size : 0;
        fileCount += 1;
        const top = objectPath.split('/')[0];
        if (top === 'employers' || top === 'approvals' || top === 'workers') byModule[top] += 1;
        else byModule.other += 1;
      }
    } catch (e: any) {
      warnings.push(`${moduleName}: ${String(e?.message || e || 'list_failed')}`);
    }
  }
  return { usedBytes, fileCount, byModule, warnings };
};

const readLocalUsage = async () => {
  const local = await import('./_file_store.js');
  await local.ensureDirs();
  const idx = await local.readIndex();
  const rows = Object.values(idx.records || {}).filter((r: any) => !r.deleted_at);
  const usedBytes = rows.reduce((sum: number, r: any) => sum + Math.max(0, Number(r?.size || 0)), 0);
  const byModule: Record<string, number> = { employers: 0, approvals: 0, workers: 0, other: 0 };
  for (const r of rows as any[]) {
    const mod = String(r?.module || '');
    if (mod === 'employers' || mod === 'approvals' || mod === 'workers') byModule[mod] += 1;
    else byModule.other += 1;
  }
  return { usedBytes, fileCount: rows.length, byModule };
};

const readSupabaseUsageWithMetrics = async () => {
  const usage = await readSupabaseUsage();
  let metrics: { usedBytes: number | null; capacityBytes: number | null; fileCount: number | null } = {
    usedBytes: null,
    capacityBytes: null,
    fileCount: null,
  };
  try {
    metrics = await readSupabaseMetrics();
  } catch {
    // metrics endpoint may be unavailable in some regions/plans
  }
  return {
    usedBytes: metrics.usedBytes ?? usage.usedBytes,
    fileCount: metrics.fileCount != null ? Number(metrics.fileCount) : usage.fileCount,
    byModule: usage.byModule,
    capacityBytes: metrics.capacityBytes,
    warnings: usage.warnings,
  };
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return respond(res, 405, { code: 'METHOD_NOT_ALLOWED', error: 'Method Not Allowed' });
  if (!verifyRole(req)) return respond(res, 403, { code: 'FORBIDDEN', error: 'forbidden' });

  try {
    const backend = isSupabaseStorageEnabled() ? 'supabase' : 'local';
    const usage = backend === 'supabase' ? await readSupabaseUsageWithMetrics() : await readLocalUsage();
    const cap = toCapacityBytes();
    const capacityBytes = (cap?.value ?? (backend === 'supabase' ? (usage as any).capacityBytes || null : null));
    const remainingBytes = capacityBytes ? Math.max(0, capacityBytes - usage.usedBytes) : null;
    const usageRatio = capacityBytes ? Number((usage.usedBytes / Math.max(1, capacityBytes)).toFixed(4)) : null;
    return respond(res, 200, {
      backend,
      file_count: usage.fileCount,
      by_module: usage.byModule,
      used_bytes: usage.usedBytes,
      capacity_bytes: capacityBytes,
      capacity_source: cap?.source || (backend === 'supabase' && capacityBytes ? 'SUPABASE_METRICS_API' : ''),
      remaining_bytes: remainingBytes,
      usage_ratio: usageRatio,
      max_upload_size_bytes: MAX_UPLOAD_SIZE_BYTES,
      note: capacityBytes
        ? ''
        : backend === 'supabase'
          ? '未從 Supabase 指標 API 取得總容量上限，僅顯示已使用容量。'
          : '未設定容量上限環境變量（FILE_STORAGE_CAPACITY_BYTES / SUPABASE_STORAGE_CAPACITY_BYTES），僅顯示已使用容量。',
      warnings: Array.isArray((usage as any).warnings) ? (usage as any).warnings : [],
    });
  } catch (e: any) {
    const detail = String(e?.message || e);
    console.error('[storage-stats] READ_FAILED', { detail });
    return respond(res, 500, { code: 'STORAGE_STATS_FAILED', error: 'Storage stats failed', detail });
  }
}
