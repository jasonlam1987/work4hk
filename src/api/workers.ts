import apiClient from './client';

export interface Worker {
  id: number;
  employer_id?: number;
  employer_name?: string;
  position_id?: number;
  position_name?: string;
  labour_status?: string;
  application_status?: string;
  labour_name?: string;
  id_card_number?: string;
  contract_salary?: number;
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
