import React, { useRef, useState, useEffect } from 'react';
import { Search, Plus, Edit2, Loader2, RefreshCw, Key, Eye, EyeOff } from 'lucide-react';
import clsx from 'clsx';
import Modal from '../components/Modal';
import { 
  Partner, PartnerCreate, getPartners, createPartner, updatePartner
} from '../api/settings';
import Users, { UsersHandle } from './Users';

type Tab = 'partners' | 'users' | 'api_keys';

const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('partners');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const usersRef = useRef<UsersHandle>(null);

  const [partners, setPartners] = useState<Partner[]>([]);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Form states
  const [partnerForm, setPartnerForm] = useState<PartnerCreate>({ name: '' });

  // API Key state
  const [apiKeys, setApiKeys] = useState({
    tencentSecretId: '',
    tencentSecretKey: '',
    wechatAppId: '',
    wechatAppSecret: '',
    authPrecheckToken: ''
  });

  const [showTencentSecretId, setShowTencentSecretId] = useState(false);
  const [showTencentSecretKey, setShowTencentSecretKey] = useState(false);
  const [showWeChatAppId, setShowWeChatAppId] = useState(false);
  const [showWeChatAppSecret, setShowWeChatAppSecret] = useState(false);
  const [showAuthPrecheckToken, setShowAuthPrecheckToken] = useState(false);

  const fetchData = async () => {
    if (activeTab === 'api_keys') {
      const storedKeys = localStorage.getItem('system_api_keys');
      if (storedKeys) {
        setApiKeys(prev => {
          try {
            const parsed = JSON.parse(storedKeys);
            return { ...prev, ...parsed };
          } catch {
            return prev;
          }
        });
      }
      return;
    }

    if (activeTab === 'users') return;

    try {
      setLoading(true);
      setError('');
      const data = await getPartners({ q: search });
      setPartners(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || '獲取資料失敗');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 300);
    return () => clearTimeout(timer);
  }, [activeTab, search]);

  const handleOpenCreate = () => {
    setIsEditing(false);
    setSelectedId(null);
    if (activeTab === 'partners') setPartnerForm({ name: '' });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: any) => {
    setIsEditing(true);
    setSelectedId(item.id);
    setPartnerForm({
      name: item.name,
      phone: item.phone || '',
      email: item.email || '',
      remarks: item.remarks || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEditing && selectedId) await updatePartner(selectedId, partnerForm);
      else await createPartner(partnerForm);
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.detail || '操作失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveApiKeys = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setTimeout(() => {
      localStorage.setItem('system_api_keys', JSON.stringify(apiKeys));
      setSaving(false);
      alert('API 金鑰已成功儲存！');
    }, 500);
  };

  const clearLocalMockData = () => {
    const ok = window.confirm('確定要清除本機模擬/暫存資料嗎？此操作只會影響目前瀏覽器，且無法回復。');
    if (!ok) return;
    const keys = [
      'mock_approvals',
      'mock_approval_files',
      'mock_employer_files',
      'cache_employers_list_v1',
      'cache_approvals_list_v1',
      'mock_deleted_user_ids',
    ];
    keys.forEach(k => localStorage.removeItem(k));
    sessionStorage.removeItem('dashboardStats');
    window.location.reload();
  };

  const renderTable = () => {
    if (activeTab === 'api_keys') {
      return (
        <div className="p-6 max-w-3xl">
          <form onSubmit={handleSaveApiKeys} className="space-y-6 bg-white/50 p-6 rounded-apple-sm border border-gray-200/50">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-1 flex items-center">
                <Key className="w-5 h-5 mr-2 text-apple-blue" />
                OCR 圖像辨識
              </h3>
              <p className="text-sm text-gray-500 mb-4">用於「僱主管理」中的商業登記證 (BR) 自動辨識功能。</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SecretId（騰訊雲 OCR / COS）</label>
                  <div className="relative">
                    <input
                      type={showTencentSecretId ? "text" : "password"}
                      value={apiKeys.tencentSecretId}
                      onChange={(e) => setApiKeys({...apiKeys, tencentSecretId: e.target.value})}
                      placeholder="例如：AKID..."
                      className="w-full px-4 py-2 pr-10 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowTencentSecretId(v => !v)}
                      className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-600"
                      title={showTencentSecretId ? '隱藏' : '顯示'}
                    >
                      {showTencentSecretId ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SecretKey（騰訊雲 OCR / COS）</label>
                  <div className="relative">
                    <input
                      type={showTencentSecretKey ? "text" : "password"}
                      value={apiKeys.tencentSecretKey}
                      onChange={(e) => setApiKeys({...apiKeys, tencentSecretKey: e.target.value})}
                      placeholder="請輸入 SecretKey..."
                      className="w-full px-4 py-2 pr-10 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowTencentSecretKey(v => !v)}
                      className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-600"
                      title={showTencentSecretKey ? '隱藏' : '顯示'}
                    >
                      {showTencentSecretKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
              <div className="pt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-apple-blue hover:bg-blue-600 text-white rounded-apple-sm font-medium transition-colors flex items-center space-x-2 disabled:opacity-70"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{saving ? '儲存中...' : '儲存 OCR 設定'}</span>
                </button>
              </div>
            </div>

            <div className="pt-6 border-t border-gray-200/50">
              <h3 className="text-lg font-medium text-gray-900 mb-1 flex items-center">
                <Key className="w-5 h-5 mr-2 text-apple-blue" />
                微信登錄
              </h3>
              <p className="text-sm text-gray-500 mb-4">用於登入頁面的「使用微信登錄」。</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">WeChat AppId</label>
                  <div className="relative">
                    <input
                      type={showWeChatAppId ? 'text' : 'password'}
                      value={(apiKeys as any).wechatAppId || ''}
                      onChange={(e) => setApiKeys({ ...(apiKeys as any), wechatAppId: e.target.value })}
                      placeholder="例如：wx..."
                      className="w-full px-4 py-2 pr-10 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowWeChatAppId(v => !v)}
                      className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-600"
                      title={showWeChatAppId ? '隱藏' : '顯示'}
                    >
                      {showWeChatAppId ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">WeChat AppSecret</label>
                  <div className="relative">
                    <input
                      type={showWeChatAppSecret ? 'text' : 'password'}
                      value={(apiKeys as any).wechatAppSecret || ''}
                      onChange={(e) => setApiKeys({ ...(apiKeys as any), wechatAppSecret: e.target.value })}
                      placeholder="例如：xxxx"
                      className="w-full px-4 py-2 pr-10 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowWeChatAppSecret(v => !v)}
                      className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-600"
                      title={showWeChatAppSecret ? '隱藏' : '顯示'}
                    >
                      {showWeChatAppSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Auth Precheck Token</label>
                  <div className="relative">
                    <input
                      type={showAuthPrecheckToken ? 'text' : 'password'}
                      value={(apiKeys as any).authPrecheckToken || ''}
                      onChange={(e) => setApiKeys({ ...(apiKeys as any), authPrecheckToken: e.target.value })}
                      placeholder="用於登入前檢測賬戶是否存在"
                      className="w-full px-4 py-2 pr-10 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAuthPrecheckToken(v => !v)}
                      className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-600"
                      title={showAuthPrecheckToken ? '隱藏' : '顯示'}
                    >
                      {showAuthPrecheckToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
              <div className="text-xs text-gray-500 mt-2">
                需先在微信開放平台配置網站應用，並把回調地址設為「{window.location.origin}/auth/wechat/callback」。
              </div>
            </div>

            <div className="pt-6 border-t border-gray-200/50">
              <h3 className="text-lg font-medium text-gray-900 mb-1">本機模擬資料</h3>
              <p className="text-sm text-gray-500 mb-4">清除瀏覽器內的本機模擬/暫存資料（例如批文/僱主檔案庫、本機刪除記錄與儀表板快取）。</p>
              <button
                type="button"
                onClick={clearLocalMockData}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-apple-sm font-medium transition-colors"
              >
                清除本機資料
              </button>
            </div>
          </form>
        </div>
      );
    }

    if (activeTab === 'users') {
      return (
        <Users embedded showCreateButton={false} ref={usersRef} />
      );
    }

    if (loading && !partners.length) {
      return (
        <div className="py-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-apple-blue mx-auto" />
          <p className="text-gray-500 mt-2">載入中...</p>
        </div>
      );
    }
    return (
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50/50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">名稱</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">聯絡電話</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">備註</th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
          </tr>
        </thead>
        <tbody className="bg-white/30 divide-y divide-gray-200">
          {partners.length === 0 ? (
            <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">找不到資料</td></tr>
          ) : (
            partners.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50/50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.phone || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.email || '-'}</td>
                <td className="px-6 py-4 text-sm text-gray-500 truncate max-w-xs">{item.remarks || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button onClick={() => handleOpenEdit(item)} className="text-apple-blue hover:text-blue-900 bg-blue-50 hover:bg-blue-100 p-2 rounded-full transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    );
  };

  const getTabLabel = (tab: Tab) => {
    switch(tab) {
      case 'partners': return '合作方';
      case 'users': return '用戶管理';
      case 'api_keys': return 'API 金鑰管理';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-apple-dark">系統設定</h1>
          <p className="text-gray-500 mt-1">管理合作方、用戶與系統 API</p>
        </div>
        {(activeTab === 'partners' || activeTab === 'users') && (
          <button 
            onClick={() => {
              if (activeTab === 'users') {
                usersRef.current?.openCreate();
              } else {
                handleOpenCreate();
              }
            }}
            className="flex items-center space-x-2 bg-apple-blue hover:bg-blue-600 text-white px-4 py-2 rounded-apple-sm transition-colors shadow-sm"
          >
            <Plus className="w-5 h-5" />
            <span>{activeTab === 'users' ? '新增用戶' : `新增${getTabLabel(activeTab)}`}</span>
          </button>
        )}
      </div>

      <div className="glass-panel rounded-apple overflow-hidden">
        <div className="border-b border-gray-200/50 bg-white/50 px-4 pt-4 flex space-x-6">
          {(['partners', 'users', 'api_keys'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setSearch(''); }}
              className={clsx(
                "pb-3 text-sm font-medium transition-colors border-b-2",
                activeTab === tab 
                  ? "border-apple-blue text-apple-blue" 
                  : "border-transparent text-gray-500 hover:text-gray-700"
              )}
            >
              {getTabLabel(tab)}
            </button>
          ))}
        </div>

        {activeTab === 'partners' && (
          <div className="p-4 border-b border-gray-200/50 bg-white/30 flex items-center justify-between">
            <div className="relative w-full max-w-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder={`搜尋${getTabLabel(activeTab)}...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-apple-sm leading-5 bg-white/80 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all sm:text-sm"
              />
            </div>
            <button onClick={fetchData} className="p-2 text-gray-500 hover:text-apple-blue hover:bg-blue-50 rounded-full transition-colors ml-2">
              <RefreshCw className={clsx("w-5 h-5", loading && "animate-spin")} />
            </button>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 text-red-600 text-sm border-b border-red-100">
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          {renderTable()}
        </div>
      </div>

      {/* Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title={isEditing ? `編輯${getTabLabel(activeTab)}` : `新增${getTabLabel(activeTab)}`}
        className="max-w-md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">名稱 *</label>
              <input
                type="text"
                value={partnerForm.name}
                onChange={(e) => setPartnerForm({ ...partnerForm, name: e.target.value })}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">聯絡電話</label>
              <input
                type="text"
                value={partnerForm.phone || ''}
                onChange={(e) => setPartnerForm({ ...partnerForm, phone: e.target.value })}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">Email</label>
              <input
                type="email"
                value={partnerForm.email || ''}
                onChange={(e) => setPartnerForm({ ...partnerForm, email: e.target.value })}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">備註</label>
              <textarea
                value={partnerForm.remarks || ''}
                onChange={(e) => setPartnerForm({ ...partnerForm, remarks: e.target.value })}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                rows={3}
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end space-x-3 border-t border-gray-100 mt-6">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-apple-sm font-medium transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-apple-blue hover:bg-blue-600 text-white rounded-apple-sm font-medium transition-colors flex items-center space-x-2 disabled:opacity-70"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{saving ? '儲存中...' : '儲存'}</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Settings;
