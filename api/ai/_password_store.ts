import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ensureStorageReady, getStoragePaths } from './_storage_root.js';
import { downloadFromSupabaseStorage, isSupabaseStorageEnabled, uploadToSupabaseStorage } from './_supabase_storage.js';

export type PasswordPolicy = {
  rotation_epoch_ms: number;
  updated_at: string;
  user_last_changed_ms: Record<string, number>;
};

export type PasswordResetIndexItem = {
  jti: string;
  username: string;
  exp_ms: number;
  created_at: string;
  used_at?: string;
};

export type PasswordResetIndex = {
  items: Record<string, PasswordResetIndexItem>;
  updated_at: string;
};

const DATA_DIR = getStoragePaths().dataDir;
const POLICY_FILE = path.join(DATA_DIR, 'password-policy.json');
const RESETS_FILE = path.join(DATA_DIR, 'password-resets.json');
const POLICY_OBJECT_PATH = '__auth__/v1/password-policy.json';
const RESETS_OBJECT_PATH = '__auth__/v1/password-resets.json';

const safeJson = <T>(raw: any, fallback: T): T => {
  try {
    return raw && typeof raw === 'object' ? (raw as T) : fallback;
  } catch {
    return fallback;
  }
};

const normalizeUsernameKey = (username: string) => String(username || '').trim().toLowerCase();

const loadJson = async (filePath: string, objectPath: string) => {
  if (isSupabaseStorageEnabled()) {
    const bytes = await downloadFromSupabaseStorage(objectPath);
    return JSON.parse(bytes.toString('utf8'));
  }
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
};

const saveJson = async (filePath: string, objectPath: string, obj: any) => {
  const payload = Buffer.from(JSON.stringify(obj), 'utf8');
  if (isSupabaseStorageEnabled()) {
    await uploadToSupabaseStorage(objectPath, payload, 'application/json; charset=utf-8');
    return;
  }
  await ensureStorageReady();
  await fs.writeFile(filePath, payload);
};

export const loadPasswordPolicy = async (): Promise<PasswordPolicy> => {
  try {
    const raw = await loadJson(POLICY_FILE, POLICY_OBJECT_PATH);
    const normalized = safeJson<PasswordPolicy>(raw, {
      rotation_epoch_ms: 0,
      updated_at: new Date().toISOString(),
      user_last_changed_ms: {},
    });
    return {
      rotation_epoch_ms: Number(normalized.rotation_epoch_ms || 0) || 0,
      updated_at: String(normalized.updated_at || new Date().toISOString()),
      user_last_changed_ms:
        normalized.user_last_changed_ms && typeof normalized.user_last_changed_ms === 'object'
          ? normalized.user_last_changed_ms
          : {},
    };
  } catch {
    return { rotation_epoch_ms: 0, updated_at: new Date().toISOString(), user_last_changed_ms: {} };
  }
};

export const savePasswordPolicy = async (policy: PasswordPolicy) => {
  const cleaned: PasswordPolicy = {
    rotation_epoch_ms: Number(policy?.rotation_epoch_ms || 0) || 0,
    updated_at: new Date().toISOString(),
    user_last_changed_ms:
      policy?.user_last_changed_ms && typeof policy.user_last_changed_ms === 'object' ? policy.user_last_changed_ms : {},
  };
  await saveJson(POLICY_FILE, POLICY_OBJECT_PATH, cleaned);
};

export const computeMustChangePassword = (policy: PasswordPolicy, username: string) => {
  const rotation = Number(policy?.rotation_epoch_ms || 0) || 0;
  if (!rotation) return false;
  const key = normalizeUsernameKey(username);
  const last = Number(policy?.user_last_changed_ms?.[key] || 0) || 0;
  return last < rotation;
};

export const recordPasswordChanged = async (username: string, atMs?: number) => {
  const key = normalizeUsernameKey(username);
  if (!key) return;
  const policy = await loadPasswordPolicy();
  policy.user_last_changed_ms = policy.user_last_changed_ms || {};
  policy.user_last_changed_ms[key] = Number(atMs ?? Date.now());
  await savePasswordPolicy(policy);
};

export const setRotationEpoch = async (epochMs: number) => {
  const policy = await loadPasswordPolicy();
  policy.rotation_epoch_ms = Number(epochMs || 0) || 0;
  await savePasswordPolicy(policy);
  return policy;
};

export const loadPasswordResetIndex = async (): Promise<PasswordResetIndex> => {
  try {
    const raw = await loadJson(RESETS_FILE, RESETS_OBJECT_PATH);
    const normalized = safeJson<PasswordResetIndex>(raw, { items: {}, updated_at: new Date().toISOString() });
    const items = normalized.items && typeof normalized.items === 'object' ? normalized.items : {};
    return { items, updated_at: String(normalized.updated_at || new Date().toISOString()) };
  } catch {
    return { items: {}, updated_at: new Date().toISOString() };
  }
};

export const savePasswordResetIndex = async (idx: PasswordResetIndex) => {
  const items = idx?.items && typeof idx.items === 'object' ? idx.items : {};
  await saveJson(RESETS_FILE, RESETS_OBJECT_PATH, { items, updated_at: new Date().toISOString() } satisfies PasswordResetIndex);
};

export const registerPasswordResetToken = async (item: PasswordResetIndexItem) => {
  const idx = await loadPasswordResetIndex();
  idx.items = idx.items || {};
  idx.items[String(item.jti)] = {
    jti: String(item.jti),
    username: normalizeUsernameKey(item.username),
    exp_ms: Number(item.exp_ms || 0) || 0,
    created_at: String(item.created_at || new Date().toISOString()),
    used_at: item.used_at ? String(item.used_at) : undefined,
  };
  await savePasswordResetIndex(idx);
};

export const consumePasswordResetToken = async (jti: string) => {
  const key = String(jti || '').trim();
  if (!key) return { ok: false as const, reason: 'MISSING' as const };
  const idx = await loadPasswordResetIndex();
  const item = idx.items?.[key];
  if (!item) return { ok: false as const, reason: 'NOT_FOUND' as const };
  if (item.used_at) return { ok: false as const, reason: 'USED' as const };
  if (Number(item.exp_ms || 0) && Date.now() > Number(item.exp_ms || 0)) return { ok: false as const, reason: 'EXPIRED' as const };
  item.used_at = new Date().toISOString();
  idx.items[key] = item;
  await savePasswordResetIndex(idx);
  return { ok: true as const, item };
};

