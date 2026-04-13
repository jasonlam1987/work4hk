import React, { useState } from 'react';
import { Plus, Search, Edit2, Loader2, RefreshCw } from 'lucide-react';
import { Position, getPositions, createPosition, updatePosition, PositionCreate } from '../api/jobs';
import Modal from '../components/Modal';
import clsx from 'clsx';

const initialForm: PositionCreate = {
  employer_id: 1,
  approval_id: 1,
  position_code: '',
  position_name: '',
  employment_term: 24,
  contract_salary: '',
  usage_status: '空闲'
};

const Jobs: React.FC = () => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [formData, setFormData] = useState<PositionCreate>(initialForm);
  const [saving, setSaving] = useState(false);

  const fetchPositions = async () => {
    try {
      setLoading(true);
      const data = await getPositions({ q: search });
      setPositions(data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.detail || '獲取職位列表失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setFormData(initialForm);
    setIsEditing(false);
    setSelectedId(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (position: Position) => {
    setFormData({ 
      employer_id: position.employer_id,
      approval_id: position.approval_id,
      position_code: position.position_code,
      position_name: position.position_name,
      employment_term: position.employment_term || 24,
      contract_salary: position.contract_salary || '',
      usage_status: position.usage_status || '空闲'
    });
    setIsEditing(true);
    setSelectedId(position.id);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEditing && selectedId) {
        await updatePosition(selectedId, formData);
      } else {
        await createPosition(formData);
      }
      setIsModalOpen(false);
      fetchPositions();
    } catch (err: any) {
      alert(err.response?.data?.detail || '操作失敗');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-apple-dark">職位管理</h1>
          <p className="text-gray-500 mt-1">管理僱主釋出的職位與薪資待遇</p>
        </div>
        <button 
          onClick={handleOpenCreate}
          className="flex items-center space-x-2 bg-apple-blue hover:bg-blue-600 text-white px-4 py-2 rounded-apple-sm transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" />
          <span>新增職位</span>
        </button>
      </div>

      <div className="glass-panel rounded-apple overflow-hidden">
        <div className="p-4 border-b border-gray-200/50 flex items-center justify-between bg-white/50">
          <div className="relative w-full max-w-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="搜尋職位名稱或代碼..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-apple-sm leading-5 bg-white/80 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all sm:text-sm"
            />
          </div>
          <button onClick={fetchPositions} className="p-2 text-gray-500 hover:text-apple-blue hover:bg-blue-50 rounded-full transition-colors ml-2">
            <RefreshCw className={clsx("w-5 h-5", loading && "animate-spin")} />
          </button>
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">職位名稱 / 代碼</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">所屬僱主</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">薪資</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">狀態</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white/30 divide-y divide-gray-200">
              {loading && positions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-apple-blue mx-auto" />
                    <p className="text-gray-500 mt-2">載入中...</p>
                  </td>
                </tr>
              ) : positions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    找不到符合條件的職位
                  </td>
                </tr>
              ) : (
                positions.map((position) => (
                  <tr key={position.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-orange-100 to-orange-200 flex items-center justify-center text-orange-600 font-medium border border-orange-200 shrink-0">
                          {position.position_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{position.position_name}</div>
                          <div className="text-sm text-gray-500">{position.position_code}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {position.employer_name || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {position.contract_salary || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={clsx(
                        "px-2.5 py-1 inline-flex text-xs leading-5 font-medium rounded-full",
                        position.usage_status === '空闲' ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                      )}>
                        {position.usage_status || '未知'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button 
                        onClick={() => handleOpenEdit(position)}
                        className="text-apple-blue hover:text-blue-900 bg-blue-50 hover:bg-blue-100 p-2 rounded-full transition-colors"
                        title="編輯"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Position Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title={isEditing ? "編輯職位資料" : "新增職位"}
        className="max-w-2xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">僱主 ID *</label>
              <input
                type="number"
                value={formData.employer_id}
                onChange={(e) => setFormData({...formData, employer_id: Number(e.target.value)})}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">批文 ID *</label>
              <input
                type="number"
                value={formData.approval_id}
                onChange={(e) => setFormData({...formData, approval_id: Number(e.target.value)})}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">職位名稱 *</label>
              <input
                type="text"
                value={formData.position_name}
                onChange={(e) => setFormData({...formData, position_name: e.target.value})}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">職位代碼 *</label>
              <input
                type="text"
                value={formData.position_code}
                onChange={(e) => setFormData({...formData, position_code: e.target.value})}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">薪資</label>
              <input
                type="text"
                value={formData.contract_salary}
                onChange={(e) => setFormData({...formData, contract_salary: e.target.value})}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">僱傭期限 (月)</label>
              <input
                type="number"
                value={formData.employment_term}
                onChange={(e) => setFormData({...formData, employment_term: Number(e.target.value)})}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">使用狀態</label>
              <select
                value={formData.usage_status}
                onChange={(e) => setFormData({...formData, usage_status: e.target.value})}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              >
                <option value="空闲">空閒</option>
                <option value="已使用">已使用</option>
              </select>
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

export default Jobs;
