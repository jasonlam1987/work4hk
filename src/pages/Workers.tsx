import React, { useState } from 'react';
import { Plus, Search, Edit2, Loader2, RefreshCw } from 'lucide-react';
import { Worker, getWorkers, createWorker, updateWorker, WorkerCreate } from '../api/workers';
import Modal from '../components/Modal';
import clsx from 'clsx';

const initialForm: WorkerCreate = {
  labour_name: '',
  id_card_number: '',
  labour_status: 'Active',
  application_status: 'Pending',
  contract_salary: 0,
  employment_term: '',
};

const Workers: React.FC = () => {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [formData, setFormData] = useState<WorkerCreate>(initialForm);
  const [saving, setSaving] = useState(false);

  const fetchWorkers = async () => {
    try {
      setLoading(true);
      const data = await getWorkers({ q: search });
      setWorkers(data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.detail || '獲取勞工列表失敗');
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

  const handleOpenEdit = (worker: Worker) => {
    setFormData({ 
      labour_name: worker.labour_name || '',
      id_card_number: worker.id_card_number || '',
      labour_status: worker.labour_status || 'Active',
      application_status: worker.application_status || 'Pending',
      contract_salary: worker.contract_salary || 0,
      employment_term: worker.employment_term || '',
    });
    setIsEditing(true);
    setSelectedId(worker.id);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEditing && selectedId) {
        await updateWorker(selectedId, formData);
      } else {
        await createWorker(formData);
      }
      setIsModalOpen(false);
      fetchWorkers();
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
          <h1 className="text-2xl font-semibold text-apple-dark">勞工管理</h1>
          <p className="text-gray-500 mt-1">管理所有外籍勞工資料與狀態</p>
        </div>
        <button 
          onClick={handleOpenCreate}
          className="flex items-center space-x-2 bg-apple-blue hover:bg-blue-600 text-white px-4 py-2 rounded-apple-sm transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" />
          <span>新增勞工</span>
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
              placeholder="搜尋勞工姓名、證件號碼..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-apple-sm leading-5 bg-white/80 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all sm:text-sm"
            />
          </div>
          <button onClick={fetchWorkers} className="p-2 text-gray-500 hover:text-apple-blue hover:bg-blue-50 rounded-full transition-colors ml-2">
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">勞工姓名</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">證件號碼</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">所屬僱主</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">職位</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">勞工狀態</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white/30 divide-y divide-gray-200">
              {loading && workers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-apple-blue mx-auto" />
                    <p className="text-gray-500 mt-2">載入中...</p>
                  </td>
                </tr>
              ) : workers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    找不到符合條件的勞工
                  </td>
                </tr>
              ) : (
                workers.map((worker) => (
                  <tr key={worker.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-green-100 to-green-200 flex items-center justify-center text-green-600 font-medium border border-green-200 shrink-0">
                          {worker.labour_name?.charAt(0).toUpperCase() || '?'}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{worker.labour_name || '未命名'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {worker.id_card_number || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {worker.employer_name || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {worker.position_name || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={clsx(
                        "px-2.5 py-1 inline-flex text-xs leading-5 font-medium rounded-full",
                        worker.labour_status === 'Active' ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                      )}>
                        {worker.labour_status || '未知'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button 
                        onClick={() => handleOpenEdit(worker)}
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

      {/* Worker Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title={isEditing ? "編輯勞工資料" : "新增勞工"}
        className="max-w-2xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">勞工姓名 *</label>
              <input
                type="text"
                value={formData.labour_name}
                onChange={(e) => setFormData({...formData, labour_name: e.target.value})}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">證件號碼</label>
              <input
                type="text"
                value={formData.id_card_number}
                onChange={(e) => setFormData({...formData, id_card_number: e.target.value})}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">勞工狀態</label>
              <select
                value={formData.labour_status}
                onChange={(e) => setFormData({...formData, labour_status: e.target.value})}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              >
                <option value="Active">Active (在職)</option>
                <option value="Inactive">Inactive (離職)</option>
                <option value="Pending">Pending (待處理)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">申請狀態</label>
              <input
                type="text"
                value={formData.application_status}
                onChange={(e) => setFormData({...formData, application_status: e.target.value})}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">合約薪資</label>
              <input
                type="number"
                value={formData.contract_salary}
                onChange={(e) => setFormData({...formData, contract_salary: Number(e.target.value)})}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">僱傭期限</label>
              <input
                type="text"
                value={formData.employment_term}
                onChange={(e) => setFormData({...formData, employment_term: e.target.value})}
                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
                placeholder="例如：2年"
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

export default Workers;
