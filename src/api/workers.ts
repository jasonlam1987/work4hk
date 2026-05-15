import apiClient from './client';
import { appendGlobalAuditLog } from '../utils/auditLog';
import { deleteWorkerProfile } from '../utils/workerProfile';
import { isDevBypassSession } from '../utils/devBypass';

const DEV_WORKERS_KEY = 'dev_mock_workers_v1';

export interface Worker {
  id: number;
  employer_id?: number;
  employer_name?: string;
  approval_id?: number;
  approval_number?: string;
  quota_seq?: string;
  labour_company_id?: string;
  labour_company_name?: string;
  position_id?: number;
  position_name?: string;
  labour_status?: '辦證中' | '在職' | '離職' | string;
  labour_name?: string;
  id_card_number?: string;
  pinyin_name?: string;
  contact_phone?: string;
  residential_address?: string;
  mailing_address?: string;
  work_locations?: string[] | string;
  marital_status?: 'married' | 'single' | 'divorced' | string;
  entry_refused?: boolean;
  entry_refused_date?: string;
  entry_refused_reason?: string;
  work_experiences?: any;
  educations?: any;
  contract_salary?: string | number;
  employment_term?: string;
  [key: string]: any;
}

export type WorkerCreate = Partial<Omit<Worker, 'id' | 'employer_name' | 'position_name' | 'created_at' | 'updated_at'>>;

const seedDevWorkers = (): Worker[] => {
  const seeded: Worker[] = [
    {
      id: 1,
      employer_id: 1,
      employer_name: '香港測試僱主有限公司',
      approval_id: 101,
      approval_number: 'APP-2026-001',
      quota_seq: '0001',
      labour_company_id: 'labour-company-dev-1',
      labour_company_name: '測試勞務公司 A',
      position_id: 201,
      position_name: '服務員',
      labour_status: '在職',
      labour_name: '張三',
      id_card_number: 'W0000001',
      pinyin_name: 'ZHANG SAN',
      contact_phone: '61230001',
      residential_address: '香港九龍測試道 10 號',
      mailing_address: '香港九龍測試道 10 號',
      work_locations: ['香港'],
      marital_status: 'single',
      contract_salary: 18000,
      employment_term: '24個月',
    },
    {
      id: 2,
      employer_id: 2,
      employer_name: '澳門示範僱主有限公司',
      approval_id: 102,
      approval_number: 'APP-2026-002',
      quota_seq: '0002',
      labour_company_id: 'labour-company-dev-2',
      labour_company_name: '測試勞務公司 B',
      position_id: 202,
      position_name: '清潔員',
      labour_status: '辦證中',
      labour_name: '李四',
      id_card_number: 'W0000002',
      pinyin_name: 'LI SI',
      contact_phone: '61230002',
      residential_address: '澳門示範街 20 號',
      mailing_address: '澳門示範街 20 號',
      work_locations: ['澳門'],
      marital_status: 'married',
      contract_salary: 16000,
      employment_term: '24個月',
    },
  ];
  localStorage.setItem(DEV_WORKERS_KEY, JSON.stringify(seeded));
  return seeded;
};

const readDevWorkers = (): Worker[] => {
  try {
    const raw = localStorage.getItem(DEV_WORKERS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const items = Array.isArray(parsed) ? (parsed as Worker[]) : [];
    if (items.length > 0) return items;
  } catch {
  }
  return seedDevWorkers();
};

const writeDevWorkers = (items: Worker[]) => {
  localStorage.setItem(DEV_WORKERS_KEY, JSON.stringify(items));
};

export const getWorkers = async (params?: { q?: string; limit?: number; offset?: number }) => {
  if (isDevBypassSession()) {
    const keyword = String(params?.q || '').trim().toLowerCase();
    const offset = Math.max(0, Number(params?.offset || 0));
    const limit = Number(params?.limit || 0);
    let items = readDevWorkers();
    if (keyword) {
      items = items.filter((item) =>
        `${item.labour_name || ''} ${item.employer_name || ''} ${item.position_name || ''} ${item.id_card_number || ''} ${item.labour_company_name || ''} ${item.approval_number || ''}`
          .toLowerCase()
          .includes(keyword)
      );
    }
    return limit > 0 ? items.slice(offset, offset + limit) : items.slice(offset);
  }
  const response = await apiClient.get<Worker[]>('/labours', { params });
  return response.data;
};

export const createWorker = async (data: WorkerCreate) => {
  if (isDevBypassSession()) {
    const items = readDevWorkers();
    const next: Worker = {
      id: items.reduce((max, item) => Math.max(max, Number(item.id || 0)), 0) + 1,
      ...data,
      labour_name: String(data.labour_name || '').trim(),
    };
    writeDevWorkers([next, ...items]);
    return next;
  }
  const response = await apiClient.post<Worker>('/labours', data);
  appendGlobalAuditLog({
    module: 'workers',
    action: 'create',
    record_id: String(response.data?.id || ''),
    record_no: String(response.data?.labour_name || response.data?.id_card_number || ''),
    details: `創建勞工：${response.data?.labour_name || response.data?.id || '-'}`,
  });
  return response.data;
};

export const updateWorker = async (id: number, data: Partial<WorkerCreate>) => {
  if (isDevBypassSession()) {
    const items = readDevWorkers();
    const next = items.map((item) =>
      Number(item.id) === Number(id)
        ? {
            ...item,
            ...data,
            labour_name: String((data.labour_name ?? item.labour_name) || '').trim(),
          }
        : item
    );
    const updated = next.find((item) => Number(item.id) === Number(id));
    if (!updated) throw new Error('WORKER_NOT_FOUND');
    writeDevWorkers(next);
    return updated;
  }
  const response = await apiClient.patch<Worker>(`/labours/${id}`, data);
  appendGlobalAuditLog({
    module: 'workers',
    action: 'update',
    record_id: String(id),
    record_no: String(response.data?.labour_name || response.data?.id_card_number || ''),
    details: `更新勞工：${response.data?.labour_name || id}`,
  });
  return response.data;
};

export const deleteWorker = async (id: number) => {
  if (isDevBypassSession()) {
    const next = readDevWorkers().filter((item) => Number(item.id) !== Number(id));
    writeDevWorkers(next);
    deleteWorkerProfile(id);
    return { ok: true };
  }
  const response = await apiClient.delete(`/labours/${id}`);
  deleteWorkerProfile(id);
  appendGlobalAuditLog({
    module: 'workers',
    action: 'delete',
    record_id: String(id),
    details: `刪除勞工 id=${id}`,
  });
  return response.data;
};
