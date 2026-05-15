const DEV_BYPASS_TOKEN = 'dev-local-bypass-token';
const DEV_BYPASS_USERNAME = 'dev.super_admin';

export const isDevBypassEnabled = () => import.meta.env.DEV;

export const isDevBypassSession = () => {
  if (!isDevBypassEnabled()) return false;
  try {
    const token = String(localStorage.getItem('token') || '').trim();
    if (token === DEV_BYPASS_TOKEN) return true;
    const raw = localStorage.getItem('auth-storage');
    const parsed = raw ? JSON.parse(raw) : null;
    const username = String(parsed?.state?.user?.username || '').trim().toLowerCase();
    return username === DEV_BYPASS_USERNAME;
  } catch {
    return false;
  }
};

export const getDevBypassSeed = () => ({
  token: DEV_BYPASS_TOKEN,
  user: {
    id: 'dev-super-admin',
    username: DEV_BYPASS_USERNAME,
    role_key: 'super_admin',
    full_name: 'Dev Super Admin',
    salutation: '測試管理員',
  },
});
