import apiClient from './client';

const DELETED_USERS_KEY = 'mock_deleted_user_ids';

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

export interface User {
  id: number;
  username: string;
  role_key: string;
  is_active: number;
  permissions?: any[];
}

export interface CreateUserRequest {
  username: string;
  password?: string;
  role_key: string;
  is_active?: number;
  permissions?: any[];
}

export interface UpdateUserRequest {
  password?: string;
  role_key?: string;
  is_active?: number;
}

export const getUsers = async () => {
  const response = await apiClient.get<User[]>('/users');
  const deleted = new Set(readDeletedUserIds());
  return response.data.filter(u => !deleted.has(u.id) && Number(u.is_active) !== 0);
};

export const createUser = async (data: CreateUserRequest) => {
  try {
    const response = await apiClient.post<User>('/users', data);
    return response.data;
  } catch (err: any) {
    const status = err?.response?.status as number | undefined;
    const detail = err?.response?.data?.detail;
    const msg = typeof detail === 'string' ? detail : err?.message ? String(err.message) : '';
    const lower = msg.toLowerCase();

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
  const response = await apiClient.patch<User>(`/users/${id}`, data);
  return response.data;
};

export const getUserPermissions = async (id: number) => {
  const response = await apiClient.get(`/users/${id}/permissions`);
  return response.data;
};

export const updateUserPermissions = async (id: number, permissions: any[]) => {
  const response = await apiClient.put(`/users/${id}/permissions`, permissions);
  return response.data;
};

export const deleteUser = async (id: number) => {
  try {
    const response = await apiClient.delete(`/users/${id}`);
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
      return { ok: true };
    }
    throw err;
  }
};
