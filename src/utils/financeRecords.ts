import { Worker } from '../api/workers';
import { labourStatusToUi } from './workersForm';

export const FINANCE_RECORDS_KEY = 'finance_records_v1';

export type FinanceRecord = {
  worker_id: number;
  worker_name: string;
  labour_status: string;
  on_duty_date?: string;
  labour_company_id?: string;
  labour_company_name?: string;
  cost_visa_fee: number;
  cost_labour_fee: number;
  cost_insurance_fee: number;
  cost_third_party_service_fee: number;
  income_labour_fee: number;
  income_agency_fee: number;
  actual_profit: number;
  updated_at: string;
};

export type FinanceRecordInput = Omit<FinanceRecord, 'actual_profit' | 'updated_at'>;

const toNumber = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
};

const normalizeRecord = (row: FinanceRecord): FinanceRecord => {
  const costVisa = toNumber(row.cost_visa_fee);
  const costLabour = toNumber(row.cost_labour_fee);
  const costInsurance = toNumber(row.cost_insurance_fee);
  const costThirdParty = toNumber(row.cost_third_party_service_fee);
  const incomeLabour = toNumber(row.income_labour_fee);
  const incomeAgency = toNumber(row.income_agency_fee);
  const totalCost = costVisa + costLabour + costInsurance + costThirdParty;
  const totalIncome = incomeLabour + incomeAgency;
  return {
    ...row,
    worker_id: Number(row.worker_id || 0),
    worker_name: String(row.worker_name || '').trim(),
    labour_status: String(row.labour_status || '').trim(),
    on_duty_date: String((row as any).on_duty_date || '').trim() || undefined,
    labour_company_id: String(row.labour_company_id || '').trim() || undefined,
    labour_company_name: String(row.labour_company_name || '').trim() || undefined,
    cost_visa_fee: costVisa,
    cost_labour_fee: costLabour,
    cost_insurance_fee: costInsurance,
    cost_third_party_service_fee: costThirdParty,
    income_labour_fee: incomeLabour,
    income_agency_fee: incomeAgency,
    actual_profit: totalIncome - totalCost,
    updated_at: String(row.updated_at || new Date().toISOString()),
  };
};

export const readFinanceRecords = (): FinanceRecord[] => {
  try {
    const raw = localStorage.getItem(FINANCE_RECORDS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x === 'object')
      .map((x) => normalizeRecord(x as FinanceRecord))
      .sort((a, b) => Date.parse(b.updated_at || '') - Date.parse(a.updated_at || ''));
  } catch {
    return [];
  }
};

export const writeFinanceRecords = (records: FinanceRecord[]) => {
  localStorage.setItem(FINANCE_RECORDS_KEY, JSON.stringify(records.map(normalizeRecord)));
};

export const upsertFinanceRecord = (input: FinanceRecordInput): FinanceRecord => {
  const row = normalizeRecord({
    ...input,
    actual_profit: 0,
    updated_at: new Date().toISOString(),
  });
  const all = readFinanceRecords();
  const next = all.some((x) => Number(x.worker_id) === Number(row.worker_id))
    ? all.map((x) => (Number(x.worker_id) === Number(row.worker_id) ? row : x))
    : [row, ...all];
  writeFinanceRecords(next);
  return row;
};

export const deleteFinanceRecord = (workerId: number) => {
  const id = Number(workerId || 0);
  if (!id) return readFinanceRecords();
  const next = readFinanceRecords().filter((x) => Number(x.worker_id || 0) !== id);
  writeFinanceRecords(next);
  return next;
};

export const countFinancePendingByWorkers = (workers: Worker[], records: FinanceRecord[]) => {
  const doneIds = new Set(records.map((x) => Number(x.worker_id || 0)).filter((x) => x > 0));
  return (workers || []).filter((w) => {
    const status = labourStatusToUi(String((w as any)?.labour_status || ''));
    if (status !== '在職') return false;
    const id = Number((w as any)?.id || 0);
    if (!id) return false;
    return !doneIds.has(id);
  }).length;
};

