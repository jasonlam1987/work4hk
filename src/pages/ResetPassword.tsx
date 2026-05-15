import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, Lock } from 'lucide-react';
import { confirmPasswordReset, verifyPasswordResetToken } from '../api/authFlows';

const passwordHint = '密碼至少 8 碼，且需包含英文字母與數字';

const ResetPassword: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => String(searchParams.get('token') || '').trim(), [searchParams]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const run = async () => {
      if (!token) {
        setError('缺少重置 token，請重新打開郵件鏈接。');
        setLoading(false);
        return;
      }
      try {
        const result = await verifyPasswordResetToken(token);
        setEmail(result.email || '');
      } catch (err: any) {
        setError(String(err?.response?.data?.detail || err?.response?.data?.error || '重置鏈接無效'));
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!password || !confirmPassword) {
      setError('請輸入並確認新密碼');
      return;
    }
    if (password !== confirmPassword) {
      setError('兩次輸入的密碼不一致');
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordReset({ token, password, confirmPassword });
      setSuccess('密碼已更新，現在可以返回登入。');
    } catch (err: any) {
      setError(String(err?.response?.data?.detail || err?.response?.data?.error || '重置密碼失敗'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f1f6ff] flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-[24px] bg-white border border-blue-100 shadow-[0_20px_50px_rgba(2,72,180,0.12)] p-7">
        <h1 className="text-2xl font-semibold text-gray-900">重置密碼</h1>
        <p className="mt-2 text-sm text-gray-500">驗證鏈接有效時，可在此設置新的登入密碼。</p>

        {loading && (
          <div className="mt-6 flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>驗證鏈接中...</span>
          </div>
        )}

        {!loading && email && (
          <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            綁定郵箱: {email}
          </div>
        )}

        {error && <div className="mt-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {success ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <div>{success}</div>
            </div>
            <Link
              to="/login"
              className="w-full h-12 inline-flex items-center justify-center rounded-xl bg-apple-blue text-white font-medium hover:bg-blue-600 transition-colors"
            >
              返回登入
            </Link>
          </div>
        ) : (
          !loading && (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">新密碼</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="w-4 h-4 text-gray-400" />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full h-12 pl-10 pr-4 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-apple-blue/30 focus:border-apple-blue"
                    placeholder={passwordHint}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">確認新密碼</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="w-4 h-4 text-gray-400" />
                  </div>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full h-12 pl-10 pr-4 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-apple-blue/30 focus:border-apple-blue"
                    placeholder="請再次輸入新密碼"
                  />
                </div>
              </div>

              <p className="text-xs text-gray-500">{passwordHint}</p>

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-12 px-4 bg-apple-blue hover:bg-blue-600 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                <span>{submitting ? '提交中...' : '更新密碼'}</span>
              </button>
            </form>
          )
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
