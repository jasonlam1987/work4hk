import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Lock, Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { changeMyPassword } from '../api/users';
import { recordPasswordChanged } from '../api/passwordPolicy';

const ChangePassword: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const reason = useMemo(() => {
    const url = new URLSearchParams(location.search);
    return String(url.get('reason') || '');
  }, [location.search]);

  const requireOldPassword = true;

  const strong = /^(?=.*[a-z])(?=.*\d).{8,}$/;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const username = String(user?.username || '').trim();
    if (!username) {
      setError('未取得用戶資訊，請重新登入');
      return;
    }
    if ((requireOldPassword && !oldPassword) || !newPassword || !confirmNewPassword) {
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
      await changeMyPassword({ username, oldPassword, newPassword, forceReset: false });
      await recordPasswordChanged();
      navigate('/dashboard');
    } catch (err: any) {
      const message = String(err?.response?.data?.error || err?.response?.data?.detail || err?.message || '');
      if (message.includes('OLD_PASSWORD_INVALID')) {
        setError('舊密碼驗證失敗，請重新輸入');
      } else if (message.includes('WEAK_PASSWORD')) {
        setError('新密碼強度不足，需至少 8 碼且包含字母與數字');
      } else {
        setError('修改密碼失敗');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-apple-sm border border-gray-200 bg-white/70 backdrop-blur-xl shadow-apple-sm p-6">
        <div className="flex items-center gap-2">
          <Lock className="w-5 h-5 text-apple-blue" />
          <h1 className="text-lg font-semibold text-gray-900">修改密碼</h1>
        </div>
        {reason === 'rotation' && (
          <div className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-apple-sm px-3 py-2">
            系統已啟用全員密碼輪替，請先修改密碼後再繼續使用。
          </div>
        )}
        {error && (
          <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-apple-sm px-3 py-2">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">舊密碼</label>
            <input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              className="w-full h-11 px-4 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/40 focus:border-apple-blue transition-all"
              autoComplete="current-password"
              required
            />
          </div>
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
            disabled={saving}
            className="w-full h-11 rounded-apple-sm bg-apple-blue text-white hover:bg-blue-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>保存</span>
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChangePassword;

