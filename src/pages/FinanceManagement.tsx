import React, { useEffect, useMemo, useState } from 'react';
import { DollarSign, Loader2, Plus, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import Modal from '../components/Modal';
import { Worker, getWorkers } from '../api/workers';
import { getWorkerProfile } from '../utils/workerProfile';
import { labourStatusToUi, parseEmploymentMonths } from '../utils/workersForm';
import { LabourCompany, readLabourCompanies } from '../utils/labourCompanies';
import { FinanceRecord, countFinancePendingByWorkers, readFinanceRecords, upsertFinanceRecord } from '../utils/financeRecords';

type FormState = {
  worker_id: number;
  on_duty_date: string;
  cost_visa_fee: string;
  cost_labour_fee: string;
  cost_insurance_fee: string;
  cost_third_party_service_fee: string;
  income_labour_fee: string;
  income_agency_fee: string;
};

const initialForm: FormState = {
  worker_id: 0,
  on_duty_date: '',
  cost_visa_fee: '',
  cost_labour_fee: '',
  cost_insurance_fee: '',
  cost_third_party_service_fee: '',
  income_labour_fee: '',
  income_agency_fee: '',
};

const toMoney = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n;
};

const toInputMoney = (value: unknown) => {
  const n = toMoney(value);
  if (!n) return '';
  return String(n);
};

const cleanMoneyInput = (value: string) =>
  String(value || '')
    .replace(/[^\d.]/g, '')
    .replace(/(\..*)\./g, '$1');

const formatMoney = (value: number) =>
  new Intl.NumberFormat('zh-HK', { maximumFractionDigits: 2 }).format(Number(value || 0));

const getWorkerEmploymentMonths = (worker?: Worker) => {
  if (!worker) return 0;
  const workerId = Number((worker as any)?.id || 0);
  const profile = getWorkerProfile(workerId);
  const directMonths = Number(parseEmploymentMonths((worker as any)?.employment_term || ''));
  if (Number.isFinite(directMonths) && directMonths > 0) return directMonths;
  const batches = Array.isArray(profile?.work_batches) ? profile.work_batches : [];
  const latest = batches[0];
  const batchMonths = Number(latest?.employment_term_months || 0);
  if (Number.isFinite(batchMonths) && batchMonths > 0) return batchMonths;
  return 0;
};

const toDateInputValue = (value: unknown) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const datePart = text.includes('T') ? text.slice(0, 10) : text;
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : '';
};

const getWorkerOnDutyDate = (worker?: Worker) => {
  if (!worker) return '';
  const workerId = Number((worker as any)?.id || 0);
  const profile = getWorkerProfile(workerId);
  // 在職日期直接等於勞工管理的赴港日期（arrival_date）
  if ((worker as any)?.arrival_date) return toDateInputValue((worker as any).arrival_date);
  if (profile?.arrival_date) return toDateInputValue(profile.arrival_date);
  return '';
};

