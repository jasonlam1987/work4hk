import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { ensureStorageReady, getStoragePaths } from '../ai/_storage_root.js';

export const BACKEND_ORIGIN = String(process.env.AUTH_BACKEND_ORIGIN || 'http://119.91.50.192').trim();
export const DEFAULT_LIMIT = 2000;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const SELF_REGISTER_ROLE = String(process.env.AUTH_SELF_REGISTER_ROLE || 'employee').trim() || 'employee';

const FLOWS_FILE = path.join(getStoragePaths().dataDir, 'auth-email-flows.json');
const OUTBOX_DIR = path.join(getStoragePaths().dataDir, 'auth-outbox');

export type AuthFlowPurpose = 'register' | 'reset';

export type AuthFlowRecord = {
  id: string;
  purpose: AuthFlowPurpose;
  email: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  used_at?: string;
};

type FlowStore = {
  records: AuthFlowRecord[];
};

export type UpstreamUser = {
  id: string | number;
  username?: string;
  email?: string;
  mail?: string;
  role_key?: string;
  is_active?: number | string;
};

type MailSendResult =
  | { mode: 'smtp' }
  | { mode: 'file'; previewFile: string };

let cachedTransporter: nodemailer.Transporter | null = null;

export const config = {
  runtime: 'nodejs',
};

export const json = (res: any, status: number, body: any) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

export const readBody = async (req: any) => {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve) => {
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve());
  });
  try {
    const raw = Buffer.concat(chunks).toString('utf-8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();

export const isValidEmail = (value: string) => EMAIL_RE.test(normalizeEmail(value));

export const isStrongPassword = (value: string) => {
  if (value.length < 8) return false;
  if (!/[a-z]/i.test(value)) return false;
  if (!/\d/.test(value)) return false;
  return true;
};

export const getAppBaseUrl = () =>
  String(process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || 'http://127.0.0.1:5181').trim();

export const maskEmail = (email: string) => {
  const normalized = normalizeEmail(email);
  const [local, domain] = normalized.split('@');
  if (!local || !domain) return normalized;
  const left = local.slice(0, 2);
  return `${left}${'*'.repeat(Math.max(2, local.length - left.length))}@${domain}`;
};

const escapeHtml = (value: string) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const readFlows = async (): Promise<FlowStore> => {
  try {
    await ensureStorageReady();
    const raw = await fs.readFile(FLOWS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const records = Array.isArray(parsed?.records) ? parsed.records : [];
    return {
      records: records
        .filter((item: any) => item && typeof item === 'object')
        .map((item: any) => ({
          id: String(item.id || ''),
          purpose: item.purpose === 'reset' ? 'reset' : 'register',
          email: normalizeEmail(item.email),
          token_hash: String(item.token_hash || ''),
          created_at: String(item.created_at || new Date().toISOString()),
          expires_at: String(item.expires_at || new Date().toISOString()),
          used_at: item.used_at ? String(item.used_at) : undefined,
        })),
    };
  } catch {
    return { records: [] };
  }
};

const writeFlows = async (store: FlowStore) => {
  await ensureStorageReady();
  const now = Date.now();
  const records = (store.records || []).filter((item) => {
    const exp = Date.parse(String(item.expires_at || ''));
    if (!Number.isFinite(exp)) return false;
    if (item.used_at) return now - exp <= 7 * 24 * 60 * 60 * 1000;
    return exp >= now - 24 * 60 * 60 * 1000;
  });
  await fs.writeFile(FLOWS_FILE, JSON.stringify({ records }, null, 2), 'utf8');
};

export const createAuthFlow = async (purpose: AuthFlowPurpose, email: string) => {
  const store = await readFlows();
  const normalizedEmail = normalizeEmail(email);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
  const token = randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);

  const records = (store.records || []).map((item) =>
    item.purpose === purpose && item.email === normalizedEmail && !item.used_at
      ? { ...item, used_at: now.toISOString() }
      : item
  );

  const record: AuthFlowRecord = {
    id: randomBytes(16).toString('hex'),
    purpose,
    email: normalizedEmail,
    token_hash: tokenHash,
    created_at: now.toISOString(),
    expires_at: expiresAt,
  };

  records.unshift(record);
  await writeFlows({ records });
  return { record, token };
};

export const verifyAuthFlow = async (purpose: AuthFlowPurpose, token: string) => {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) return { ok: false as const, reason: 'MISSING_TOKEN' };
  const store = await readFlows();
  const tokenHash = hashToken(normalizedToken);
  const record = (store.records || []).find((item) => item.purpose === purpose && item.token_hash === tokenHash);
  if (!record) return { ok: false as const, reason: 'TOKEN_NOT_FOUND' };
  if (record.used_at) return { ok: false as const, reason: 'TOKEN_USED' };
  if (Date.parse(record.expires_at) < Date.now()) return { ok: false as const, reason: 'TOKEN_EXPIRED' };
  return { ok: true as const, record };
};

export const markAuthFlowUsed = async (recordId: string) => {
  const store = await readFlows();
  const next = (store.records || []).map((item) =>
    item.id === recordId && !item.used_at ? { ...item, used_at: new Date().toISOString() } : item
  );
  await writeFlows({ records: next });
};

const getAdminToken = (req?: any) => {
  const envToken = String(process.env.AUTH_ADMIN_TOKEN || process.env.AUTH_PRECHECK_TOKEN || '').trim();
  const headerToken = String(req?.headers?.['x-auth-precheck-token'] || req?.headers?.authorization || '').trim();
  const raw = envToken || headerToken;
  if (!raw) throw new Error('AUTH_ADMIN_TOKEN_MISSING');
  return raw.toLowerCase().startsWith('bearer ') ? raw : `Bearer ${raw}`;
};

const parseJsonText = (text: string) => {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
};

export const listUsers = async (req?: any): Promise<UpstreamUser[]> => {
  const token = getAdminToken(req);
  const url = new URL(`${BACKEND_ORIGIN}/api/users`);
  url.searchParams.set('limit', String(DEFAULT_LIMIT));
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { Authorization: token },
  });
  const text = await response.text();
  const data = parseJsonText(text);
  if (!response.ok) throw new Error(`LIST_USERS_FAILED:${response.status}:${text}`);
  return Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
};

