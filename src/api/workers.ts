import apiClient from './client';

export interface Worker {
  id: number;
  employer_id?: number;
  employer_name?: string;
  approval_id?: number;
  approval_number?: string;
  quota_seq?: string;
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
  return response.data;
};

export const updateWorker = async (id: number, data: Partial<WorkerCreate>) => {
  const response = await apiClient.patch<Worker>(`/labours/${id}`, data);
  return response.data;
};

export const deleteWorker = async (id: number) => {
  const response = await apiClient.delete(`/labours/${id}`);
  return response.data;
};
