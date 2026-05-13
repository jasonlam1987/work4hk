import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ensureStorageReady, getStoragePaths } from './_storage_root.js';
import { downloadFromSupabaseStorage, isSupabaseStorageEnabled, uploadToSupabaseStorage } from './_supabase_storage.js';
import { parseUserId, readJsonBody, verifyRole } from './_file_store.js';

type QuotaDetail = {
  quota_seq: string;
  quota_seq_start?: string;
  quota_seq_end?: string;
  work_location: string;
  work_locations?: string[];
  job_title: string;
  monthly_salary: number;
  work_hours: string;
  employment_months: number;
};

type Store = {
  map: Record<string, QuotaDetail[]>;
};

const DATA_FILE = path.join(getStoragePaths().dataDir, 'approval-quotas.json');
const SUPABASE_OBJECT_PATH = '__approvals__/v1/approval-quotas.json';

const json = (res: any, status: number, body: any) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

const normalizeSeq4 = (v: any) => String(v || '').replace(/[^\d]/g, '').padStart(4, '0').slice(-4);

const toNumber = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
};

const normalizeDetail = (raw: any): QuotaDetail | null => {
  const quota_seq = normalizeSeq4(raw?.quota_seq || raw?.quota_seq_start || '');
  const work_location = String(raw?.work_location || '').trim();
  const job_title = String(raw?.job_title || '').trim();
  const monthly_salary = toNumber(raw?.monthly_salary);
  const work_hours = String(raw?.work_hours || '').trim();
  const employment_months = Number(String(raw?.employment_months || '').replace(/[^\d]/g, ''));
  if (!quota_seq || !work_location || !job_title || !work_hours || !Number.isFinite(employment_months) || employment_months <= 0) return null;
  const start = raw?.quota_seq_start ? normalizeSeq4(raw.quota_seq_start) : undefined;
  const end = raw?.quota_seq_end ? normalizeSeq4(raw.quota_seq_end) : undefined;
  const work_locations = Array.isArray(raw?.work_locations)
    ? raw.work_locations.map((x: any) => String(x || '').trim()).filter(Boolean).slice(0, 3)
    : undefined;
  return {
    quota_seq,
    quota_seq_start: start || undefined,
    quota_seq_end: end || undefined,
    work_location,
    work_locations,
    job_title,
    monthly_salary,
    work_hours,
    employment_months,
  };
};

const safeStore = (raw: any): Store => {
  const mapRaw = raw?.map && typeof raw.map === 'object' ? raw.map : raw && typeof raw === 'object' ? raw : {};
  const out: Record<string, QuotaDetail[]> = {};
  for (const [k, v] of Object.entries(mapRaw || {})) {
    const list = Array.isArray(v) ? v : [];
    out[String(k)] = list.map((x: any) => normalizeDetail(x) || null).filter(Boolean) as any;
  }
  return { map: out };
};

const loadStore = async (): Promise<Store> => {
  if (isSupabaseStorageEnabled()) {
    try {
      const bytes = await downloadFromSupabaseStorage(SUPABASE_OBJECT_PATH);
      const parsed = JSON.parse(bytes.toString('utf8'));
      return safeStore(parsed);
    } catch {
      return { map: {} };
    }
  }
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return safeStore(JSON.parse(raw));
  } catch {
    return { map: {} };
  }
};

const saveStore = async (store: Store) => {
  const cleaned = safeStore(store);
  if (isSupabaseStorageEnabled()) {
    const body = Buffer.from(JSON.stringify(cleaned), 'utf8');
    await uploadToSupabaseStorage(SUPABASE_OBJECT_PATH, body, 'application/json; charset=utf-8');
    return;
  }
  await ensureStorageReady();
  await fs.writeFile(DATA_FILE, JSON.stringify(cleaned), 'utf8');
};

const canRead = (req: any) => {
  const token = String(req?.headers?.authorization || '').trim();
  const uid = parseUserId(req);
  return Boolean(token || uid);
};

const canWrite = (req: any) => verifyRole(req);

export const config = {
  runtime: 'nodejs',
};

export default async function handler(req: any, res: any) {
  if (!canRead(req)) return json(res, 401, { code: 'UNAUTHORIZED', error: 'unauthorized' });

  if (req.method === 'GET') {
    try {
      const store = await loadStore();
      const approvalId = String(req?.query?.approval_id || '').trim();
      if (approvalId) return json(res, 200, { approval_id: approvalId, items: store.map[approvalId] || [] });
      return json(res, 200, { map: store.map });
    } catch (e: any) {
      return json(res, 500, { code: 'APPROVAL_QUOTAS_READ_FAILED', error: String(e?.message || e) });
    }
  }

  if (req.method === 'POST') {
    if (!canWrite(req)) return json(res, 403, { code: 'FORBIDDEN', error: 'forbidden' });
    try {
      await ensureStorageReady();
      const body = req.body && typeof req.body === 'object' ? req.body : await readJsonBody(req);
      const approvalId = String(body?.approval_id || '').trim();
      if (!approvalId) return json(res, 400, { code: 'BAD_REQUEST', error: 'approval_id required' });
      const details = Array.isArray(body?.details) ? body.details : [];
      const normalized = details.map((x: any) => normalizeDetail(x) || null).filter(Boolean) as QuotaDetail[];
      const store = await loadStore();
      const cleaned = safeStore(store);
      cleaned.map[approvalId] = normalized;
      await saveStore(cleaned);
      return json(res, 200, { ok: true, approval_id: approvalId, items: normalized });
    } catch (e: any) {
      return json(res, 500, { code: 'APPROVAL_QUOTAS_WRITE_FAILED', error: String(e?.message || e) });
    }
  }

  return json(res, 405, { code: 'METHOD_NOT_ALLOWED', error: 'Method Not Allowed' });
}

