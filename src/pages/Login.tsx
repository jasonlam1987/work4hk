import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Loader2, ShieldCheck, User, Lock, QrCode } from 'lucide-react';
import apiClient from '../api/client';
import { useAuthStore } from '../store/authStore';

type HttpErrorLike = {
  response?: {
    data?: {
      detail?: unknown;
    };
  };
  message?: unknown;
};

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  const submitOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    formRef.current?.requestSubmit();
  };

  const getFriendlyLoginError = (err: unknown) => {
    const e = err as HttpErrorLike;
    const detail = e?.response?.data?.detail;
    const msg = typeof detail === 'string' ? detail : e?.message ? String(e.message) : '';
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
      const envAppId = typeof import.meta.env.VITE_WECHAT_APPID === 'string' ? import.meta.env.VITE_WECHAT_APPID.trim() : '';
      const appid = envAppId || (parsed?.wechatAppId ? String(parsed.wechatAppId).trim() : '');
      if (!appid) {
        setError('尚未配置微信登錄：請到「系統設定 → API 金鑰管理」填寫微信 AppId，或在環境變數提供 VITE_WECHAT_APPID。');
        return;
      }
      const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem('wechat_oauth_state', state);
      const redirectUri = encodeURIComponent(`${window.location.origin}/auth/wechat/callback`);
      const scope =
        typeof import.meta.env.VITE_WECHAT_SCOPE === 'string' && import.meta.env.VITE_WECHAT_SCOPE.trim()
          ? import.meta.env.VITE_WECHAT_SCOPE.trim()
          : 'snsapi_login';
      const url =
        `https://open.weixin.qq.com/connect/qrconnect?appid=${encodeURIComponent(appid)}` +
        `&redirect_uri=${redirectUri}` +
        `&response_type=code&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}` +
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
      token = ''
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
    } catch (err: unknown) {
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
      <div className="absolute top-[-18%] left-[-16%] w-[48%] h-[48%] rounded-full bg-blue-500/12 blur-[110px]" />
      <div className="absolute bottom-[-18%] right-[-16%] w-[48%] h-[48%] rounded-full bg-indigo-500/10 blur-[110px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.04)_1px,transparent_0)] [background-size:24px_24px] opacity-40" />

      <div className="w-full max-w-md mx-4 relative z-10">
        <div className="glass-panel rounded-apple p-8 sm:p-9">
          <div className="flex flex-col items-center text-center mb-7">
            <div className="w-14 h-14 bg-gradient-to-br from-apple-blue to-blue-500 rounded-apple-sm flex items-center justify-center shadow-apple-sm mb-5">
              <ShieldCheck className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-[28px] leading-tight font-semibold tracking-tight text-apple-dark">Work4HK 勞務管理系統</h1>
            <p className="text-sm text-gray-500 mt-2">請登入以繼續使用後台功能</p>
          </div>

          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="mb-6 px-4 py-3 bg-red-50 text-red-700 rounded-apple-sm text-sm border border-red-100"
            >
              {error}
            </div>
          )}

          <form ref={formRef} onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">帳號</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="w-4.5 h-4.5 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={submitOnEnter}
                  autoComplete="username"
                  spellCheck={false}
                  inputMode="text"
                  className="w-full h-12 pl-10 pr-4 bg-white/70 border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/40 focus:border-apple-blue transition-all"
                  placeholder="請輸入帳號"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">密碼</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="w-4.5 h-4.5 text-gray-400" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={submitOnEnter}
                  autoComplete="current-password"
                  className="w-full h-12 pl-10 pr-4 bg-white/70 border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/40 focus:border-apple-blue transition-all"
                  placeholder="請輸入密碼"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 px-4 bg-apple-blue hover:bg-blue-600 text-white rounded-apple-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-apple-sm disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>登入中…</span>
                </>
              ) : (
                <>
                  <span>登入</span>
                  <LogIn className="w-5 h-5" />
                </>
              )}
            </button>

            <div className="flex items-center gap-3 pt-1">
              <div className="h-px flex-1 bg-gray-200/70" />
              <div className="text-xs text-gray-500">或</div>
              <div className="h-px flex-1 bg-gray-200/70" />
            </div>

            <button
              type="button"
              onClick={startWeChatLogin}
              disabled={isLoading}
              className="w-full h-12 px-4 bg-white hover:bg-gray-50 text-gray-900 border border-gray-200 rounded-apple-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-apple-sm disabled:opacity-70 disabled:cursor-not-allowed"
            >
              <QrCode className="w-5 h-5 text-gray-700" />
              <span>使用微信登錄</span>
            </button>
          </form>

          <div className="mt-7 text-center text-xs text-gray-400">
            &copy; {new Date().getFullYear()} Work4HK. All rights reserved.
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
