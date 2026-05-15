import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2, Lock } from 'lucide-react';
import { confirmPasswordReset } from '../api/passwordPolicy';

const ResetPassword: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const token = useMemo(() => {
    const url = new URLSearchParams(location.search);
    return String(url.get('token') || '').trim();
  }, [location.search]);

  const strong = /^(?=.*[a-z])(?=.*\d).{8,}$/;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!token) {
      setError('缺少重置連結 Token，請向系統管理員索取最新連結');
      return;
    }
    if (!newPassword || !confirmNewPassword) {
      setError('請完整填寫密碼欄位');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('新密碼與確認密碼不一致');
      return;
    }
    if (!strong.test(newPassword)) {
      setError('新密碼需至少 8 碼，且包含字母與數字');
      return;
    }
    setSaving(true);
    try {
      await confirmPasswordReset(token, newPassword);
      setDone(true);
      setTimeout(() => navigate('/login'), 500);
    } catch (err: any) {
      const code = String(err?.response?.data?.code || '');
      const message = String(err?.response?.data?.error || err?.response?.data?.detail || err?.message || '');
      if (code === 'INVALID_TOKEN' || code === 'TOKEN_NOT_USABLE') {
        setError('重置連結已失效，請向系統管理員索取新連結');
      } else if (message.includes('WEAK_PASSWORD')) {
        setError('新密碼強度不足，需至少 8 碼且包含字母與數字');
      } else {
        setError('重置密碼失敗');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f1f6ff] flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-lg rounded-[28px] overflow-hidden shadow-[0_28px_60px_rgba(2,72,180,0.16)] bg-white border border-blue-100">
        <div className="p-6 sm:p-10">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-apple-blue" />
            <h1 className="text-xl font-semibold text-gray-900">重置密碼</h1>
          </div>
          <p className="mt-2 text-sm text-gray-500">請設定一組新的安全密碼。</p>
          {done && (
            <div className="mt-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-apple-sm px-3 py-2">
              密碼已重置，正在返回登入頁…
            </div>
          )}
          {error && (
            <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-apple-sm px-3 py-2">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">新密碼</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full h-11 px-4 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/40 focus:border-apple-blue transition-all"
                autoComplete="new-password"
                required
              />
              <div className="mt-1 text-xs text-gray-500">至少 8 碼，且包含字母與數字</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">確認新密碼</label>
              <input
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                className="w-full h-11 px-4 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/40 focus:border-apple-blue transition-all"
                autoComplete="new-password"
                required
              />
            </div>
            <button
              type="submit"
              disabled={saving || done}
              className="w-full h-11 rounded-apple-sm bg-apple-blue text-white hover:bg-blue-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>重置密碼</span>
            </button>
          </form>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="mt-4 w-full h-11 rounded-apple-sm border border-gray-200 bg-white hover:bg-gray-50 transition-colors text-sm"
          >
            返回登入
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;

