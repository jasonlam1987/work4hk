import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ensureStorageReady, getStoragePaths } from './_storage_root.js';
import { downloadFromSupabaseStorage, isSupabaseStorageEnabled, uploadToSupabaseStorage } from './_supabase_storage.js';
import { parseUserId, readJsonBody } from './_file_store.js';

type FinanceRecord = {
  worker_id: number;
  worker_name: string;
  labour_status: string;
  on_duty_date?: string;
  labour_company_id?: string;
  labour_company_name?: string;
  cost_visa_fee: number;
  cost_labour_fee: number;
  cost_insurance_fee: number;
  cost_third_party_service_fee: number;
  income_labour_fee: number;
  income_agency_fee: number;
  actual_profit: number;
  updated_at: string;
  updated_by?: string;
  updated_by_name?: string;
};

type Store = {
  records: FinanceRecord[];
  tombstones: Record<string, string>;
};

const DATA_FILE = path.join(getStoragePaths().dataDir, 'finance-records.json');
const SUPABASE_OBJECT_PATH = '__finance__/v1/finance-records.json';

const json = (res: any, status: number, body: any) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

const toNumber = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
};

const normalizeRecord = (row: any, actor?: { id?: string; name?: string }): FinanceRecord | null => {
  const workerId = Number(row?.worker_id || 0);
  if (!workerId) return null;
  const costVisa = toNumber(row?.cost_visa_fee);
  const costLabour = toNumber(row?.cost_labour_fee);
  const costInsurance = toNumber(row?.cost_insurance_fee);
  const costThirdParty = toNumber(row?.cost_third_party_service_fee);
  const incomeLabour = toNumber(row?.income_labour_fee);
  const incomeAgency = toNumber(row?.income_agency_fee);
  const totalCost = costVisa + costLabour + costInsurance + costThirdParty;
  const totalIncome = incomeLabour + incomeAgency;
  return {
    worker_id: workerId,
    worker_name: String(row?.worker_name || '').trim(),
    labour_status: String(row?.labour_status || '').trim(),
    on_duty_date: String(row?.on_duty_date || '').trim() || undefined,
    labour_company_id: String(row?.labour_company_id || '').trim() || undefined,
    labour_company_name: String(row?.labour_company_name || '').trim() || undefined,
    cost_visa_fee: costVisa,
    cost_labour_fee: costLabour,
    cost_insurance_fee: costInsurance,
    cost_third_party_service_fee: costThirdParty,
    income_labour_fee: incomeLabour,
    income_agency_fee: incomeAgency,
    actual_profit: totalIncome - totalCost,
    updated_at: new Date().toISOString(),
    updated_by: actor?.id ? String(actor.id) : undefined,
    updated_by_name: actor?.name ? String(actor.name) : undefined,
  };
};

const safeStore = (raw: any): Store => {
  const records: FinanceRecord[] = Array.isArray(raw?.records)
    ? raw.records
        .filter((x: any) => x && typeof x === 'object')
        .map((x: any) => normalizeRecord(x) || null)
        .filter(Boolean) as any
    : [];
  const tombstones: Record<string, string> =
    raw?.tombstones && typeof raw.tombstones === 'object' ? raw.tombstones : {};
  return {
    records: records
      .filter((x) => Number(x.worker_id || 0) > 0)
      .sort((a, b) => Date.parse(String(b.updated_at || '')) - Date.parse(String(a.updated_at || ''))),
    tombstones,
  };
};

const loadStore = async (): Promise<Store> => {
  if (isSupabaseStorageEnabled()) {
    try {
      const bytes = await downloadFromSupabaseStorage(SUPABASE_OBJECT_PATH);
      const parsed = JSON.parse(bytes.toString('utf8'));
      return safeStore(parsed);
    } catch {
      return { records: [], tombstones: {} };
    }
  }

  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return safeStore(JSON.parse(raw));
  } catch {
    return { records: [], tombstones: {} };
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

const canAccess = (req: any) => {
  const token = String(req?.headers?.authorization || '').trim();
  const uid = parseUserId(req);
  return Boolean(token || uid);
};

const parseActor = (req: any) => {
  const id = parseUserId(req) || '';
  const nameRaw = String(req?.headers?.['x-user-name'] || '').trim();
  const name = nameRaw ? decodeURIComponent(nameRaw) : '';
  return { id, name };
};

const mergeUpserts = (current: Store, incoming: any[], actor: { id?: string; name?: string }) => {
  const store = safeStore(current);
  const map = new Map<number, FinanceRecord>();
  for (const r of store.records) map.set(Number(r.worker_id || 0), r);

  for (const raw of Array.isArray(incoming) ? incoming : []) {
    const rec = normalizeRecord(raw, actor);
    if (!rec) continue;
    const wid = Number(rec.worker_id);
    const tomb = store.tombstones[String(wid)];
    if (tomb) {
      const tombAt = Date.parse(String(tomb || ''));
      const incomingAt = Date.parse(String(raw?.updated_at || ''));
      if (Number.isFinite(tombAt) && Number.isFinite(incomingAt) && incomingAt <= tombAt) {
        continue;
      }
    }
    map.set(wid, rec);
  }

  store.records = Array.from(map.values()).sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  return store;
};

export const config = {
  runtime: 'nodejs',
};

export default async function handler(req: any, res: any) {
  if (!canAccess(req)) return json(res, 401, { code: 'UNAUTHORIZED', error: 'unauthorized' });

  if (req.method === 'GET') {
    try {
      const store = await loadStore();
      return json(res, 200, { items: store.records });
    } catch (e: any) {
      return json(res, 500, { code: 'FINANCE_READ_FAILED', error: String(e?.message || e) });
    }
  }

  if (req.method === 'POST') {
    try {
      await ensureStorageReady();
      const body = req.body && typeof req.body === 'object' ? req.body : await readJsonBody(req);
      const actor = parseActor(req);
      const action = String(body?.action || '').trim();

      const current = await loadStore();
      const incoming =
        action === 'upsert' && body?.record
          ? [body.record]
          : Array.isArray(body?.records)
            ? body.records
            : Array.isArray(body?.items)
              ? body.items
              : [];

      const next = mergeUpserts(current, incoming, actor);
      await saveStore(next);

      if (action === 'upsert' && body?.record) {
        const wid = Number(body?.record?.worker_id || 0);
        const item = next.records.find((x) => Number(x.worker_id || 0) === wid) || null;
        return json(res, 200, { ok: true, item, items: next.records });
      }
      return json(res, 200, { ok: true, items: next.records });
    } catch (e: any) {
      return json(res, 500, { code: 'FINANCE_UPSERT_FAILED', error: String(e?.message || e) });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const workerId = Number(req?.query?.worker_id || req?.query?.workerId || 0);
      if (!workerId) return json(res, 400, { code: 'BAD_REQUEST', error: 'worker_id required' });
      const store = await loadStore();
      const cleaned = safeStore(store);
      const now = new Date().toISOString();
      cleaned.tombstones[String(workerId)] = now;
      cleaned.records = cleaned.records.filter((x) => Number(x.worker_id || 0) !== workerId);
      await saveStore(cleaned);
      return json(res, 200, { ok: true, items: cleaned.records });
    } catch (e: any) {
      return json(res, 500, { code: 'FINANCE_DELETE_FAILED', error: String(e?.message || e) });
    }
  }

  return json(res, 405, { code: 'METHOD_NOT_ALLOWED', error: 'Method Not Allowed' });
}

