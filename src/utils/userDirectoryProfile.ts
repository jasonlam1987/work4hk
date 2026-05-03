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
  const existing =
    map[key] ||
    (user.username ? map[`username:${String(user.username).trim().toLowerCase()}`] : undefined) ||
    {};
  const nextEmail = String(user.email || '').trim();
  const nextSalutation = String(user.salutation || '').trim();
  map[key] = {
    // Avoid overwriting previously saved values with empty payloads from partial updates.
    email: nextEmail || String(existing.email || '').trim() || undefined,
    salutation: nextSalutation || String(existing.salutation || '').trim() || undefined,
  };
  if (user.username) {
    map[`username:${String(user.username).trim().toLowerCase()}`] = map[key];
  }
  writeMap(map);
};

export const hydrateExtendedProfileFromUsers = (users: User[]) => {
  if (!Array.isArray(users) || users.length === 0) return;
  users.forEach((u) => {
    const email = String(u?.email || '').trim();
    const salutation = String(u?.salutation || '').trim();
    if (!email && !salutation) return;
    saveExtendedProfile({
      id: u?.id,
      username: u?.username,
      email: email || undefined,
      salutation: salutation || undefined,
    });
  });
};

export const removeExtendedProfile = (user: { id?: string | number; username?: string }) => {
  const map = readMap();
  const idKey = String(user.id ?? '').trim();
  if (idKey) delete map[`id:${idKey}`];
  if (user.username) {
    delete map[`username:${String(user.username).trim().toLowerCase()}`];
  }
  writeMap(map);
};
