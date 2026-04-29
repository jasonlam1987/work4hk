import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensureStorageReady, getStoragePaths } from './_storage_root.js';
import {
  downloadFromSupabaseStorage,
  isSupabaseStorageEnabled,
  uploadToSupabaseStorage,
} from './_supabase_storage.js';
import { isSuperAdminRole, parseRole, parseUserId, readJsonBody } from './_file_store.js';

type AuditLog = {
  id: string;
  at: string;
  module: string;
  action: string;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  record_id?: string;
  record_no?: string;
  section?: string;
  details?: string;
};

const DATA_FILE = path.join(getStoragePaths().dataDir, 'global-audit-logs.json');
const SUPABASE_OBJECT_PATH = '__system_audit__/v1/global-audit-logs.json';
const MAX_KEEP = 5000;

const json = (res: any, status: number, body: any) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

const safeArray = (raw: any): AuditLog[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x === 'object')
    .map((x: any) => ({
      id: String(x.id || randomUUID()),
      at: String(x.at || new Date().toISOString()),
      module: String(x.module || ''),
      action: String(x.action || ''),
      actor_id: String(x.actor_id || ''),
      actor_name: String(x.actor_name || ''),
      actor_role: String(x.actor_role || ''),
      record_id: x.record_id ? String(x.record_id) : undefined,
      record_no: x.record_no ? String(x.record_no) : undefined,
      section: x.section ? String(x.section) : undefined,
      details: x.details ? String(x.details) : undefined,
    }));
};

const loadLogs = async (): Promise<AuditLog[]> => {
  if (isSupabaseStorageEnabled()) {
    try {
      const bytes = await downloadFromSupabaseStorage(SUPABASE_OBJECT_PATH);
      const parsed = JSON.parse(bytes.toString('utf8'));
      return safeArray(parsed);
    } catch {
      return [];
    }
  }

  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return safeArray(JSON.parse(raw));
  } catch {
    return [];
  }
};

const saveLogs = async (logs: AuditLog[]) => {
  const cleaned = safeArray(logs)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, MAX_KEEP);

  if (isSupabaseStorageEnabled()) {
    const body = Buffer.from(JSON.stringify(cleaned), 'utf8');
    await uploadToSupabaseStorage(SUPABASE_OBJECT_PATH, body, 'application/json; charset=utf-8');
    return;
  }

  await ensureStorageReady();
  await fs.writeFile(DATA_FILE, JSON.stringify(cleaned), 'utf8');
};

const canAppend = (req: any) => {
  const token = String(req?.headers?.authorization || '').trim();
  const uid = parseUserId(req);
  return Boolean(token || uid);
};

export const config = {
  runtime: 'nodejs',
};

export default async function handler(req: any, res: any) {
  if (req.method === 'GET') {
    const role = parseRole(req);
    if (!isSuperAdminRole(role)) return json(res, 403, { code: 'FORBIDDEN', error: 'forbidden' });
    try {
      const items = await loadLogs();
      return json(res, 200, { items });
    } catch (e: any) {
      return json(res, 500, { code: 'AUDIT_READ_FAILED', error: String(e?.message || e) });
    }
  }

  if (req.method === 'POST') {
    if (!canAppend(req)) return json(res, 401, { code: 'UNAUTHORIZED', error: 'unauthorized' });
    try {
      await ensureStorageReady();
      const body = req.body && typeof req.body === 'object' ? req.body : await readJsonBody(req);
      const incoming = safeArray(body?.items);
      if (!incoming.length) return json(res, 200, { ok: true, appended: 0 });
      const current = await loadLogs();
      await saveLogs([...incoming, ...current]);
      return json(res, 200, { ok: true, appended: incoming.length });
    } catch (e: any) {
      return json(res, 500, { code: 'AUDIT_APPEND_FAILED', error: String(e?.message || e) });
    }
  }

  return json(res, 405, { code: 'METHOD_NOT_ALLOWED', error: 'Method Not Allowed' });
}
