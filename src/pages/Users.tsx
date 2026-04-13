import React, { useEffect, useImperativeHandle, useState } from 'react';
import { Plus, Search, Edit2, Shield, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { User, getUsers, createUser, updateUser, getUserPermissions, updateUserPermissions, deleteUser } from '../api/users';
import Modal from '../components/Modal';
import clsx from 'clsx';

const ROLES = [
  { key: 'super_admin', label: '超級管理員' },
  { key: 'admin', label: '管理員' },
  { key: 'agent', label: '仲介' },
  { key: 'employer', label: '僱主' },
];

type UsersProps = {
  embedded?: boolean;
  showCreateButton?: boolean;
};

export type UsersHandle = {
  openCreate: () => void;
};

const Users = React.forwardRef<UsersHandle, UsersProps>(({ embedded, showCreateButton }, ref) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  
  // Modal states
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isPermModalOpen, setIsPermModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedUsername, setSelectedUsername] = useState('');
  
  const MODULES = [
    { key: 'users', label: '用戶管理' },
    { key: 'employers', label: '僱主管理' },
    { key: 'workers', label: '勞工管理' },
    { key: 'jobs', label: '職位管理' },
    { key: 'approvals', label: '批文管理' },
  ];

  const [permissions, setPermissions] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role_key: 'admin',
    is_active: 1
  });
  const [saving, setSaving] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<Array<{ id: number; username: string }>>([]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await getUsers();
      setUsers(data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.detail || '獲取用戶列表失敗');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleOpenCreate = () => {
    setFormData({ username: '', password: '', role_key: 'admin', is_active: 1 });
    setIsEditing(false);
    setSelectedUserId(null);
    setIsUserModalOpen(true);
  };

  useImperativeHandle(ref, () => ({
    openCreate: handleOpenCreate,
  }));

  const handleOpenEdit = (user: User) => {
    setFormData({ 
      username: user.username, 
      password: '', // leave empty for edit unless they want to change
      role_key: user.role_key, 
      is_active: user.is_active 
    });
    setIsEditing(true);
    setSelectedUserId(user.id);
    setIsUserModalOpen(true);
  };

  const handleOpenPermissions = async (user: User) => {
    setSelectedUserId(user.id);
    setSelectedUsername(user.username);
    setSaving(true);
    try {
      const perms = await getUserPermissions(user.id);
      // Map existing permissions to MODULES
      const mapped = MODULES.map(m => {
        const existing = perms.find((p: any) => p.module_key === m.key);
        return existing || {
          module_key: m.key,
          can_view: 0,
          can_create: 0,
          can_edit: 0,
          can_delete: 0,
          can_export: 0
        };
      });
      setPermissions(mapped);
      setIsPermModalOpen(true);
    } catch (err: any) {
      alert('獲取權限失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePermissions = async () => {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      await updateUserPermissions(selectedUserId, permissions);
      setIsPermModalOpen(false);
      alert('權限更新成功');
    } catch (err: any) {
      alert(err.response?.data?.detail || '權限更新失敗');
    } finally {
      setSaving(false);
    }
  };

  const handlePermissionChange = (moduleKey: string, field: string, value: boolean) => {
    setPermissions(prev => prev.map(p => 
      p.module_key === moduleKey ? { ...p, [field]: value ? 1 : 0 } : p
    ));
  };

  const handleSelectAllCol = (field: string, value: boolean) => {
    setPermissions(prev => prev.map(p => ({ ...p, [field]: value ? 1 : 0 })));
  };

  const handleSelectAllRow = (moduleKey: string, value: boolean) => {
    setPermissions(prev => prev.map(p => 
      p.module_key === moduleKey 
        ? { ...p, can_view: value ? 1 : 0, can_create: value ? 1 : 0, can_edit: value ? 1 : 0, can_delete: value ? 1 : 0, can_export: value ? 1 : 0 } 
        : p
    ));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEditing && selectedUserId) {
        const updateData: any = { 
          role_key: formData.role_key, 
          is_active: formData.is_active 
        };
        if (formData.password) {
          updateData.password = formData.password;
        }
        await updateUser(selectedUserId, updateData);
      } else {
        if (!formData.password) {
          alert('請輸入密碼');
          setSaving(false);
          return;
        }
        await createUser({
          username: formData.username,
          password: formData.password,
          role_key: formData.role_key,
        });
      }
      setIsUserModalOpen(false);
      fetchUsers();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : err?.message ? String(err.message) : '';
      if (msg && msg.toLowerCase().includes('duplicate')) {
        alert('用戶名已存在。如你剛剛刪除了同名用戶，請重試一次新增（系統會自動復原同名用戶）。');
      } else {
        alert(detail || '操作失敗');
      }
    } finally {
      setSaving(false);
    }
  };

  const filteredUsers = users.filter(u => 
    u.username.toLowerCase().includes(search.toLowerCase()) || 
    u.role_key.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = (user: User) => {
    setDeleteTargets([{ id: user.id, username: user.username }]);
    setDeleteModalOpen(true);
  };

  const confirmBatchDelete = async () => {
    if (deleteTargets.length === 0) return;

    setSaving(true);
    try {
      await Promise.all(deleteTargets.map(t => deleteUser(t.id)));
      setDeleteModalOpen(false);
      setDeleteTargets([]);
      await fetchUsers();
    } catch (err: any) {
      alert(err.response?.data?.detail || err.message || '刪除失敗');
    } finally {
      setSaving(false);
    }
  };


  const deletePreviewText = deleteTargets.map(t => t.username).join('、');

  const shouldShowCreateButton = showCreateButton ?? !embedded;

  const tableContent = (
    <>
      <div className="p-4 border-b border-gray-200/50 flex flex-col sm:flex-row sm:items-center justify-between bg-white/50 gap-4">
        <div className="flex items-center space-x-2">
          <div className="relative w-full sm:w-64 max-w-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="搜尋用戶名稱或角色..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-apple-sm leading-5 bg-white/80 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all sm:text-sm"
            />
          </div>
          <button onClick={fetchUsers} className="p-2 text-gray-500 hover:text-apple-blue hover:bg-blue-50 rounded-full transition-colors ml-1">
            <RefreshCw className={clsx("w-5 h-5", loading && "animate-spin")} />
          </button>
        </div>
        <div />
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 text-sm border-b border-red-100">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">用戶名</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">角色</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">狀態</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white/30 divide-y divide-gray-200">
            {loading && users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-apple-blue mx-auto" />
                  <p className="text-gray-500 mt-2">載入中...</p>
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                  找不到符合條件的用戶
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-gray-600 font-medium border border-gray-200">
                        {user.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{user.username}</div>
                        <div className="text-sm text-gray-500">ID: {user.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2.5 py-1 inline-flex text-xs leading-5 font-medium rounded-full bg-blue-100 text-blue-800 capitalize">
                      {ROLES.find(r => r.key === user.role_key)?.label || user.role_key.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={clsx(
                      "px-2.5 py-1 inline-flex text-xs leading-5 font-medium rounded-full",
                      user.is_active === 1 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                    )}>
                      {user.is_active === 1 ? '啟用' : '停用'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <button 
                      type="button"
                      onClick={() => handleOpenEdit(user)}
                      className="text-apple-blue hover:text-blue-900 bg-blue-50 hover:bg-blue-100 p-2 rounded-full transition-colors"
                      title="編輯"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      type="button"
                      className="text-purple-600 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 p-2 rounded-full transition-colors"
                      title="權限設定"
                      onClick={() => handleOpenPermissions(user)}
                    >
                      <Shield className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(user)}
                      className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-2 rounded-full transition-colors"
                      title="刪除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );

  return (
    <div className={embedded ? undefined : "space-y-6"}>
      {!embedded && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-apple-dark">用戶管理</h1>
            <p className="text-gray-500 mt-1">管理系統用戶與其角色權限</p>
          </div>
          {shouldShowCreateButton && (
            <button 
              onClick={handleOpenCreate}
              className="flex items-center space-x-2 bg-apple-blue hover:bg-blue-600 text-white px-4 py-2 rounded-apple-sm transition-colors shadow-sm"
            >
              <Plus className="w-5 h-5" />
              <span>新增用戶</span>
            </button>
          )}
        </div>
      )}

      {embedded ? (
        tableContent
      ) : (
        <div className="glass-panel rounded-apple overflow-hidden">
          {tableContent}
        </div>
      )}

      {/* User Modal */}
      <Modal 
        isOpen={isUserModalOpen} 
        onClose={() => setIsUserModalOpen(false)}
        title={isEditing ? "編輯用戶" : "新增用戶"}
        className="max-w-md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">用戶名稱 *</label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                disabled={isEditing}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all disabled:bg-gray-100 disabled:text-gray-500"
                placeholder="請輸入帳號名稱"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">密碼{isEditing ? '' : ' *'}</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                placeholder={isEditing ? "不修改請留空" : "請輸入密碼"}
                required={!isEditing}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">角色</label>
              <select
                value={formData.role_key}
                onChange={(e) => setFormData({ ...formData, role_key: e.target.value })}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              >
                {ROLES.map(role => (
                  <option key={role.key} value={role.key}>{role.label}</option>
                ))}
              </select>
            </div>

            {isEditing && (
              <div className="flex items-center pt-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active === 1}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked ? 1 : 0 })}
                  className="h-4 w-4 text-apple-blue focus:ring-apple-blue border-gray-300 rounded"
                />
                <label htmlFor="is_active" className="ml-2 block text-sm text-gray-900">
                  帳號啟用狀態
                </label>
              </div>
            )}
          </div>

          <div className="pt-4 flex justify-end space-x-3 border-t border-gray-100 mt-6">
            <button
              type="button"
              onClick={() => setIsUserModalOpen(false)}
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
      {/* Permissions Modal */}
      <Modal
        isOpen={isPermModalOpen}
        onClose={() => setIsPermModalOpen(false)}
        title={`設定權限: ${selectedUsername}`}
        className="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">模塊</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">檢視</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">新增</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">編輯</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">刪除</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">匯出</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">全選</th>
                </tr>
              </thead>
              <tbody className="bg-white/30 divide-y divide-gray-200">
                {permissions.map((perm) => {
                  const label = MODULES.find(m => m.key === perm.module_key)?.label || perm.module_key;
                  const isAllSelected = perm.can_view === 1 && perm.can_create === 1 && perm.can_edit === 1 && perm.can_delete === 1 && perm.can_export === 1;
                  return (
                    <tr key={perm.module_key} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{label}</td>
                      <td className="px-4 py-3 text-center">
                        <input 
                          type="checkbox" 
                          checked={perm.can_view === 1} 
                          onChange={(e) => handlePermissionChange(perm.module_key, 'can_view', e.target.checked)}
                          className="h-4 w-4 text-apple-blue focus:ring-apple-blue border-gray-300 rounded" 
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input 
                          type="checkbox" 
                          checked={perm.can_create === 1} 
                          onChange={(e) => handlePermissionChange(perm.module_key, 'can_create', e.target.checked)}
                          className="h-4 w-4 text-apple-blue focus:ring-apple-blue border-gray-300 rounded" 
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input 
                          type="checkbox" 
                          checked={perm.can_edit === 1} 
                          onChange={(e) => handlePermissionChange(perm.module_key, 'can_edit', e.target.checked)}
                          className="h-4 w-4 text-apple-blue focus:ring-apple-blue border-gray-300 rounded" 
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input 
                          type="checkbox" 
                          checked={perm.can_delete === 1} 
                          onChange={(e) => handlePermissionChange(perm.module_key, 'can_delete', e.target.checked)}
                          className="h-4 w-4 text-apple-blue focus:ring-apple-blue border-gray-300 rounded" 
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input 
                          type="checkbox" 
                          checked={perm.can_export === 1} 
                          onChange={(e) => handlePermissionChange(perm.module_key, 'can_export', e.target.checked)}
                          className="h-4 w-4 text-apple-blue focus:ring-apple-blue border-gray-300 rounded" 
                        />
                      </td>
                      <td className="px-4 py-3 text-center bg-gray-50/30">
                        <input 
                          type="checkbox" 
                          checked={isAllSelected}
                          onChange={(e) => handleSelectAllRow(perm.module_key, e.target.checked)}
                          className="h-4 w-4 text-apple-blue focus:ring-apple-blue border-gray-300 rounded" 
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          <div className="pt-4 flex justify-end space-x-3 border-t border-gray-100 mt-6">
            <button
              type="button"
              onClick={() => setIsPermModalOpen(false)}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-apple-sm font-medium transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSavePermissions}
              disabled={saving}
              className="px-4 py-2 bg-apple-blue hover:bg-blue-600 text-white rounded-apple-sm font-medium transition-colors flex items-center space-x-2 disabled:opacity-70"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{saving ? '儲存中...' : '儲存'}</span>
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={deleteModalOpen && deleteTargets.length > 0}
        onClose={() => {
          setDeleteModalOpen(false);
          setDeleteTargets([]);
        }}
        title="刪除用戶"
        className="max-w-md"
      >
        <div className="space-y-4">
          <div className="text-sm text-gray-700 leading-relaxed">
            確定要刪除用戶「{deletePreviewText}」嗎？刪除後數據無法回復。
          </div>
          <div className="pt-4 flex justify-end space-x-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => {
                setDeleteModalOpen(false);
                setDeleteTargets([]);
              }}
              disabled={saving}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-apple-sm font-medium transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={confirmBatchDelete}
              disabled={saving}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-apple-sm font-medium transition-colors flex items-center space-x-2 disabled:opacity-70"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>確認刪除</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
});

Users.displayName = 'Users';

export default Users;
