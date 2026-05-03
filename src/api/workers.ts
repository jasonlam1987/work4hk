import apiClient from './client';
import { appendGlobalAuditLog } from '../utils/auditLog';
import { deleteWorkerProfile } from '../utils/workerProfile';

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

export const getWorkers = async (params?: { q?: string; limit?: number; offset?: number }) => {
  const response = await apiClient.get<Worker[]>('/labours', { params });
  return response.data;
};

export const createWorker = async (data: WorkerCreate) => {
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
