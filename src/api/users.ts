import apiClient from './client';
import { applyExtendedProfile, saveExtendedProfile, removeExtendedProfile } from '../utils/userDirectoryProfile';

const DELETED_USERS_KEY = 'mock_deleted_user_ids';
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

export const getUsers = async () => {
  const response = await apiClient.get<User[]>('/users');
  const deleted = new Set(readDeletedUserIds());
  const active = response.data.filter(u => !deleted.has(u.id) && Number(u.is_active) !== 0);
  return applyExtendedProfile(active);
};

export const createUser = async (data: CreateUserRequest) => {
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
  const response = await apiClient.post('/auth/change-password', payload);
  return response.data;
};

export const getUserPermissions = async (id: number) => {
  if (!canMutateUser({ id })) {
    const e: any = new Error('FORBIDDEN_LOCAL_GUARD');
    e.response = { data: { detail: '你無權查看其他用戶權限' } };
    throw e;
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
  const response = await apiClient.put(`/users/${id}/permissions`, permissions);
  return response.data;
};

export const deleteUser = async (id: number) => {
  if (!canMutateUser({ id })) {
    const e: any = new Error('FORBIDDEN_LOCAL_GUARD');
    e.response = { data: { detail: '你無權刪除其他用戶' } };
    throw e;
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
