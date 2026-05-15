import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Mail, Send } from 'lucide-react';
import { requestRegisterEmail } from '../api/authFlows';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const Register: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [previewFile, setPreviewFile] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setPreviewFile('');

    const normalized = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalized)) {
      setError('請輸入有效的電子郵箱');
      return;
    }

    setLoading(true);
    try {
      const result = await requestRegisterEmail(normalized);
      setSuccess(result.message || '驗證鏈接已寄出，請前往郵箱完成驗證。');
      if (result.previewFile) setPreviewFile(result.previewFile);
    } catch (err: any) {
      setError(String(err?.response?.data?.detail || err?.response?.data?.error || '寄送驗證郵件失敗'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f1f6ff] flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-[24px] bg-white border border-blue-100 shadow-[0_20px_50px_rgba(2,72,180,0.12)] p-7">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-blue-50 text-apple-blue flex items-center justify-center">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">郵箱註冊</h1>
            <p className="text-sm text-gray-500">先驗證郵箱，通過後再設置密碼。</p>
          </div>
        </div>

        {error && <div className="mt-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {success && <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}
        {previewFile && (
          <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-700 break-all">
            本機預覽郵件已寫入: {previewFile}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">電子郵箱</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="w-4 h-4 text-gray-400" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="w-full h-12 pl-10 pr-4 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-apple-blue/30 focus:border-apple-blue"
                placeholder="name@example.com"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 px-4 bg-apple-blue hover:bg-blue-600 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            <span>{loading ? '發送中...' : '發送驗證鏈接'}</span>
          </button>
        </form>

        <div className="mt-6 text-sm text-gray-500 flex items-center justify-between">
          <span>已經有帳號？</span>
          <Link to="/login" className="text-apple-blue hover:text-blue-700 font-medium">
            返回登入
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Register;
