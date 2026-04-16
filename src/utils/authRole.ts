export type AuthIdentity = {
  userId: string;
  userName: string;
  roleKey: string;
};

export const getAuthIdentity = (): AuthIdentity => {
  try {
    const raw = localStorage.getItem('auth-storage');
    const parsed = raw ? JSON.parse(raw) : null;
    const user = parsed?.state?.user || {};
    const role = user?.role_key ?? user?.role ?? '';
    const roleKey = typeof role === 'string' ? role : (role?.role_key || role?.key || role?.name || '');
    return {
      userId: String(user?.id ?? ''),
      userName: String(user?.full_name || user?.username || ''),
      roleKey: String(roleKey || '').trim(),
    };
  } catch {
    return { userId: '', userName: '', roleKey: '' };
  }
};

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

export const isSuperAdmin = () => isSuperAdminRole(getAuthIdentity().roleKey);
