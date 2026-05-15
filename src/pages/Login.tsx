import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Loader2, Mail, Lock, CircleAlert } from 'lucide-react';
import apiClient from '../api/client';
import { useAuthStore } from '../store/authStore';
import { findUsernameByEmail, getExtendedProfileByUsername } from '../utils/userDirectoryProfile';
import { appendGlobalAuditLog } from '../utils/auditLog';
import googleIcon from '../assets/auth/google.svg';
import facebookIcon from '../assets/auth/facebook.svg';
import appleIcon from '../assets/auth/apple.svg';
import heroIllustration from '../assets/auth/hero-illustration.svg';

type HttpErrorLike = {
  response?: {
    data?: {
      detail?: unknown;
      error?: unknown;
      code?: unknown;
    };
  };
  message?: unknown;
};

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'facebook' | 'apple' | null>(null);
  const [socialError, setSocialError] = useState('');
  const formRef = useRef<HTMLFormElement | null>(null);
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  const identifierLabel = useMemo(() => '帳號（使用者名稱或 Email）', []);

  const submitOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    formRef.current?.requestSubmit();
  };

  const getFriendlyLoginError = (err: unknown) => {
    const e = err as HttpErrorLike;
    const detail = e?.response?.data?.detail;
    const errText = e?.response?.data?.error;
    const code = String(e?.response?.data?.code || '');
    const msg =
      typeof detail === 'string'
        ? detail
        : typeof errText === 'string'
          ? errText
          : e?.message
            ? String(e.message)
            : '';
    const lower = msg.toLowerCase();
    if (code === 'AUTH_INVALID') return '帳號或密碼錯誤';
    if (!msg) return '驗證失敗，請檢查帳號密碼';
    if (lower.includes('not found') || lower.includes('no such user') || lower.includes('user not found')) {
      return '沒有該賬號，請先註冊';
    }
    if (lower.includes('password') || lower.includes('incorrect') || lower.includes('invalid username or password')) {
      return '密碼錯誤，請重新輸入';
    }
    return msg;
  };

  const validateUsername = (value: string) => {
    const raw = value.trim();
    if (!raw) return '請輸入帳號';
    if (raw.includes('@')) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(raw) ? '' : '電子郵件格式不正確';
    }
    const usernameRegex = /^[a-zA-Z0-9._-]{3,32}$/;
    return usernameRegex.test(raw) ? '' : '使用者名稱需為 3-32 字元（英數、點、底線或連字號）';
  };

  const validatePassword = (value: string) => {
    const raw = value.trim();
    if (!raw) return '請輸入密碼';
    if (raw.length < 6) return '密碼長度至少 6 碼';
    return '';
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSocialError('');

    const usernameError = validateUsername(username);
    const passwordError = validatePassword(password);
    const nextFieldErrors = {
      username: usernameError || undefined,
      password: passwordError || undefined,
    };
    setFieldErrors(nextFieldErrors);
    if (usernameError || passwordError) return;

    setIsLoading(true);

    try {
      const identifier = username.trim();
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);

      const tryLogin = async (loginUsername: string) => {
        const response = await apiClient.post('/auth/login', { username: loginUsername, password });
        if (response.data.access_token) {
          const token = response.data.access_token;
          const meResponse = await apiClient.get('/auth/me', {
            headers: { Authorization: `Bearer ${token}` }
          });
          const ext = getExtendedProfileByUsername(meResponse?.data?.username || loginUsername);
          setAuth({ ...meResponse.data, salutation: meResponse?.data?.salutation || ext?.salutation }, token);
          appendGlobalAuditLog({
            module: 'auth',
            action: 'login',
            record_id: String(meResponse?.data?.id || ''),
            record_no: String(meResponse?.data?.username || ''),
            details: '使用者成功登入系統',
          });
          navigate('/dashboard');
          return true;
        }
        return false;
      };

      try {
        const ok = await tryLogin(identifier);
        if (ok) return;
      } catch (firstErr: any) {
        if (!isEmail) throw firstErr;
        const mapped = findUsernameByEmail(identifier);
        if (!mapped) throw firstErr;
        const ok = await tryLogin(mapped);
        if (ok) return;
        throw firstErr;
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

  const providerLabelMap: Record<'google' | 'facebook' | 'apple', string> = {
    google: 'Google',
    facebook: 'Facebook',
    apple: 'Apple',
  };

  const providerHandlerMap: Record<'google' | 'facebook' | 'apple', () => Promise<void>> = {
    google: async () => {
      throw new Error('Google OAuth 尚未接入，回呼函式已預留');
    },
    facebook: async () => {
      throw new Error('Facebook OAuth 尚未接入，回呼函式已預留');
    },
    apple: async () => {
      throw new Error('Apple OAuth 尚未接入，回呼函式已預留');
    },
  };

  const handleSocialLogin = async (provider: 'google' | 'facebook' | 'apple') => {
    setSocialError('');
    setError('');
    setSocialLoading(provider);
    try {
      await providerHandlerMap[provider]();
    } catch (err: any) {
      const detail = String(err?.message || `${providerLabelMap[provider]} 驗證失敗，請稍後重試`);
      setSocialError(detail);
    } finally {
      setSocialLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#f1f6ff] flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-6xl rounded-[28px] overflow-hidden shadow-[0_28px_60px_rgba(2,72,180,0.16)] bg-white border border-blue-100">
        <div className="grid lg:grid-cols-[1.05fr_1fr] min-h-[620px]">
          <section className="relative bg-gradient-to-br from-[#0094ff] via-[#0d86ff] to-[#1070f8] text-white p-8 sm:p-10 lg:p-12 flex flex-col justify-between">
            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_12%_20%,rgba(255,255,255,0.45),transparent_42%),radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.35),transparent_34%),radial-gradient(circle_at_72%_72%,rgba(255,255,255,0.25),transparent_40%)]" />
            <div className="relative z-10">
              <div className="inline-flex items-center px-3 py-2 rounded-2xl bg-white shadow-[0_8px_24px_rgba(2,72,180,0.18)]">
                <img
                  src="/logo.svg"
                  alt="Work4HK 港工"
                  className="h-8 sm:h-9 w-auto"
                />
              </div>
              <h1 className="mt-8 text-3xl sm:text-4xl font-semibold tracking-tight">香港僱員管理系統</h1>
              <p className="mt-4 max-w-md text-sm sm:text-base text-blue-50/95 leading-relaxed">
                歡迎使用本平台，請透過安全驗證進入系統，繼續管理僱員資料、文件與審批流程。
              </p>
            </div>
            <div className="relative z-10 mt-8">
              <img
                src={heroIllustration}
                alt="平台頁視覺插圖"
                className="w-full max-w-[420px] mx-auto lg:mx-0 drop-shadow-[0_16px_28px_rgba(0,0,0,0.2)]"
              />
            </div>
            <div className="relative z-10 hidden sm:flex mt-6 items-center gap-3 text-xs text-blue-100/95">
              <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
              <span>系統狀態正常 · 安全監控已啟用</span>
            </div>
          </section>

          <section className="p-6 sm:p-10 lg:p-12 flex items-center justify-center bg-white">
            <div className="w-full max-w-[440px]">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-500">歡迎使用 Work4HK</p>
                <button
                  type="button"
                  disabled
                  aria-disabled
                  className="px-3 py-1.5 text-xs rounded-full bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
                >
                  註冊（即將開放）
                </button>
              </div>
              <h2 className="text-4xl font-semibold text-gray-900 tracking-tight">Work4HK 港工</h2>
              <p className="text-sm text-gray-500 mt-2">請使用第三方方式或輸入帳號密碼繼續。</p>

              {(error || socialError) && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="mt-6 px-4 py-3 bg-red-50 text-red-700 rounded-xl text-sm border border-red-100 flex items-start gap-2"
                >
                  <CircleAlert className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{socialError || error}</span>
                </div>
              )}

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {[
                  { key: 'google' as const, icon: googleIcon, classes: 'border-gray-200 hover:border-blue-200 hover:bg-blue-50/40' },
                  { key: 'facebook' as const, icon: facebookIcon, classes: 'border-blue-200 hover:border-blue-300 hover:bg-blue-50/50' },
                  { key: 'apple' as const, icon: appleIcon, classes: 'border-gray-300 hover:border-gray-400 hover:bg-gray-50' },
                ].map((item) => {
                  const loading = socialLoading === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => handleSocialLogin(item.key)}
                      disabled={isLoading || !!socialLoading}
                      className={`h-11 px-3 rounded-xl border bg-white flex items-center justify-center gap-2 text-sm text-gray-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed ${item.classes}`}
                    >
                      {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <img src={item.icon} alt={`${providerLabelMap[item.key]} icon`} className="w-5 h-5" />
                      )}
                      <span className="font-medium">{providerLabelMap[item.key]}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-3 mt-6">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-xs text-gray-500">或</span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>

              <form ref={formRef} onSubmit={handleLogin} className="mt-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">{identifierLabel}</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="w-4 h-4 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        if (fieldErrors.username) {
                          setFieldErrors((prev) => ({ ...prev, username: undefined }));
                        }
                      }}
                      onBlur={() => {
                        const msg = validateUsername(username);
                        setFieldErrors((prev) => ({ ...prev, username: msg || undefined }));
                      }}
                      onKeyDown={submitOnEnter}
                      autoComplete="username"
                      spellCheck={false}
                      inputMode="email"
                      className={`w-full h-12 pl-10 pr-4 bg-white border rounded-xl focus:outline-none focus:ring-2 transition-all ${
                        fieldErrors.username
                          ? 'border-red-300 focus:ring-red-200 focus:border-red-400'
                          : 'border-gray-200 focus:ring-apple-blue/30 focus:border-apple-blue'
                      }`}
                      placeholder="請輸入使用者名稱或 Email"
                    />
                  </div>
                  {fieldErrors.username && <p className="text-xs text-red-600 mt-1.5">{fieldErrors.username}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">密碼</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="w-4 h-4 text-gray-400" />
                    </div>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (fieldErrors.password) {
                          setFieldErrors((prev) => ({ ...prev, password: undefined }));
                        }
                      }}
                      onBlur={() => {
                        const msg = validatePassword(password);
                        setFieldErrors((prev) => ({ ...prev, password: msg || undefined }));
                      }}
                      onKeyDown={submitOnEnter}
                      autoComplete="current-password"
                      className={`w-full h-12 pl-10 pr-4 bg-white border rounded-xl focus:outline-none focus:ring-2 transition-all ${
                        fieldErrors.password
                          ? 'border-red-300 focus:ring-red-200 focus:border-red-400'
                          : 'border-gray-200 focus:ring-apple-blue/30 focus:border-apple-blue'
                      }`}
                      placeholder="請輸入密碼（至少 6 碼）"
                    />
                  </div>
                  {fieldErrors.password && <p className="text-xs text-red-600 mt-1.5">{fieldErrors.password}</p>}
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    className="text-xs text-apple-blue hover:text-blue-700 transition-colors"
                    onClick={() => setError('忘記密碼流程尚未接入，請聯絡系統管理員。')}
                  >
                    忘記密碼？
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !!socialLoading}
                  className="w-full h-12 px-4 bg-apple-blue hover:bg-blue-600 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 shadow-apple-sm disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>驗證中...</span>
                    </>
                  ) : (
                    <>
                      <span>進入系統</span>
                      <LogIn className="w-5 h-5" />
                    </>
                  )}
                </button>
              </form>

              <p className="mt-7 text-center text-xs text-gray-400">
                © 2026 copyright by EchoString Technologies Limited
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Login;
