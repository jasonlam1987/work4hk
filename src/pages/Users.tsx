import React, { useEffect, useImperativeHandle, useState } from 'react';
import { Plus, Search, Edit2, Shield, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { User, getUsers, createUser, updateUser, getUserPermissions, updateUserPermissions, deleteUser, checkUserUnique, changeMyPassword } from '../api/users';
import Modal from '../components/Modal';
import clsx from 'clsx';
import { useAuthStore } from '../store/authStore';
import { ROLE_OPTIONS, normalizeRoleKey } from '../utils/authRole';
import { userDisplayPipe } from '../utils/userDisplayPipe';

const ROLES = ROLE_OPTIONS;

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
  const currentUser = useAuthStore((state) => state.user);
  const currentToken = useAuthStore((state) => state.token);
  const setAuth = useAuthStore((state) => state.setAuth);
  const currentRoleKey = normalizeRoleKey(String(currentUser?.role_key || ''));
  const isSuperAdmin = currentRoleKey === 'super_admin';
  const isSelfOnlyMode = !isSuperAdmin;

  const [formData, setFormData] = useState({
    username: '',
    email: '',
    salutation: '',
    password: '',
    role_key: 'admin',
    is_active: 1
  });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordTargetUser, setPasswordTargetUser] = useState<User | null>(null);
  const [passwordForm, setPasswordForm] = useState({ oldPassword: '', newPassword: '', confirmNewPassword: '' });

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<Array<{ id: number; username: string }>>([]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await getUsers();
      const filtered = isSelfOnlyMode
        ? data.filter((u) => String(u.username || '') === String(currentUser?.username || ''))
        : data;
      setUsers(filtered);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.detail || '獲取用戶列表失敗');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [isSelfOnlyMode, currentUser?.username]);

  const handleOpenCreate = () => {
    if (!isSuperAdmin) return;
    setFormData({ username: '', email: '', salutation: '', password: '', role_key: 'admin', is_active: 1 });
    setConfirmPassword('');
    setIsEditing(false);
    setSelectedUserId(null);
    setIsUserModalOpen(true);
  };

  useImperativeHandle(ref, () => ({
    openCreate: handleOpenCreate,
  }));

  const handleOpenEdit = (user: User) => {
    if (!isSuperAdmin && String(user.username || '') !== String(currentUser?.username || '')) return;
    setFormData({ 
      username: user.username, 
      email: String(user.email || ''),
      salutation: String(user.salutation || ''),
      password: '',
      role_key: user.role_key, 
      is_active: user.is_active 
    });
    setConfirmPassword('');
    setIsEditing(true);
    setSelectedUserId(user.id);
    setIsUserModalOpen(true);
  };

  const handleOpenPermissions = async (user: User) => {
    if (!isSuperAdmin) {
      alert('僅超級管理員可設定用戶權限');
      return;
    }
    setSelectedUserId(user.id);
    setSelectedUsername(userDisplayPipe(user));
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
    const username = String(formData.username || '').trim();
    const email = String(formData.email || '').trim().toLowerCase();
    const salutation = String(formData.salutation || '').trim();
    const pwd = String(formData.password || '');
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!username) {
      alert('請輸入用戶名稱');
      return;
    }
    if (email && !emailRegex.test(email)) {
      alert('郵箱格式不正確');
      return;
    }
    if (!isEditing) {
      if (!isSuperAdmin) {
        alert('僅超級管理員可新增用戶');
        return;
      }
      if (!pwd) {
        alert('請輸入密碼');
        return;
      }
      if (pwd.length < 8) {
        alert('密碼至少 8 碼');
        return;
      }
      if (pwd !== confirmPassword) {
        alert('確認密碼不一致');
        return;
      }
    }

    setSaving(true);
    try {
      const uniqueCheck = await checkUserUnique({
        username,
        email: email || undefined,
        excludeUserId: isEditing ? selectedUserId || undefined : undefined,
      });
      if (uniqueCheck.usernameExists) {
        alert('用戶名稱已存在，請使用其他名稱');
        setSaving(false);
        return;
      }
      if (email && uniqueCheck.emailExists) {
        alert('郵箱已被綁定，請使用其他郵箱');
        setSaving(false);
        return;
      }

      if (isEditing && selectedUserId) {
        const targetUser = users.find((u) => Number(u.id) === Number(selectedUserId));
        const editingOwn = String(targetUser?.username || '') === String(currentUser?.username || '');
        if (!isSuperAdmin && !editingOwn) {
          alert('你只能編輯自己的資料');
          setSaving(false);
          return;
        }
        const updateData: any = { 
          username,
          email: email || undefined,
          salutation: salutation || undefined,
          role_key: isSuperAdmin ? formData.role_key : undefined, 
          is_active: isSuperAdmin ? formData.is_active : undefined 
        };
        await updateUser(selectedUserId, updateData);
        if (editingOwn && currentToken) {
          setAuth(
            {
              ...(currentUser as any),
              username,
              salutation: salutation || undefined,
              email: email || undefined,
              role_key: String((currentUser as any)?.role_key || formData.role_key || ''),
            },
            currentToken
          );
        }
      } else {
        await createUser({
          username,
          email: email || undefined,
          salutation: salutation || undefined,
          password: pwd,
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

  const filteredUsers = users.filter(u => {
    const q = search.toLowerCase();
    return (
      String(u.username || '').toLowerCase().includes(q) ||
      String(u.role_key || '').toLowerCase().includes(q) ||
      String(u.email || '').toLowerCase().includes(q) ||
      String(u.salutation || '').toLowerCase().includes(q)
    );
  });

  const handleDelete = (user: User) => {
    if (!isSuperAdmin) return;
    setDeleteTargets([{ id: user.id, username: user.username }]);
    setDeleteModalOpen(true);
  };

  const confirmBatchDelete = async () => {
    if (deleteTargets.length === 0) return;
    if (!isSuperAdmin) return;

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

  const openPasswordModal = (user: User) => {
    const editingOwn = String(user.username || '') === String(currentUser?.username || '');
    if (!isSuperAdmin && !editingOwn) return;
    setPasswordTargetUser(user);
    setPasswordForm({ oldPassword: '', newPassword: '', confirmNewPassword: '' });
    setPasswordModalOpen(true);
  };

  const handleChangePassword = async () => {
    if (!passwordTargetUser) return;
    const oldPassword = String(passwordForm.oldPassword || '');
    const newPassword = String(passwordForm.newPassword || '');
    const confirmNewPassword = String(passwordForm.confirmNewPassword || '');
    const editingOwn = String(passwordTargetUser?.username || '') === String(currentUser?.username || '');
    const requireOldPassword = !isSuperAdmin || editingOwn;
    if ((!oldPassword && requireOldPassword) || !newPassword || !confirmNewPassword) {
      alert('請完整填寫密碼欄位');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      alert('新密碼與確認密碼不一致');
      return;
    }
    const strong = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
    if (!strong.test(newPassword)) {
      alert('新密碼需至少 8 碼，且包含大小寫字母、數字與特殊字元');
      return;
    }
    setSaving(true);
    try {
      await changeMyPassword({
        username: passwordTargetUser.username,
        oldPassword: requireOldPassword ? oldPassword : '',
        newPassword,
        forceReset: isSuperAdmin && !editingOwn,
      });
      setPasswordModalOpen(false);
      alert('密碼修改成功');
    } catch (err: any) {
      const message = String(err?.response?.data?.error || err?.response?.data?.detail || err?.message || '');
      if (message.includes('OLD_PASSWORD_INVALID')) {
        alert('舊密碼驗證失敗，請重新輸入');
      } else if (message.includes('WEAK_PASSWORD')) {
        alert('新密碼強度不足，需包含大小寫字母、數字與特殊字元');
      } else {
        alert('修改密碼失敗');
      }
    } finally {
      setSaving(false);
    }
  };


  const deletePreviewText = deleteTargets.map(t => t.username).join('、');

  const shouldShowCreateButton = (showCreateButton ?? !embedded) && isSuperAdmin;

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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">郵箱</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">稱呼</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">角色</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">狀態</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white/30 divide-y divide-gray-200">
            {loading && users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-apple-blue mx-auto" />
                  <p className="text-gray-500 mt-2">載入中...</p>
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {user.email || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {userDisplayPipe(user)}
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
                      disabled={!isSuperAdmin}
                    >
                      <Shield className="w-4 h-4" />
                    </button>
                    {isSuperAdmin && (
                      <button
                        type="button"
                        onClick={() => handleDelete(user)}
                        className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-2 rounded-full transition-colors"
                        title="刪除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    {(isSuperAdmin || currentUser?.username === user.username) && (
                      <button
                        type="button"
                        onClick={() => openPasswordModal(user)}
                        className="text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 p-2 rounded-full transition-colors"
                        title={isSuperAdmin ? "修改密碼（超級管理員）" : "修改我的密碼"}
                      >
                        <Shield className="w-4 h-4" />
                      </button>
                    )}
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
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                placeholder="請輸入帳號名稱"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">綁定郵箱</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                placeholder="name@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">稱呼</label>
              <input
                type="text"
                value={formData.salutation}
                onChange={(e) => setFormData({ ...formData, salutation: e.target.value })}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                placeholder="例如：陳主任 / 王小姐"
              />
            </div>

            {!isEditing && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">密碼 *</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                  placeholder="請輸入密碼（至少8碼）"
                  required
                />
              </div>
            )}
            {!isEditing && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">確認密碼 *</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                  placeholder="請再次輸入密碼"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">角色</label>
              <select
                value={formData.role_key}
                onChange={(e) => setFormData({ ...formData, role_key: e.target.value })}
                disabled={!isSuperAdmin}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              >
                {ROLE_OPTIONS.map(role => (
                  <option key={role.key} value={role.key}>{role.label}</option>
                ))}
              </select>
            </div>

            {isEditing && isSuperAdmin && (
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

      <Modal
        isOpen={passwordModalOpen && !!passwordTargetUser}
        onClose={() => setPasswordModalOpen(false)}
        title={`修改密碼：${userDisplayPipe(passwordTargetUser || undefined)}`}
        className="max-w-md"
      >
        <div className="space-y-4">
          {(!isSuperAdmin || String(passwordTargetUser?.username || '') === String(currentUser?.username || '')) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">舊密碼 *</label>
              <input
                type="password"
                value={passwordForm.oldPassword}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, oldPassword: e.target.value }))}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                placeholder="請輸入舊密碼"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">新密碼 *</label>
            <input
              type="password"
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
              className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              placeholder="至少8碼，含大小寫、數字、特殊字元"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">確認新密碼 *</label>
            <input
              type="password"
              value={passwordForm.confirmNewPassword}
              onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmNewPassword: e.target.value }))}
              className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              placeholder="請再次輸入新密碼"
            />
          </div>

          <div className="pt-4 flex justify-end space-x-3 border-t border-gray-100 mt-6">
            <button
              type="button"
              onClick={() => setPasswordModalOpen(false)}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-apple-sm font-medium transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleChangePassword}
              disabled={saving}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-apple-sm font-medium transition-colors flex items-center space-x-2 disabled:opacity-70"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{saving ? '提交中...' : '確認修改'}</span>
            </button>
          </div>
        </div>
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
