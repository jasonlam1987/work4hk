import { createHash, createHmac, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ensureStorageReady, getStoragePaths } from './_storage_root.js';
import {
  getSupabaseObjectPath,
  isSupabaseStorageEnabled,
  removeFromSupabaseStorage,
  uploadToSupabaseStorage,
} from './_supabase_storage.js';

export const MAX_SIZE = 10 * 1024 * 1024;
export const ALLOWED = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const STORAGE_PATHS = getStoragePaths();
export const ROOT = STORAGE_PATHS.root;
export const TMP_DIR = STORAGE_PATHS.tmpDir;
export const DATA_DIR = STORAGE_PATHS.dataDir;
export const INDEX_FILE = STORAGE_PATHS.indexFile;
export const DELETE_CONFIRM_TEXT = 'DELETE';
const TOKEN_SECRET = process.env.FILE_TOKEN_SECRET || 'work4hk-file-secret';
const TOKEN_TTL_SEC = 10 * 60;
const LOG_KEEP_DAYS = 30;

export type FileRecord = {
  uid: string;
  module: 'employers' | 'approvals' | 'workers';
  owner_id: number;
  folder: string;
  original_name: string;
  mime_type: string;
  size: number;
  sha256: string;
  stored_name: string;
  stored_path: string;
  storage_backend?: 'local' | 'supabase';
  storage_object_path?: string;
  uploader_id?: string;
  uploader_name?: string;
  created_at: string;
  deleted_at?: string;
};

export type FileIndex = {
  records: Record<string, FileRecord>;
  used_tokens: Record<string, string>;
  delete_requests: Record<string, FileDeleteRequest>;
  audit_logs: FileAuditLog[];
};

export type DeleteRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type FileDeleteRequest = {
  request_id: string;
  uid: string;
  module: FileRecord['module'];
  owner_id: number;
  folder: string;
  section_name?: string;
  company_name?: string;
  request_type?: 'DELETE_ATTACHMENT';
  original_name: string;
  stored_path: string;
  storage_object_path?: string;
  reason: string;
  status: DeleteRequestStatus;
  requester_id: string;
  requester_account?: string;
  requester_name: string;
  reviewer_id?: string;
  reviewer_name?: string;
  reject_reason?: string;
  created_at: string;
  reviewed_at?: string;
};

export type FileAuditLog = {
  id: string;
  event:
    | 'DELETE_REQUEST_CREATED'
    | 'DELETE_REQUEST_APPROVED'
    | 'DELETE_REQUEST_REJECTED'
    | 'FILE_PHYSICALLY_DELETED'
    | 'FILE_DELETE_FAILED';
  operator_id: string;
  operator_name: string;
  uid: string;
  request_id?: string;
  original_path: string;
  ip: string;
  user_agent: string;
  created_at: string;
  detail?: string;
};

export const ensureDirs = async () => {
  await ensureStorageReady();
  await fs.mkdir(ROOT, { recursive: true });
  await fs.mkdir(TMP_DIR, { recursive: true });
  await fs.mkdir(DATA_DIR, { recursive: true });
};

export const readJsonBody = async (req: any) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
};

export const readIndex = async (): Promise<FileIndex> => {
  try {
    const raw = await fs.readFile(INDEX_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      records: parsed?.records && typeof parsed.records === 'object' ? parsed.records : {},
      used_tokens: parsed?.used_tokens && typeof parsed.used_tokens === 'object' ? parsed.used_tokens : {},
      delete_requests: parsed?.delete_requests && typeof parsed.delete_requests === 'object' ? parsed.delete_requests : {},
      audit_logs: Array.isArray(parsed?.audit_logs) ? parsed.audit_logs : [],
    };
  } catch {
    return { records: {}, used_tokens: {}, delete_requests: {}, audit_logs: [] };
  }
};

export const writeIndex = async (idx: FileIndex) => {
  const now = Date.now();
  idx.audit_logs = (idx.audit_logs || []).filter((item) => {
    const t = Date.parse(String(item?.created_at || ''));
    if (!Number.isFinite(t)) return false;
    return now - t <= LOG_KEEP_DAYS * 24 * 60 * 60 * 1000;
  });
  await fs.writeFile(INDEX_FILE, JSON.stringify(idx), 'utf8');
};

