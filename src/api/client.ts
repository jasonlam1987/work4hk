import axios from 'axios';

const apiClient = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status as number | undefined;
    if (status === 401) {
      const token = localStorage.getItem('token');
      const url = String(error?.config?.url || '');
      const isAuthRequest =
        url.includes('/auth/login') ||
        url.includes('/auth/wechat') ||
        url.includes('/auth/register') ||
        url.includes('/auth/signup');
      const path = typeof window !== 'undefined' ? window.location.pathname : '';
      const isOnLoginPage = path === '/login' || path.startsWith('/auth/wechat');

      if (token) localStorage.removeItem('token');
      if (token && !isAuthRequest && !isOnLoginPage) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
