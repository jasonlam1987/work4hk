import { User } from '../api/users';

const KEY = 'users_profile_ext_v1';

type ProfileMap = Record<string, { email?: string; salutation?: string }>;

const readMap = (): ProfileMap => {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeMap = (map: ProfileMap) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
  }
};

export const getExtendedProfileByUsername = (username?: string) => {
  const key = `username:${String(username || '').trim().toLowerCase()}`;
  const ext = readMap()[key];
  return ext || {};
};

export const findUsernameByEmail = (email?: string) => {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return '';
  const map = readMap();
  for (const [key, value] of Object.entries(map)) {
    if (String(value?.email || '').trim().toLowerCase() === normalized && key.startsWith('username:')) {
      return key.slice('username:'.length);
    }
  }
  return '';
};

const keyOf = (id: string | number | undefined, username?: string) => {
  const idKey = String(id ?? '').trim();
  if (idKey) return `id:${idKey}`;
  return `username:${String(username || '').trim().toLowerCase()}`;
};

export const applyExtendedProfile = <T extends User>(users: T[]): T[] => {
  const map = readMap();
  return users.map((u) => {
    const ext = map[keyOf(u.id, u.username)] || map[`username:${String(u.username || '').trim().toLowerCase()}`] || {};
    return {
      ...u,
      email: String(u.email || ext.email || '').trim() || undefined,
      salutation: String(u.salutation || ext.salutation || '').trim() || undefined,
    };
  });
};

export const saveExtendedProfile = (user: { id?: string | number; username?: string; email?: string; salutation?: string }) => {
  const map = readMap();
  const key = keyOf(user.id, user.username);
  map[key] = {
    email: String(user.email || '').trim() || undefined,
    salutation: String(user.salutation || '').trim() || undefined,
  };
  if (user.username) {
    map[`username:${String(user.username).trim().toLowerCase()}`] = map[key];
  }
  writeMap(map);
};
