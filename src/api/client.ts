import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const apiClient = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token') || useAuthStore.getState().token;
    if (token) {
      if (!localStorage.getItem('token')) {
        try {
          localStorage.setItem('token', token);
        } catch {
        }
      }
      const headers = (config.headers ?? {}) as any;
      headers.Authorization = `Bearer ${token}`;
      config.headers = headers;
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
      const url = String(error?.config?.url || '');
      const isAuthRequest =
        url.includes('/auth/login') ||
        url.includes('/auth/wechat') ||
        url.includes('/auth/register') ||
        url.includes('/auth/signup');
      const path = typeof window !== 'undefined' ? window.location.pathname : '';
      const isOnLoginPage = path === '/login' || path.startsWith('/auth/wechat');

      try {
        localStorage.removeItem('token');
      } catch {
      }
      try {
        useAuthStore.getState().logout();
      } catch {
      }
      if (!isAuthRequest && !isOnLoginPage && typeof window !== 'undefined') window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default apiClient;
