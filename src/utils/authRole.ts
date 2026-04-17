import { userDisplayPipe } from './userDisplayPipe';

export type AuthIdentity = {
  userId: string;
  userName: string;
  salutation: string;
  roleKey: string;
};

export const ROLE_OPTIONS = [
  { key: 'super_admin', label: '超級管理員' },
  { key: 'admin', label: '管理員' },
  { key: 'partner', label: '合作方' },
  { key: 'employer', label: '僱主' },
  { key: 'employee', label: '僱員' },
] as const;

export const normalizeRoleKey = (roleRaw: string) => {
  const role = String(roleRaw || '').trim().toLowerCase();
  if (!role) return '';
  if (role.includes('super_admin') || role.includes('superadmin') || role.includes('root') || role.includes('超級管理員') || role.includes('超级管理员')) {
    return 'super_admin';
  }
  if (role.includes('admin') || role.includes('管理員') || role.includes('管理员')) return 'admin';
  if (role.includes('partner') || role.includes('agent') || role.includes('合作方') || role.includes('仲介')) return 'partner';
  if (role.includes('employer') || role.includes('僱主') || role.includes('雇主')) return 'employer';
  if (role.includes('employee') || role.includes('worker') || role.includes('僱員') || role.includes('雇员') || role.includes('勞工')) return 'employee';
  return role;
};

const roleRouteAccess: Record<string, string[]> = {
  super_admin: ['/dashboard', '/users', '/employers', '/quota-applications', '/approvals', '/workers', '/jobs', '/deletion-approvals', '/settings'],
  admin: ['/dashboard', '/users', '/employers', '/quota-applications', '/approvals', '/workers', '/jobs', '/settings'],
  partner: ['/dashboard', '/quota-applications', '/approvals', '/workers', '/jobs'],
  employer: ['/dashboard', '/workers', '/jobs'],
  employee: ['/dashboard'],
};

export const getAuthIdentity = (): AuthIdentity => {
  try {
    const raw = localStorage.getItem('auth-storage');
    const parsed = raw ? JSON.parse(raw) : null;
    const user = parsed?.state?.user || {};
    const role = user?.role_key ?? user?.role ?? '';
    const roleKey = typeof role === 'string' ? role : (role?.role_key || role?.key || role?.name || '');
    const salutation = String(user?.salutation || '').trim();
    const userName = userDisplayPipe(user);
    return {
      userId: String(user?.id ?? ''),
      userName,
      salutation,
      roleKey: normalizeRoleKey(String(roleKey || '')),
    };
  } catch {
    return { userId: '', userName: '未設定', salutation: '', roleKey: '' };
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

export const canAccessPath = (path: string, roleRaw: string) => {
  const role = normalizeRoleKey(roleRaw);
  const allowed = roleRouteAccess[role] || ['/dashboard'];
  return allowed.some((base) => path === base || path.startsWith(`${base}/`));
};

export const getRoleLabel = (roleRaw: string) => {
  const key = normalizeRoleKey(roleRaw);
  return ROLE_OPTIONS.find((x) => x.key === key)?.label || key || '-';
};
