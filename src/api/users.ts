import apiClient from './client';
import { applyExtendedProfile, hydrateExtendedProfileFromUsers, saveExtendedProfile, removeExtendedProfile } from '../utils/userDirectoryProfile';
import { isDevBypassSession } from '../utils/devBypass';

const DELETED_USERS_KEY = 'mock_deleted_user_ids';
const DEV_USERS_KEY = 'dev_mock_users_v1';
let supportsExtendedFields = true;

const readDeletedUserIds = (): number[] => {
  try {
    const raw = localStorage.getItem(DELETED_USERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((v: any) => Number(v)).filter((n: any) => Number.isFinite(n));
  } catch {
    return [];
  }
};

const writeDeletedUserIds = (ids: number[]) => {
  localStorage.setItem(DELETED_USERS_KEY, JSON.stringify(Array.from(new Set(ids))));
};

const readAuthUser = () => {
  try {
    const raw = localStorage.getItem('auth-storage');
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.state?.user || null;
  } catch {
    return null;
  }
};

const normalizeRole = (roleRaw: any) => {
  const role = String(roleRaw || '').trim().toLowerCase();
  if (!role) return '';
  if (role.includes('super_admin') || role.includes('superadmin') || role.includes('root') || role.includes('超級管理員') || role.includes('超级管理员')) return 'super_admin';
  return role;
};

const canMutateUser = (target: { id?: number | string; username?: string }) => {
  const me = readAuthUser();
  if (!me) return false;
  const role = normalizeRole(me?.role_key || me?.role);
  if (role === 'super_admin') return true;
  return String(me?.id || '') === String(target?.id || '') || String(me?.username || '') === String(target?.username || '');
};

export interface User {
  id: number;
  username: string;
  email?: string;
  salutation?: string;
  full_name?: string;
  role_key: string;
  is_active: number;
  permissions?: any[];
}

export interface CreateUserRequest {
  username: string;
  email?: string;
  salutation?: string;
  password?: string;
  role_key: string;
  is_active?: number;
  permissions?: any[];
}

export interface UpdateUserRequest {
  username?: string;
  email?: string;
  salutation?: string;
  password?: string;
  role_key?: string;
  is_active?: number;
}

type DevUser = User & {
  password?: string;
  permissions?: any[];
};

const seedDevUsers = (): DevUser[] => {
  const seeded: DevUser[] = [
    {
      id: 1,
      username: 'dev.super_admin',
      email: 'dev.super_admin@example.com',
      salutation: '測試管理員',
      full_name: 'Dev Super Admin',
      role_key: 'super_admin',
      is_active: 1,
      password: 'dev12345',
      permissions: [],
    },
    {
      id: 2,
      username: 'admin',
      email: 'admin@example.com',
      salutation: '管理員',
      full_name: 'Admin User',
      role_key: 'admin',
      is_active: 1,
      password: 'admin1234',
      permissions: [],
    },
    {
      id: 3,
      username: 'partner.demo',
      email: 'partner.demo@example.com',
      salutation: '合作方',
      full_name: 'Partner Demo',
      role_key: 'partner',
      is_active: 1,
      password: 'partner1234',
      permissions: [],
    },
  ];
  localStorage.setItem(DEV_USERS_KEY, JSON.stringify(seeded));
  return seeded;
};

const readDevUsers = (): DevUser[] => {
  try {
    const raw = localStorage.getItem(DEV_USERS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const items = Array.isArray(parsed) ? (parsed as DevUser[]) : [];
    if (items.length > 0) return items;
  } catch {
  }
  return seedDevUsers();
};

const writeDevUsers = (items: DevUser[]) => {
  localStorage.setItem(DEV_USERS_KEY, JSON.stringify(items));
};

export const getUsers = async () => {
  if (isDevBypassSession()) {
    const deleted = new Set(readDeletedUserIds());
    const items = readDevUsers().filter((u) => !deleted.has(u.id) && Number(u.is_active) !== 0);
    hydrateExtendedProfileFromUsers(items);
    return applyExtendedProfile(items);
  }
  const response = await apiClient.get<User[]>('/users');
  const deleted = new Set(readDeletedUserIds());
  const active = response.data.filter(u => !deleted.has(u.id) && Number(u.is_active) !== 0);
  // Persist server-returned extended fields to local backup to reduce accidental field loss.
  hydrateExtendedProfileFromUsers(active);
  return applyExtendedProfile(active);
};

export const createUser = async (data: CreateUserRequest) => {
  if (isDevBypassSession()) {
    const items = readDevUsers();
    const next: DevUser = {
      id: items.reduce((max, item) => Math.max(max, Number(item.id || 0)), 0) + 1,
      username: String(data.username || '').trim(),
      email: data.email ? String(data.email).trim() : undefined,
      salutation: data.salutation ? String(data.salutation).trim() : undefined,
      full_name: String(data.username || '').trim(),
      role_key: String(data.role_key || 'admin').trim(),
      is_active: Number(data.is_active ?? 1) || 1,
      password: data.password || '',
      permissions: Array.isArray(data.permissions) ? data.permissions : [],
    };
    writeDevUsers([next, ...items]);
    saveExtendedProfile({ id: next.id, username: next.username, email: next.email, salutation: next.salutation });
    return applyExtendedProfile([next])[0];
  }
  const payload: CreateUserRequest = {
    username: data.username,
    password: data.password,
    role_key: data.role_key,
    is_active: data.is_active,
    email: supportsExtendedFields ? data.email : undefined,
    salutation: supportsExtendedFields ? data.salutation : undefined,
  };
  try {
    const response = await apiClient.post<User>('/users', payload);
    const user = applyExtendedProfile([response.data])[0];
    saveExtendedProfile({ id: user.id, username: user.username, email: data.email, salutation: data.salutation });
    return user;
  } catch (err: any) {
    const status = err?.response?.status as number | undefined;
    const detail = err?.response?.data?.detail;
    const msg = typeof detail === 'string' ? detail : err?.message ? String(err.message) : '';
    const lower = msg.toLowerCase();
    const unknownField = lower.includes('unknown') || lower.includes('invalid') || lower.includes('field');

    if (unknownField && (payload.email || payload.salutation)) {
      supportsExtendedFields = false;
      const fallbackPayload: CreateUserRequest = {
        username: payload.username,
        password: payload.password,
        role_key: payload.role_key,
        is_active: payload.is_active,
      };
      const response = await apiClient.post<User>('/users', fallbackPayload);
      const user = applyExtendedProfile([response.data])[0];
      saveExtendedProfile({ id: user.id, username: user.username, email: payload.email, salutation: payload.salutation });
      return user;
    }

    const maybeDuplicate = status === 409 || status === 400 || lower.includes('duplicate') || lower.includes('exists');
    if (!maybeDuplicate) throw err;

    try {
      const all = await apiClient.get<User[]>('/users');
      const username = String(data.username || '').trim();
      const target = (all.data || []).find(u => String(u.username || '').trim() === username);
      if (!target) throw err;

      const deleted = new Set(readDeletedUserIds());
      const canRevive = Number(target.is_active) === 0 || deleted.has(target.id);
      if (!canRevive) throw err;

      const patch: UpdateUserRequest = {
        role_key: data.role_key,
        is_active: 1,
      };
      if (data.password) patch.password = data.password;

      const revived = await apiClient.patch<User>(`/users/${target.id}`, patch);
      writeDeletedUserIds(readDeletedUserIds().filter(x => x !== target.id));
      return revived.data;
    } catch {
      throw err;
    }
  }
};

export const updateUser = async (id: number, data: UpdateUserRequest) => {
  if (!canMutateUser({ id, username: data.username })) {
    const e: any = new Error('FORBIDDEN_LOCAL_GUARD');
    e.response = { data: { detail: '你只能修改自己的資料' } };
    throw e;
  }
  if (isDevBypassSession()) {
    const items = readDevUsers();
    const next = items.map((item) =>
      Number(item.id) === Number(id)
        ? {
            ...item,
            ...data,
            username: String((data.username ?? item.username) || '').trim(),
            email: data.email !== undefined ? (data.email ? String(data.email).trim() : undefined) : item.email,
            salutation: data.salutation !== undefined ? (data.salutation ? String(data.salutation).trim() : undefined) : item.salutation,
            password: data.password !== undefined ? data.password : item.password,
          }
        : item
    );
    const updated = next.find((item) => Number(item.id) === Number(id));
    if (!updated) throw new Error('USER_NOT_FOUND');
    writeDevUsers(next);
    saveExtendedProfile({ id: updated.id, username: updated.username, email: updated.email, salutation: updated.salutation });
    return applyExtendedProfile([updated])[0];
  }
  try {
    const patchData: UpdateUserRequest = {
      ...data,
      email: supportsExtendedFields ? data.email : undefined,
      salutation: supportsExtendedFields ? data.salutation : undefined,
    };
    const response = await apiClient.patch<User>(`/users/${id}`, patchData);
    const user = applyExtendedProfile([response.data])[0];
    saveExtendedProfile({ id: user.id, username: user.username, email: data.email, salutation: data.salutation });
    return user;
  } catch (err: any) {
    const detail = err?.response?.data?.detail;
    const msg = typeof detail === 'string' ? detail : err?.message ? String(err.message) : '';
    const lower = msg.toLowerCase();
    const unknownField = lower.includes('unknown') || lower.includes('invalid') || lower.includes('field');
    if (unknownField && (data.email !== undefined || data.salutation !== undefined)) {
      supportsExtendedFields = false;
      const fallback: UpdateUserRequest = { ...data };
      delete (fallback as any).email;
      delete (fallback as any).salutation;
      const response = await apiClient.patch<User>(`/users/${id}`, fallback);
      const user = applyExtendedProfile([response.data])[0];
      saveExtendedProfile({ id: user.id, username: user.username, email: data.email, salutation: data.salutation });
      return user;
    }
    throw err;
  }
};

export const checkUserUnique = async (payload: { username?: string; email?: string; excludeUserId?: number | string }) => {
  if (isDevBypassSession()) {
    const users = await getUsers();
    const excludeId = String(payload.excludeUserId || '').trim();
    const normalizedUsername = String(payload.username || '').trim().toLowerCase();
    const normalizedEmail = String(payload.email || '').trim().toLowerCase();
    const filtered = users.filter((u) => String(u.id) !== excludeId);
    return {
      usernameExists: normalizedUsername
        ? filtered.some((u) => String(u.username || '').trim().toLowerCase() === normalizedUsername)
        : false,
      emailExists: normalizedEmail
        ? filtered.some((u) => String(u.email || '').trim().toLowerCase() === normalizedEmail)
        : false,
    };
  }
  const stored = localStorage.getItem('system_api_keys');
  let token = '';
  try {
    const parsed = stored ? JSON.parse(stored) : {};
    token = parsed?.authPrecheckToken ? String(parsed.authPrecheckToken).trim() : '';
  } catch {
    token = '';
  }
  if (!token) {
    return { usernameExists: false, emailExists: false };
  }
  try {
    const response = await apiClient.post('/auth/check-user-unique', payload, {
      headers: token ? { 'X-AUTH-PRECHECK-TOKEN': token } : undefined,
      timeout: 1200,
    });
    return response.data as { usernameExists: boolean; emailExists: boolean };
  } catch {
    const users = await getUsers();
    const excludeId = String(payload.excludeUserId || '').trim();
    const normalizedUsername = String(payload.username || '').trim().toLowerCase();
    const normalizedEmail = String(payload.email || '').trim().toLowerCase();
    const filtered = users.filter((u) => String(u.id) !== excludeId);
    const usernameExists = normalizedUsername
      ? filtered.some((u) => String(u.username || '').trim().toLowerCase() === normalizedUsername)
      : false;
    const emailExists = normalizedEmail
      ? filtered.some((u) => String(u.email || '').trim().toLowerCase() === normalizedEmail)
      : false;
    return { usernameExists, emailExists };
  }
};

export const changeMyPassword = async (payload: { username: string; oldPassword: string; newPassword: string; forceReset?: boolean }) => {
  if (isDevBypassSession()) {
    const items = readDevUsers();
    const me = readAuthUser();
    const meRole = normalizeRole(me?.role_key || me?.role);
    const target = items.find((item) => String(item.username || '').trim() === String(payload.username || '').trim());
    if (!target) {
      const e: any = new Error('USER_NOT_FOUND');
      e.response = { data: { error: 'USER_NOT_FOUND' } };
      throw e;
    }
    const editingOwn = String(me?.username || '') === String(payload.username || '');
    const canForceReset = Boolean(payload.forceReset && meRole === 'super_admin' && !editingOwn);
    if (!canForceReset && String(target.password || '') !== String(payload.oldPassword || '')) {
      const e: any = new Error('OLD_PASSWORD_INVALID');
      e.response = { data: { error: 'OLD_PASSWORD_INVALID' } };
      throw e;
    }
    target.password = payload.newPassword;
    writeDevUsers(items);
    return { ok: true };
  }
  const response = await apiClient.post('/auth/change-password', payload);
  return response.data;
};

export const getUserPermissions = async (id: number) => {
  if (!canMutateUser({ id })) {
    const e: any = new Error('FORBIDDEN_LOCAL_GUARD');
    e.response = { data: { detail: '你無權查看其他用戶權限' } };
    throw e;
  }
  if (isDevBypassSession()) {
    const target = readDevUsers().find((item) => Number(item.id) === Number(id));
    return Array.isArray(target?.permissions) ? target.permissions : [];
  }
  const response = await apiClient.get(`/users/${id}/permissions`);
  return response.data;
};

export const updateUserPermissions = async (id: number, permissions: any[]) => {
  if (!canMutateUser({ id })) {
    const e: any = new Error('FORBIDDEN_LOCAL_GUARD');
    e.response = { data: { detail: '你無權修改其他用戶權限' } };
    throw e;
  }
  if (isDevBypassSession()) {
    const items = readDevUsers();
    const next = items.map((item) => (Number(item.id) === Number(id) ? { ...item, permissions } : item));
    writeDevUsers(next);
    return { ok: true };
  }
  const response = await apiClient.put(`/users/${id}/permissions`, permissions);
  return response.data;
};

export const deleteUser = async (id: number) => {
  if (!canMutateUser({ id })) {
    const e: any = new Error('FORBIDDEN_LOCAL_GUARD');
    e.response = { data: { detail: '你無權刪除其他用戶' } };
    throw e;
  }
  if (isDevBypassSession()) {
    const target = readDevUsers().find((item) => Number(item.id) === Number(id));
    if (target?.username) removeExtendedProfile({ id, username: target.username });
    const ids = readDeletedUserIds();
    writeDeletedUserIds([...ids, id]);
    return { ok: true };
  }
  let usernameToClear = '';
  try {
    const all = await apiClient.get<User[]>('/users');
    const target = (all.data || []).find((u) => Number(u.id) === Number(id));
    usernameToClear = String(target?.username || '').trim();
  } catch {
  }
  try {
    const response = await apiClient.delete(`/users/${id}`);
    removeExtendedProfile({ id, username: usernameToClear });
    return response.data;
  } catch (err: any) {
    const status = err?.response?.status as number | undefined;
    if (status === 405 || status === 404) {
      try {
        await apiClient.patch(`/users/${id}`, { is_active: 0 });
      } catch {
      }
      const ids = readDeletedUserIds();
      writeDeletedUserIds([...ids, id]);
      removeExtendedProfile({ id, username: usernameToClear });
      return { ok: true };
    }
    throw err;
  }
};