export const respond = (res: any, status: number, body: any) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

export const verifyRole = (req: any) => {
  const roleRaw = String(req?.headers?.['x-user-role'] || '').trim().toLowerCase();
  const role = roleRaw.replace(/[\s-]+/g, '_');
  const auth = String(req?.headers?.authorization || '').trim().toLowerCase();
  if (!role) return auth.startsWith('bearer ');
  if (role.includes('admin') || role.includes('manager')) return true;
  if (['system_admin', 'administrator', '系統管理員', '系统管理员', '管理員', '管理员'].includes(roleRaw)) return true;
  return false;
};

export const parseRole = (req: any) => String(req?.headers?.['x-user-role'] || '').trim().toLowerCase();
export const parseUserId = (req: any) => String(req?.headers?.['x-user-id'] || '').trim() || 'unknown';
export const parseUserName = (req: any) => String(req?.headers?.['x-user-name'] || '').trim() || 'unknown';
export const parseIp = (req: any) =>
  String(req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || '')
    .split(',')[0]
    .trim() || 'unknown';
export const parseUserAgent = (req: any) => String(req?.headers?.['user-agent'] || '').trim() || 'unknown';

export const isSuperAdminRole = (roleRaw: string) => {
  const role = String(roleRaw || '').toLowerCase();
  return (
    role.includes('super_admin') ||
    role.includes('superadmin') ||
    role.includes('root') ||
    role.includes('超級管理員') ||
    role.includes('超级管理员')
  );
};

export const verifySuperAdmin = (req: any) => isSuperAdminRole(parseRole(req));

export const verifyCsrf = (req: any) => {
  const tokenHeader = String(req?.headers?.['x-csrf-token'] || '').trim();
  const cookieRaw = String(req?.headers?.cookie || '');
  const match = cookieRaw.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  const cookieToken = match?.[1] ? decodeURIComponent(match[1]) : '';
  return Boolean(tokenHeader && cookieToken && tokenHeader === cookieToken);
};

export const issueCsrfToken = () => randomUUID().replace(/-/g, '');

export const appendAuditLog = (idx: FileIndex, log: Omit<FileAuditLog, 'id' | 'created_at'>) => {
  idx.audit_logs = idx.audit_logs || [];
  idx.audit_logs.push({
    id: randomUUID(),
    created_at: new Date().toISOString(),
    ...log,
  });
};

export const createDeleteRequestRecord = (input: {
  rec: FileRecord;
  reason: string;
  requester_id: string;
  requester_account?: string;
  requester_name: string;
  company_name?: string;
  section_name?: string;
}) => {
  const requestId = randomUUID();
  const out: FileDeleteRequest = {
    request_id: requestId,
    uid: input.rec.uid,
    module: input.rec.module,
    owner_id: input.rec.owner_id,
    folder: input.rec.folder,
    section_name: input.section_name || input.rec.folder,
    company_name: input.company_name || '',
    request_type: 'DELETE_ATTACHMENT',
    original_name: input.rec.original_name,
    stored_path: input.rec.stored_path,
    storage_object_path: input.rec.storage_object_path,
    reason: input.reason,
    status: 'PENDING',
    requester_id: input.requester_id,
    requester_account: input.requester_account || input.requester_id,
    requester_name: input.requester_name,
    created_at: new Date().toISOString(),
  };
  return out;
};

const safeUnlink = async (p: string) => {
  try {
    await fs.unlink(p);
  } catch {
    // ignore
  }
};

export const deletePhysicalFileAndArtifacts = async (rec: FileRecord) => {
  if (rec.storage_backend === 'supabase' && rec.storage_object_path) {
    await removeFromSupabaseStorage(rec.storage_object_path).catch(() => undefined);
    return;
  }
  await safeUnlink(rec.stored_path);
  const tmpCandidates = [
    path.join(TMP_DIR, `${rec.uid}.tmp`),
    path.join(TMP_DIR, rec.stored_name),
  ];
  for (const p of tmpCandidates) await safeUnlink(p);
};

