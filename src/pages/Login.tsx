import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Loader2, ShieldCheck } from 'lucide-react';
import apiClient from '../api/client';
import { useAuthStore } from '../store/authStore';

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  const getFriendlyLoginError = (err: any) => {
    const detail = err?.response?.data?.detail;
    const msg = typeof detail === 'string' ? detail : err?.message ? String(err.message) : '';
    const lower = msg.toLowerCase();
    if (!msg) return '登入失敗，請檢查帳號密碼';
    if (lower.includes('not found') || lower.includes('no such user') || lower.includes('user not found')) {
      return '沒有該賬號，請先註冊';
    }
    if (lower.includes('password') || lower.includes('incorrect') || lower.includes('invalid username or password')) {
      return '密碼錯誤，請重新輸入';
    }
    return msg;
  };

  const startWeChatLogin = () => {
    try {
      const stored = localStorage.getItem('system_api_keys');
      const parsed = stored ? JSON.parse(stored) : {};
      const envAppId = (import.meta as any)?.env?.VITE_WECHAT_APPID ? String((import.meta as any).env.VITE_WECHAT_APPID).trim() : '';
      const appid = parsed?.wechatAppId ? String(parsed.wechatAppId).trim() : envAppId;
      if (!appid) {
        setError('尚未配置微信登錄：請到「系統設定 → API 金鑰管理」填寫微信 AppId，或在環境變數提供 VITE_WECHAT_APPID。');
        return;
      }
      const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem('wechat_oauth_state', state);
      const redirectUri = encodeURIComponent(`${window.location.origin}/auth/wechat/callback`);
      const url =
        `https://open.weixin.qq.com/connect/qrconnect?appid=${encodeURIComponent(appid)}` +
        `&redirect_uri=${redirectUri}` +
        `&response_type=code&scope=snsapi_login&state=${encodeURIComponent(state)}` +
        `#wechat_redirect`;
      window.location.href = url;
    } catch {
      setError('微信登錄初始化失敗，請稍後重試');
    }
  };

  const checkUsernameExists = async (name: string) => {
    const stored = localStorage.getItem('system_api_keys')
    let token = ''
    try {
      const parsed = stored ? JSON.parse(stored) : {}
      token = parsed?.authPrecheckToken ? String(parsed.authPrecheckToken).trim() : ''
    } catch {
    }

    const resp = await fetch('/api/auth/check-username', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-AUTH-PRECHECK-TOKEN': token } : {}),
      },
      body: JSON.stringify({ username: name }),
    })

    if (!resp.ok) return null
    const data = await resp.json().catch(() => null)
    if (typeof data?.exists === 'boolean') return data.exists
    return null
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const name = username.trim();
      const exists = await checkUsernameExists(name);
      if (exists === false) {
        setError('沒有該賬號，請先註冊');
        return;
      }

      const response = await apiClient.post('/auth/login', { username, password });
      if (response.data.access_token) {
        const token = response.data.access_token;
        // Fetch user profile
        const meResponse = await apiClient.get('/auth/me', {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        setAuth(meResponse.data, token);
        navigate('/dashboard');
      }
    } catch (err: any) {
      const msg = getFriendlyLoginError(err)
      if (msg.includes('Invalid username or password')) {
        setError('密碼錯誤，請重新輸入')
      } else {
        setError(msg)
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-apple-gray">
      {/* Decorative background shapes */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-400/20 blur-[100px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-400/20 blur-[100px]" />

      <div className="w-full max-w-md p-8 glass-panel rounded-apple relative z-10 mx-4">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-apple-blue to-blue-400 rounded-apple-sm flex items-center justify-center shadow-apple-sm mb-6">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-apple-dark">Work4HK 勞務系統</h1>
          <p className="text-gray-500 mt-2">請登入您的帳戶以繼續</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-apple-sm text-sm text-center border border-red-100">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">帳號</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 bg-white/50 border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all duration-200"
              placeholder="請輸入帳號"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">密碼</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-white/50 border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all duration-200"
              placeholder="請輸入密碼"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 bg-apple-blue hover:bg-blue-600 text-white rounded-apple-sm font-medium transition-all duration-200 flex items-center justify-center space-x-2 shadow-apple-sm disabled:opacity-70 disabled:cursor-not-allowed mt-2"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <span>登入</span>
                <LogIn className="w-5 h-5" />
              </>
            )}
          </button>

          <button
            type="button"
            onClick={startWeChatLogin}
            disabled={isLoading}
            className="w-full py-3 px-4 bg-white hover:bg-gray-50 text-gray-800 border border-gray-200 rounded-apple-sm font-medium transition-all duration-200 flex items-center justify-center shadow-apple-sm disabled:opacity-70 disabled:cursor-not-allowed"
          >
            使用微信登錄
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-gray-400">
          &copy; {new Date().getFullYear()} EST Management System. All rights reserved.
        </div>
      </div>
    </div>
  );
};

export default Login;
