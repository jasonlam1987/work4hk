import { Worker } from '../api/workers';
import { labourStatusToUi } from './workersForm';
import { getWorkerProfile } from './workerProfile';
import { LabourCompany, readLabourCompanies } from './labourCompanies';

export const LABOUR_COMPANY_DISPATCH_STATS_KEY = 'labour_company_dispatch_stats_v1';

export type LabourCompanyDispatchStatsRow = {
  labour_company_id: string;
  labour_company_name: string;
  assigned_workers: number;
  sent_to_hk_workers: number;
  active_workers: number;
  pending_workers: number;
  resigned_workers: number;
};

type LabourCompanyDispatchStatsSnapshot = {
  generated_at: string;
  total_workers: number;
  rows: LabourCompanyDispatchStatsRow[];
};

const normalizeCompanyId = (value: unknown) => String(value || '').trim();
const normalizeCompanyName = (value: unknown) => String(value || '').trim();

const isSentToHongKong = (status: string, arrivalDate?: string) => {
  if (String(arrivalDate || '').trim()) return true;
  return status === '在職' || status === '離職';
};

export const buildLabourCompanyDispatchStats = (
  workers: Worker[],
  labourCompanies: LabourCompany[]
): LabourCompanyDispatchStatsRow[] => {
  const nameById = new Map<string, string>();
  for (const c of labourCompanies) {
    const id = normalizeCompanyId(c.id);
    if (!id) continue;
    nameById.set(id, normalizeCompanyName(c.company_name));
  }

  const statsMap = new Map<string, LabourCompanyDispatchStatsRow>();
  const ensureRow = (companyId: string, companyName: string) => {
    const key = companyId || `name:${companyName.toLowerCase()}`;
    if (!statsMap.has(key)) {
      statsMap.set(key, {
        labour_company_id: companyId,
        labour_company_name: companyName || '未分配勞務公司',
        assigned_workers: 0,
        sent_to_hk_workers: 0,
        active_workers: 0,
        pending_workers: 0,
        resigned_workers: 0,
      });
    }
    return statsMap.get(key)!;
  };

  for (const worker of workers || []) {
    const profile = getWorkerProfile(Number(worker?.id || 0));
    const companyId = normalizeCompanyId((worker as any)?.labour_company_id || profile?.labour_company_id);
    const companyName = normalizeCompanyName(
      (worker as any)?.labour_company_name ||
      profile?.labour_company_name ||
      (companyId ? nameById.get(companyId) : '')
    );
    if (!companyId && !companyName) continue;

    const row = ensureRow(companyId, companyName || '未命名勞務公司');
    const uiStatus = labourStatusToUi(String(worker?.labour_status || ''));
    const arrivalDate = String((worker as any)?.arrival_date || profile?.arrival_date || '').trim();

    row.assigned_workers += 1;
    if (isSentToHongKong(uiStatus, arrivalDate)) row.sent_to_hk_workers += 1;
    if (uiStatus === '在職') row.active_workers += 1;
    if (uiStatus === '辦證中') row.pending_workers += 1;
    if (uiStatus === '離職') row.resigned_workers += 1;
  }

  return Array.from(statsMap.values()).sort((a, b) => {
    if (b.sent_to_hk_workers !== a.sent_to_hk_workers) return b.sent_to_hk_workers - a.sent_to_hk_workers;
    return a.labour_company_name.localeCompare(b.labour_company_name, 'zh-Hant');
  });
};

export const saveLabourCompanyDispatchStats = (rows: LabourCompanyDispatchStatsRow[], totalWorkers: number) => {
  const snapshot: LabourCompanyDispatchStatsSnapshot = {
    generated_at: new Date().toISOString(),
    total_workers: Number(totalWorkers || 0),
    rows,
  };
  try {
    localStorage.setItem(LABOUR_COMPANY_DISPATCH_STATS_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore write failures in private mode/quota limits.
  }
  return snapshot;
};

export const refreshLabourCompanyDispatchStats = (workers: Worker[]) => {
  const labourCompanies = readLabourCompanies();
  const rows = buildLabourCompanyDispatchStats(workers || [], labourCompanies);
  return saveLabourCompanyDispatchStats(rows, (workers || []).length);
};

