import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ensureStorageReady, getStoragePaths } from './_storage_root.js';
import { downloadFromSupabaseStorage, isSupabaseStorageEnabled, uploadToSupabaseStorage } from './_supabase_storage.js';
import { parseUserId, parseUserName, readJsonBody, verifyRole } from './_file_store.js';

type Approval = {
  id: number;
  employer_id: number;
  employer_name?: string;
  partner_id: number;
  partner_name?: string;
  approval_number: string;
  department?: string;
  issue_date?: string;
  expiry_date?: string;
  signatory_name?: string;
  created_at?: string;
  updated_at?: string;
};

type Store = {
  items: Approval[];
  tombstones: Record<string, string>;
};

const DATA_FILE = path.join(getStoragePaths().dataDir, 'approvals.json');
const SUPABASE_OBJECT_PATH = '__approvals__/v1/approvals.json';

const json = (res: any, status: number, body: any) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

const normalizeDate = (v?: any) => {
  const s = String(v || '').trim();
  if (!s) return '';
  const base = s.includes('T') ? s.split('T')[0] : s;
  return /^\d{4}\/\d{2}\/\d{2}$/.test(base) ? base.replace(/\//g, '-') : base;
};

const normalizeApprovalNumber = (v: any) => String(v || '').trim().toUpperCase();

const normalizeItem = (raw: any): Approval | null => {
  const id = Number(raw?.id || 0);
  const employerId = Number(raw?.employer_id || 0);
  const partnerId = Number(raw?.partner_id || 0);
  const approvalNo = normalizeApprovalNumber(raw?.approval_number);
  if (!id || !employerId || !partnerId || !approvalNo) return null;
  const now = new Date().toISOString();
  return {
    id,
    employer_id: employerId,
    employer_name: raw?.employer_name ? String(raw.employer_name) : undefined,
    partner_id: partnerId,
    partner_name: raw?.partner_name ? String(raw.partner_name) : undefined,
    approval_number: approvalNo,
    department: raw?.department ? String(raw.department) : undefined,
    issue_date: raw?.issue_date ? normalizeDate(raw.issue_date) || undefined : undefined,
    expiry_date: raw?.expiry_date ? normalizeDate(raw.expiry_date) || undefined : undefined,
    signatory_name: raw?.signatory_name ? String(raw.signatory_name) : undefined,
    created_at: raw?.created_at ? String(raw.created_at) : now,
    updated_at: raw?.updated_at ? String(raw.updated_at) : now,
  };
};

const safeStore = (raw: any): Store => {
  const items: Approval[] = Array.isArray(raw?.items)
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
    items: items.sort((a, b) => String(b.approval_number || '').localeCompare(String(a.approval_number || ''))),
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

const actorInfo = (req: any) => ({
  id: parseUserId(req),
  name: parseUserName(req),
});

const allocId = () => Date.now() + Math.floor(Math.random() * 1000);

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
      return json(res, 500, { code: 'APPROVALS_READ_FAILED', error: String(e?.message || e) });
    }
  }

  if (req.method === 'POST') {
    if (!canWrite(req)) return json(res, 403, { code: 'FORBIDDEN', error: 'forbidden' });
    try {
      await ensureStorageReady();
      const body = req.body && typeof req.body === 'object' ? req.body : await readJsonBody(req);
      const action = String(body?.action || '').trim();
      const store = await loadStore();
      const cleaned = safeStore(store);
      const map = new Map<number, Approval>();
      for (const it of cleaned.items) map.set(Number(it.id || 0), it);

      if (action === 'create') {
        const actor = actorInfo(req);
        const now = new Date().toISOString();
        const incoming = normalizeItem({
          ...body?.item,
          id: allocId(),
          created_at: now,
          updated_at: now,
          updated_by: actor.id,
          updated_by_name: actor.name,
        });
        if (!incoming) return json(res, 400, { code: 'BAD_REQUEST', error: 'invalid item' });
        const key = String(incoming.approval_number || '').toLowerCase();
        const exists = cleaned.items.some((x) => String(x.approval_number || '').toLowerCase() === key);
        if (exists) return json(res, 409, { code: 'DUPLICATE', error: 'approval_number exists' });
        map.set(Number(incoming.id), incoming);
        cleaned.items = Array.from(map.values()).sort((a, b) => String(b.approval_number || '').localeCompare(String(a.approval_number || '')));
        await saveStore(cleaned);
        return json(res, 200, { ok: true, item: incoming, items: cleaned.items });
      }

      if (action === 'update') {
        const id = Number(body?.id || 0);
        if (!id) return json(res, 400, { code: 'BAD_REQUEST', error: 'id required' });
        const prev = map.get(id);
        if (!prev) return json(res, 404, { code: 'NOT_FOUND', error: 'not found' });
        const actor = actorInfo(req);
        const now = new Date().toISOString();
        const next = normalizeItem({
          ...prev,
          ...body?.patch,
          id,
          updated_at: now,
          updated_by: actor.id,
          updated_by_name: actor.name,
        });
        if (!next) return json(res, 400, { code: 'BAD_REQUEST', error: 'invalid patch' });
        map.set(id, next);
        cleaned.items = Array.from(map.values()).sort((a, b) => String(b.approval_number || '').localeCompare(String(a.approval_number || '')));
        await saveStore(cleaned);
        return json(res, 200, { ok: true, item: next, items: cleaned.items });
      }

      return json(res, 400, { code: 'BAD_REQUEST', error: 'unknown action' });
    } catch (e: any) {
      return json(res, 500, { code: 'APPROVALS_WRITE_FAILED', error: String(e?.message || e) });
    }
  }

  if (req.method === 'DELETE') {
    if (!canWrite(req)) return json(res, 403, { code: 'FORBIDDEN', error: 'forbidden' });
    try {
      const id = Number(req?.query?.id || 0);
      if (!id) return json(res, 400, { code: 'BAD_REQUEST', error: 'id required' });
      const store = await loadStore();
      const cleaned = safeStore(store);
      const now = new Date().toISOString();
      cleaned.tombstones[String(id)] = now;
      cleaned.items = cleaned.items.filter((x) => Number(x.id || 0) !== id);
      await saveStore(cleaned);
      return json(res, 200, { ok: true, items: cleaned.items });
    } catch (e: any) {
      return json(res, 500, { code: 'APPROVALS_DELETE_FAILED', error: String(e?.message || e) });
    }
  }

  return json(res, 405, { code: 'METHOD_NOT_ALLOWED', error: 'Method Not Allowed' });
}

