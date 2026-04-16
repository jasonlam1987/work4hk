import { createHash, createHmac, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const MAX_SIZE = 10 * 1024 * 1024;
export const ALLOWED = new Set(['application/pdf', 'image/jpeg', 'image/png']);
export const ROOT = '/tmp/work4hk_files';
export const TMP_DIR = path.join(ROOT, 'tmp');
export const DATA_DIR = path.join(ROOT, 'data');
export const INDEX_FILE = path.join(ROOT, 'index.json');
const TOKEN_SECRET = process.env.FILE_TOKEN_SECRET || 'work4hk-file-secret';
const TOKEN_TTL_SEC = 10 * 60;

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
  created_at: string;
  deleted_at?: string;
};

export type FileIndex = {
  records: Record<string, FileRecord>;
  used_tokens: Record<string, string>;
};

export const ensureDirs = async () => {
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
    };
  } catch {
    return { records: {}, used_tokens: {} };
  }
};

export const writeIndex = async (idx: FileIndex) => {
  await fs.writeFile(INDEX_FILE, JSON.stringify(idx), 'utf8');
};

export const respond = (res: any, status: number, body: any) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

export const verifyRole = (req: any) => {
  const role = String(req?.headers?.['x-user-role'] || '').toLowerCase();
  return ['admin', 'super_admin', 'manager'].includes(role);
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

export const storeFileFromDataUrl = async (body: any) => {
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
  await fs.rename(tmpPath, finalPath);

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
    stored_path: finalPath,
    created_at: new Date().toISOString(),
  };
  return rec;
};