const FinanceManagement: React.FC = () => {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [records, setRecords] = useState<FinanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);

  const labourCompanies = useMemo<LabourCompany[]>(() => readLabourCompanies(), []);
  const labourFeeUnitByCompanyId = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of labourCompanies) {
      map.set(String(c.id || ''), Number((c.labour_fee_per_person_month ?? c.price_per_person_month) || 0));
    }
    return map;
  }, [labourCompanies]);
  const labourFeeUnitByCompanyName = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of labourCompanies) {
      map.set(
        String(c.company_name || '').trim().toLowerCase(),
        Number((c.labour_fee_per_person_month ?? c.price_per_person_month) || 0)
      );
    }
    return map;
  }, [labourCompanies]);
  const insuranceFeeUnitByCompanyId = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of labourCompanies) {
      map.set(String(c.id || ''), Number(c.insurance_fee_per_person_month || 0));
    }
    return map;
  }, [labourCompanies]);
  const insuranceFeeUnitByCompanyName = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of labourCompanies) {
      map.set(String(c.company_name || '').trim().toLowerCase(), Number(c.insurance_fee_per_person_month || 0));
    }
    return map;
  }, [labourCompanies]);

  const eligibleWorkers = useMemo(() => {
    return (workers || []).filter((w) => {
      const status = labourStatusToUi(String((w as any)?.labour_status || ''));
      return status === '在職' || status === '離職';
    });
  }, [workers]);

  const workerMetaById = useMemo(() => {
    const map = new Map<number, { status: string; labour_company_id?: string; labour_company_name?: string }>();
    for (const w of workers || []) {
      const profile = getWorkerProfile(Number((w as any)?.id || 0));
      map.set(Number((w as any)?.id || 0), {
        status: labourStatusToUi(String((w as any)?.labour_status || '')),
        labour_company_id: String((w as any)?.labour_company_id || profile?.labour_company_id || '').trim() || undefined,
        labour_company_name: String((w as any)?.labour_company_name || profile?.labour_company_name || '').trim() || undefined,
      });
    }
    return map;
  }, [workers]);

  const pendingCount = useMemo(() => countFinancePendingByWorkers(workers, records), [workers, records]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = records.map((r) => {
      const totalCost =
        Number(r.cost_visa_fee || 0) +
        Number(r.cost_labour_fee || 0) +
        Number(r.cost_insurance_fee || 0) +
        Number((r as any).cost_third_party_service_fee || 0);
      const totalIncome = Number(r.income_labour_fee || 0) + Number(r.income_agency_fee || 0);
      return {
        ...r,
        totalCost,
        totalIncome,
        actualProfit: totalIncome - totalCost,
      };
    });
    if (!q) return list;
    return list.filter((x) =>
      `${x.worker_name} ${x.labour_company_name || ''} ${x.labour_status}`.toLowerCase().includes(q)
    );
  }, [records, search]);

  const selectedWorker = useMemo(
    () => eligibleWorkers.find((w) => Number((w as any)?.id || 0) === Number(form.worker_id || 0)),
    [eligibleWorkers, form.worker_id]
  );

  const selectedWorkerMonths = useMemo(() => getWorkerEmploymentMonths(selectedWorker), [selectedWorker]);
  const selectedUnitPrices = useMemo(() => {
    if (!selectedWorker) return { labourUnit: 0, insuranceUnit: 0 };
    const workerId = Number((selectedWorker as any)?.id || 0);
    const profile = getWorkerProfile(workerId);
    const companyId = String((selectedWorker as any)?.labour_company_id || profile?.labour_company_id || '').trim();
    const companyName = String((selectedWorker as any)?.labour_company_name || profile?.labour_company_name || '').trim().toLowerCase();
    const labourUnit =
      Number(labourFeeUnitByCompanyId.get(companyId) || 0) ||
      Number(labourFeeUnitByCompanyName.get(companyName) || 0);
    const insuranceUnit =
      Number(insuranceFeeUnitByCompanyId.get(companyId) || 0) ||
      Number(insuranceFeeUnitByCompanyName.get(companyName) || 0);
    return { labourUnit, insuranceUnit };
  }, [
    selectedWorker,
    labourFeeUnitByCompanyId,
    labourFeeUnitByCompanyName,
    insuranceFeeUnitByCompanyId,
    insuranceFeeUnitByCompanyName,
  ]);

  const computedProfit = useMemo(() => {
    const totalCost =
      toMoney(form.cost_visa_fee) +
      toMoney(form.cost_labour_fee) +
      toMoney(form.cost_insurance_fee) +
      toMoney(form.cost_third_party_service_fee);
    const totalIncome =
      toMoney(form.income_labour_fee) +
      toMoney(form.income_agency_fee);
    return totalIncome - totalCost;
  }, [form]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [workerList] = await Promise.all([getWorkers({ limit: 500 })]);
      setWorkers(workerList || []);
      setRecords(readFinanceRecords());
    } catch (err: any) {
      setWorkers([]);
      setRecords(readFinanceRecords());
      setError(err?.response?.data?.detail || '讀取財務資料失敗');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const openCreate = () => {
    setForm(initialForm);
    setIsModalOpen(true);
  };

  const openEdit = (record: FinanceRecord) => {
    setForm({
      worker_id: Number(record.worker_id || 0),
      on_duty_date: toDateInputValue((record as any).on_duty_date),
      cost_visa_fee: toInputMoney(record.cost_visa_fee),
      cost_labour_fee: toInputMoney(record.cost_labour_fee),
      cost_insurance_fee: toInputMoney(record.cost_insurance_fee),
      cost_third_party_service_fee: toInputMoney((record as any).cost_third_party_service_fee),
      income_labour_fee: toInputMoney(record.income_labour_fee),
      income_agency_fee: toInputMoney(record.income_agency_fee),
    });
    setIsModalOpen(true);
  };

  const handleSelectWorker = (workerIdRaw: string) => {
    const workerId = Number(workerIdRaw || 0);
    const worker = eligibleWorkers.find((x) => Number((x as any)?.id || 0) === workerId);
    const profile = getWorkerProfile(workerId);
    const companyId = String((worker as any)?.labour_company_id || profile?.labour_company_id || '').trim();
    const companyName = String((worker as any)?.labour_company_name || profile?.labour_company_name || '').trim().toLowerCase();
    const labourFeeUnit =
      Number(labourFeeUnitByCompanyId.get(companyId) || 0) ||
      Number(labourFeeUnitByCompanyName.get(companyName) || 0);
    const insuranceFeeUnit =
      Number(insuranceFeeUnitByCompanyId.get(companyId) || 0) ||
      Number(insuranceFeeUnitByCompanyName.get(companyName) || 0);
    const months = getWorkerEmploymentMonths(worker);
    const totalLabourFee = labourFeeUnit > 0 && months > 0 ? labourFeeUnit * months : labourFeeUnit;
    const totalInsuranceFee = insuranceFeeUnit > 0 && months > 0 ? insuranceFeeUnit * months : insuranceFeeUnit;
    setForm((prev) => ({
      ...prev,
      worker_id: workerId,
      on_duty_date: getWorkerOnDutyDate(worker),
      cost_labour_fee: totalLabourFee > 0 ? String(totalLabourFee) : prev.cost_labour_fee,
      cost_insurance_fee: totalInsuranceFee > 0 ? String(totalInsuranceFee) : prev.cost_insurance_fee,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const workerId = Number(form.worker_id || 0);
    if (!workerId) {
      alert('請先選擇工人名字');
      return;
    }
    const worker = eligibleWorkers.find((x) => Number((x as any)?.id || 0) === workerId);
    if (!worker) {
      alert('所選工人不存在或狀態不符');
      return;
    }
    const profile = getWorkerProfile(workerId);
    const meta = workerMetaById.get(workerId);
    setSaving(true);
    try {
      const row = upsertFinanceRecord({
        worker_id: workerId,
        worker_name: String((worker as any)?.labour_name || '').trim() || `勞工#${workerId}`,
        labour_status: meta?.status || labourStatusToUi(String((worker as any)?.labour_status || '')),
        on_duty_date: form.on_duty_date || getWorkerOnDutyDate(worker) || undefined,
        labour_company_id: String((worker as any)?.labour_company_id || profile?.labour_company_id || '').trim() || undefined,
        labour_company_name: String((worker as any)?.labour_company_name || profile?.labour_company_name || '').trim() || undefined,
        cost_visa_fee: toMoney(form.cost_visa_fee),
        cost_labour_fee: toMoney(form.cost_labour_fee),
        cost_insurance_fee: toMoney(form.cost_insurance_fee),
        cost_third_party_service_fee: toMoney(form.cost_third_party_service_fee),
        income_labour_fee: toMoney(form.income_labour_fee),
        income_agency_fee: toMoney(form.income_agency_fee),
      });
      setRecords((prev) => {
        const exists = prev.some((x) => Number(x.worker_id) === Number(row.worker_id));
        return exists
          ? prev.map((x) => (Number(x.worker_id) === Number(row.worker_id) ? row : x))
          : [row, ...prev];
      });
      setIsModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-apple-dark">財務管理</h1>
          <p className="text-gray-500 mt-1">按勞工狀態維護成本/收入，並自動計算實際利潤</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadData()}
            className="h-10 px-3 border border-gray-200 rounded-apple-sm text-sm hover:bg-gray-50 inline-flex items-center gap-2"
          >
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
            <span>刷新</span>
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="h-10 px-4 bg-apple-blue hover:bg-blue-600 text-white rounded-apple-sm font-medium transition-colors inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>新增財務項</span>
          </button>
        </div>
      </div>

      <div className="rounded-apple-sm border border-amber-200 bg-amber-50/60 p-4">
        <div className="flex items-center gap-2 text-amber-800">
          <DollarSign className="w-4 h-4" />
          <span className="text-sm font-medium">待處理：{pendingCount} 條（在職且未建立財務資料）</span>
        </div>
      </div>

      <div className="glass-panel rounded-apple overflow-hidden">
        <div className="p-4 border-b border-gray-200/50 bg-white/40">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋工人名字或勞務公司..."
            className="w-full max-w-sm px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
          />
        </div>

        {error && (
          <div className="p-4 text-sm text-red-600 bg-red-50 border-b border-red-100">{error}</div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">工人名字</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">狀態</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">在職日期</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">所屬勞務公司</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">成本合計</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">收入合計</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">實際利潤</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white/30 divide-y divide-gray-200">
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-apple-blue mx-auto" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-gray-500">暫無財務資料</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.worker_id} className="hover:bg-gray-50/50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.worker_name || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{row.labour_status || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{toDateInputValue((row as any).on_duty_date) || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{row.labour_company_name || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{formatMoney((row as any).totalCost || 0)} 元</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{formatMoney((row as any).totalIncome || 0)} 元</td>
                    <td className={clsx(
                      'px-6 py-4 whitespace-nowrap text-sm font-medium',
                      (row as any).actualProfit >= 0 ? 'text-green-700' : 'text-red-600'
                    )}>
                      {formatMoney((row as any).actualProfit || 0)} 元
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="px-3 py-1.5 border border-gray-200 rounded hover:bg-gray-50"
                      >
                        編輯
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="維護財務資料"
        className="max-w-2xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">選擇工人名字 *</label>
            <select
              value={String(form.worker_id || '')}
              onChange={(e) => handleSelectWorker(e.target.value)}
              className="w-full px-4 py-2 bg-white border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue transition-all"
              required
            >
              <option value="">請選擇工人</option>
              {eligibleWorkers.map((w) => (
                <option key={Number((w as any).id || 0)} value={Number((w as any).id || 0)}>
                  {String((w as any).labour_name || '-')}（{labourStatusToUi(String((w as any).labour_status || ''))}）
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">在職日期</label>
            <input
              type="date"
              value={form.on_duty_date}
              readOnly
              className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-apple-sm text-gray-600"
            />
            <p className="text-xs text-gray-500 mt-1 ml-1">自動讀取勞工管理資料</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-apple-sm border border-gray-200 p-4 space-y-3">
              <div className="text-sm font-semibold text-gray-800">成本項</div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">辦證費（元）</label>
                <input
                  type="text"
                  value={form.cost_visa_fee}
                  onChange={(e) => setForm((prev) => ({ ...prev, cost_visa_fee: cleanMoneyInput(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">勞務費（元）</label>
                <input
                  type="text"
                  value={form.cost_labour_fee}
                  onChange={(e) => setForm((prev) => ({ ...prev, cost_labour_fee: cleanMoneyInput(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue"
                />
                {!!selectedWorker && (
                  <p className="text-[11px] text-gray-500 mt-1">
                    已按單價 × 僱傭月份計算：{formatMoney(selectedUnitPrices.labourUnit)} × {selectedWorkerMonths || 0} 月
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">保險費（元）</label>
                <input
                  type="text"
                  value={form.cost_insurance_fee}
                  onChange={(e) => setForm((prev) => ({ ...prev, cost_insurance_fee: cleanMoneyInput(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue"
                />
                {!!selectedWorker && (
                  <p className="text-[11px] text-gray-500 mt-1">
                    已按單價 × 僱傭月份計算：{formatMoney(selectedUnitPrices.insuranceUnit)} × {selectedWorkerMonths || 0} 月
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">第三方服務費（元）</label>
                <input
                  type="text"
                  value={form.cost_third_party_service_fee}
                  onChange={(e) => setForm((prev) => ({ ...prev, cost_third_party_service_fee: cleanMoneyInput(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue"
                />
              </div>
            </div>

            <div className="rounded-apple-sm border border-gray-200 p-4 space-y-3">
              <div className="text-sm font-semibold text-gray-800">收入項</div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">收入勞務費（元）</label>
                <input
                  type="text"
                  value={form.income_labour_fee}
                  onChange={(e) => setForm((prev) => ({ ...prev, income_labour_fee: cleanMoneyInput(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">收入中介費（元）</label>
                <input
                  type="text"
                  value={form.income_agency_fee}
                  onChange={(e) => setForm((prev) => ({ ...prev, income_agency_fee: cleanMoneyInput(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-apple-sm focus:outline-none focus:ring-2 focus:ring-apple-blue/50 focus:border-apple-blue"
                />
              </div>
              <div className="pt-2 border-t border-gray-100">
                <div className="text-xs text-gray-500">實際利潤（收入項 - 成本項）</div>
                <div className={clsx('text-lg font-semibold mt-1', computedProfit >= 0 ? 'text-green-700' : 'text-red-600')}>
                  {formatMoney(computedProfit)} 元
                </div>
              </div>
            </div>
          </div>

          {selectedWorker && (
            <div className="text-xs text-gray-500">
              工人狀態：{labourStatusToUi(String((selectedWorker as any).labour_status || ''))}
            </div>
          )}

          <div className="pt-4 flex justify-end gap-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-apple-sm"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-apple-blue hover:bg-blue-600 text-white rounded-apple-sm disabled:opacity-70 inline-flex items-center gap-2"
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

export default FinanceManagement;