const sign = (payload: string) => createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');

export const createOneTimeToken = (uid: string) => {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC;
  const nonce = randomUUID().replace(/-/g, '');
  const payload = `${uid}.${exp}.${nonce}`;
  const sig = sign(payload);
  return `${payload}.${sig}`;
};

export const verifyOneTimeToken = (uid: string, token: string, usedTokens: Record<string, string>) => {
  if (!token) return { ok: false as const, reason: 'missing token' };
  if (usedTokens[token]) return { ok: false as const, reason: 'token already used' };
  const parts = token.split('.');
  if (parts.length !== 4) return { ok: false as const, reason: 'invalid token format' };
  const [tUid, expRaw, nonce, sig] = parts;
  if (tUid !== uid) return { ok: false as const, reason: 'token uid mismatch' };
  const exp = Number(expRaw);
  if (!Number.isFinite(exp)) return { ok: false as const, reason: 'invalid token exp' };
  if (Math.floor(Date.now() / 1000) > exp) return { ok: false as const, reason: 'token expired' };
  const payload = `${tUid}.${exp}.${nonce}`;
  if (sign(payload) !== sig) return { ok: false as const, reason: 'invalid token signature' };
  return { ok: true as const };
};

export const storeFileFromDataUrl = async (
  body: any,
  actor?: { user_id?: string; user_name?: string }
) => {
  const moduleName = String(body?.module || '').trim() as 'employers' | 'approvals' | 'workers';
  const ownerId = Number(body?.owner_id || 0);
  const folder = String(body?.folder || '').trim();
  const fileName = String(body?.file_name || '').trim();
  const mimeType = String(body?.mime_type || '').trim();
  const dataUrl = String(body?.data_url || '').trim();

  if (!moduleName || !['employers', 'approvals', 'workers'].includes(moduleName)) throw new Error('invalid module');
  if (!ownerId || ownerId < 1) throw new Error('invalid owner_id');
  if (!folder || !fileName || !mimeType || !dataUrl.startsWith('data:')) throw new Error('invalid payload');
  if (!ALLOWED.has(mimeType)) throw new Error('unsupported file type');

  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : '';
  if (!base64) throw new Error('invalid file data');
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > MAX_SIZE) throw new Error('file too large');

  const uid = randomUUID();
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const ext = mimeType === 'application/pdf' ? '.pdf' : mimeType === 'image/png' ? '.png' : '.jpg';
  const tmpName = `${uid}.tmp`;
  const storedName = `${uid}-${sha256.slice(0, 12)}${ext}`;
  const tmpPath = path.join(TMP_DIR, tmpName);
  const finalPath = path.join(DATA_DIR, storedName);

  await fs.writeFile(tmpPath, bytes);
  const stat = await fs.stat(tmpPath);
  if (stat.size !== bytes.length) {
    await fs.unlink(tmpPath).catch(() => undefined);
    throw new Error('temp file verify failed');
  }
  const useSupabase = isSupabaseStorageEnabled();
  const objectPath = useSupabase ? getSupabaseObjectPath(moduleName, ownerId, folder, uid, fileName) : '';
  if (useSupabase) {
    await uploadToSupabaseStorage(objectPath, bytes, mimeType);
    await fs.unlink(tmpPath).catch(() => undefined);
  } else {
    await fs.rename(tmpPath, finalPath);
  }

  const rec: FileRecord = {
    uid,
    module: moduleName,
    owner_id: ownerId,
    folder,
    original_name: fileName,
    mime_type: mimeType,
    size: bytes.length,
    sha256,
    stored_name: storedName,
    stored_path: useSupabase ? `supabase://${objectPath}` : finalPath,
    storage_backend: useSupabase ? 'supabase' : 'local',
    storage_object_path: useSupabase ? objectPath : undefined,
    uploader_id: String(actor?.user_id || '').trim() || undefined,
    uploader_name: String(actor?.user_name || '').trim() || undefined,
    created_at: new Date().toISOString(),
  };
  return rec;
};
