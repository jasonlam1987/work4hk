import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ensureStorageReady, getStoragePaths } from './_storage_root.js';
import { downloadFromSupabaseStorage, isSupabaseStorageEnabled, uploadToSupabaseStorage } from './_supabase_storage.js';
import { parseUserId, parseUserName, readJsonBody, verifyRole } from './_file_store.js';

type LabourCompany = {
  id: string;
  company_name: string;
  company_code: string;
  contact_person: string;
  labour_fee_per_person_month: number;
  insurance_fee_per_person_month: number;
  price_per_person_month?: number;
  created_at: string;
  updated_at: string;
  updated_by?: string;
  updated_by_name?: string;
};

type Store = {
  items: LabourCompany[];
  tombstones: Record<string, string>;
};

const DATA_FILE = path.join(getStoragePaths().dataDir, 'labour-companies.json');
const SUPABASE_OBJECT_PATH = '__settings__/v1/labour-companies.json';

const json = (res: any, status: number, body: any) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

const normalizePrice = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
};

const normalizeItem = (raw: any, actor?: { id?: string; name?: string }): LabourCompany | null => {
  const id = String(raw?.id || '').trim();
  if (!id) return null;
  const createdAt = String(raw?.created_at || '').trim() || new Date().toISOString();
  const updatedAt = String(raw?.updated_at || '').trim() || new Date().toISOString();
  const labourFee = normalizePrice(raw?.labour_fee_per_person_month ?? raw?.price_per_person_month);
  const insuranceFee = normalizePrice(raw?.insurance_fee_per_person_month);
  return {
    id,
    company_name: String(raw?.company_name || '').trim(),
    company_code: String(raw?.company_code || '').trim(),
    contact_person: String(raw?.contact_person || '').trim(),
    labour_fee_per_person_month: labourFee,
    insurance_fee_per_person_month: insuranceFee,
    price_per_person_month: raw?.price_per_person_month != null ? normalizePrice(raw?.price_per_person_month) : undefined,
    created_at: createdAt,
    updated_at: updatedAt,
    updated_by: actor?.id ? String(actor.id) : undefined,
    updated_by_name: actor?.name ? String(actor.name) : undefined,
  };
};

const safeStore = (raw: any): Store => {
  const items: LabourCompany[] = Array.isArray(raw?.items)
    ? raw.items
        .filter((x: any) => x && typeof x === 'object')
        .map((x: any) => normalizeItem(x) || null)
        .filter(Boolean) as any
    : Array.isArray(raw)
      ? raw
          .filter((x: any) => x && typeof x === 'object')
          .map((x: any) => normalizeItem(x) || null)
          .filter(Boolean) as any
      : [];
  const tombstones: Record<string, string> =
    raw?.tombstones && typeof raw.tombstones === 'object' ? raw.tombstones : {};
  return {
    items: items
      .filter((x) => x && typeof x === 'object' && String(x.id || '').trim())
      .sort((a, b) => Date.parse(String(b.updated_at || b.created_at || '')) - Date.parse(String(a.updated_at || a.created_at || ''))),
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
      return { items: [], tombstones: {} };
    }
  }

  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return safeStore(JSON.parse(raw));
  } catch {
    return { items: [], tombstones: {} };
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

const parseActor = (req: any) => ({
  id: parseUserId(req),
  name: parseUserName(req),
});

export const config = {
  runtime: 'nodejs',
};

export default async function handler(req: any, res: any) {
  if (!canRead(req)) return json(res, 401, { code: 'UNAUTHORIZED', error: 'unauthorized' });

  if (req.method === 'GET') {
    try {
      const store = await loadStore();
      return json(res, 200, { items: store.items });
    } catch (e: any) {
      return json(res, 500, { code: 'LABOUR_COMPANIES_READ_FAILED', error: String(e?.message || e) });
    }
  }

  if (req.method === 'POST') {
    if (!canWrite(req)) return json(res, 403, { code: 'FORBIDDEN', error: 'forbidden' });
    try {
      await ensureStorageReady();
      const body = req.body && typeof req.body === 'object' ? req.body : await readJsonBody(req);
      const action = String(body?.action || '').trim();
      const actor = parseActor(req);

      const current = await loadStore();
      const store = safeStore(current);

      if (action === 'set') {
        const incomingItems = Array.isArray(body?.items) ? body.items : [];
        const mapped = incomingItems
          .map((x: any) => normalizeItem(x, actor))
          .filter(Boolean) as LabourCompany[];
        store.items = mapped.sort((a, b) => Date.parse(b.updated_at || b.created_at) - Date.parse(a.updated_at || a.created_at));
        await saveStore(store);
        return json(res, 200, { ok: true, items: store.items });
      }

      const incoming = Array.isArray(body?.items) ? body.items : [];
      const map = new Map<string, LabourCompany>();
      for (const it of store.items) map.set(String(it.id), it);
      for (const raw of incoming) {
        const item = normalizeItem(raw, actor);
        if (!item) continue;
        const id = String(item.id);
        const tomb = store.tombstones[id];
        if (tomb) {
          const tombAt = Date.parse(String(tomb || ''));
          const incomingAt = Date.parse(String(raw?.updated_at || item.updated_at || ''));
          if (Number.isFinite(tombAt) && Number.isFinite(incomingAt) && incomingAt <= tombAt) continue;
        }
        const prev = map.get(id);
        if (!prev) {
          map.set(id, item);
          continue;
        }
        const prevAt = Date.parse(String(prev.updated_at || prev.created_at || ''));
        const nextAt = Date.parse(String(item.updated_at || item.created_at || ''));
        if (!Number.isFinite(prevAt) || !Number.isFinite(nextAt) || nextAt >= prevAt) map.set(id, item);
      }
      store.items = Array.from(map.values()).sort(
        (a, b) => Date.parse(String(b.updated_at || b.created_at || '')) - Date.parse(String(a.updated_at || a.created_at || ''))
      );
      await saveStore(store);
      return json(res, 200, { ok: true, items: store.items });
    } catch (e: any) {
      return json(res, 500, { code: 'LABOUR_COMPANIES_WRITE_FAILED', error: String(e?.message || e) });
    }
  }

  if (req.method === 'DELETE') {
    if (!canWrite(req)) return json(res, 403, { code: 'FORBIDDEN', error: 'forbidden' });
    try {
      const id = String(req?.query?.id || '').trim();
      if (!id) return json(res, 400, { code: 'BAD_REQUEST', error: 'id required' });
      const store = await loadStore();
      const cleaned = safeStore(store);
      cleaned.tombstones[id] = new Date().toISOString();
      cleaned.items = cleaned.items.filter((x) => String(x.id) !== id);
      await saveStore(cleaned);
      return json(res, 200, { ok: true, items: cleaned.items });
    } catch (e: any) {
      return json(res, 500, { code: 'LABOUR_COMPANIES_DELETE_FAILED', error: String(e?.message || e) });
    }
  }

  return json(res, 405, { code: 'METHOD_NOT_ALLOWED', error: 'Method Not Allowed' });
}