export const findUserByEmail = async (email: string, req?: any) => {
  const users = await listUsers(req);
  const normalized = normalizeEmail(email);
  return users.find((item) => normalizeEmail(item?.email || item?.mail) === normalized) || null;
};

export const createUser = async (
  payload: { username: string; email: string; password: string; role_key?: string; is_active?: number },
  req?: any
) => {
  const token = getAdminToken(req);
  const response = await fetch(`${BACKEND_ORIGIN}/api/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
    },
    body: JSON.stringify({
      username: payload.username,
      email: normalizeEmail(payload.email),
      password: payload.password,
      role_key: payload.role_key || SELF_REGISTER_ROLE,
      is_active: Number(payload.is_active ?? 1) || 1,
    }),
  });
  const text = await response.text();
  const data = parseJsonText(text);
  if (!response.ok) throw new Error(`CREATE_USER_FAILED:${response.status}:${text}`);
  return data;
};

export const updateUserPassword = async (userId: string | number, password: string, req?: any) => {
  const token = getAdminToken(req);
  const response = await fetch(`${BACKEND_ORIGIN}/api/users/${userId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
    },
    body: JSON.stringify({ password }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`UPDATE_PASSWORD_FAILED:${response.status}:${text}`);
  return parseJsonText(text);
};

export const createUsernameFromEmail = (email: string, users: UpstreamUser[]) => {
  const normalized = normalizeEmail(email);
  const local = normalized.split('@')[0] || 'user';
  const base = local
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '') || 'user';
  const shortBase = base.slice(0, 24);
  const existing = new Set(users.map((item) => String(item?.username || '').trim().toLowerCase()).filter(Boolean));
  if (!existing.has(shortBase)) return shortBase;
  for (let i = 1; i < 1000; i += 1) {
    const candidate = `${shortBase.slice(0, Math.max(1, 24 - String(i).length - 1))}.${i}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${shortBase.slice(0, 16)}.${Date.now().toString().slice(-6)}`;
};

const getTransporter = () => {
  if (cachedTransporter) return cachedTransporter;
  const host = String(process.env.SMTP_HOST || '').trim();
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').trim();
  if (!host || !user || !pass) return null;
  cachedTransporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || '').trim() === 'true',
    auth: { user, pass },
  });
  return cachedTransporter;
};

export const sendAuthMail = async (input: {
  to: string;
  subject: string;
  actionText: string;
  actionUrl: string;
  intro: string;
}) : Promise<MailSendResult> => {
  const transporter = getTransporter();
  const from = String(process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@work4hk.local').trim();
  const actionUrl = String(input.actionUrl || '').trim();
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
      <h2 style="margin-bottom: 16px;">Work4HK 賬號安全通知</h2>
      <p>${escapeHtml(input.intro)}</p>
      <p style="margin: 24px 0;">
        <a href="${escapeHtml(actionUrl)}" style="display: inline-block; padding: 12px 20px; background: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px;">
          ${escapeHtml(input.actionText)}
        </a>
      </p>
      <p>如果按鈕無法點擊，請複製以下鏈接到瀏覽器：</p>
      <p><a href="${escapeHtml(actionUrl)}">${escapeHtml(actionUrl)}</a></p>
      <p style="color: #6b7280;">此鏈接 30 分鐘內有效，且僅可使用一次。</p>
    </div>
  `;
  const text = `${input.intro}\n\n${input.actionText}: ${actionUrl}\n\n此鏈接 30 分鐘內有效，且僅可使用一次。`;

  if (transporter) {
    await transporter.sendMail({
      from,
      to: normalizeEmail(input.to),
      subject: input.subject,
      html,
      text,
    });
    return { mode: 'smtp' };
  }

  await ensureStorageReady();
  await fs.mkdir(OUTBOX_DIR, { recursive: true });
  const previewFile = path.join(OUTBOX_DIR, `${Date.now()}-${randomBytes(6).toString('hex')}.json`);
  await fs.writeFile(
    previewFile,
    JSON.stringify(
      {
        to: normalizeEmail(input.to),
        subject: input.subject,
        text,
        html,
        actionUrl,
        created_at: new Date().toISOString(),
      },
      null,
      2
    ),
    'utf8'
  );
  return { mode: 'file', previewFile };
};

export const buildRegisterLink = (token: string) => `${getAppBaseUrl()}/register/verify?token=${encodeURIComponent(token)}`;

export const buildResetLink = (token: string) => `${getAppBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;

export const tokenErrorMessage = (reason: string) => {
  if (reason === 'TOKEN_USED') return '鏈接已被使用，請重新申請。';
  if (reason === 'TOKEN_EXPIRED') return '鏈接已過期，請重新申請。';
  return '鏈接無效，請重新申請。';
};

export const resetAuthFlowStoreForTest = async () => {
  cachedTransporter = null;
  await fs.unlink(FLOWS_FILE).catch(() => undefined);
};
