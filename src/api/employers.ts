import apiClient from './client';

export interface Employer {
  id: number;
  name: string;
  english_name?: string;
  code?: string;
  short_name?: string;
  company_address?: string;
  mailing_address?: string;
  business_registration_number?: string;
  business_type?: string;
  remarks?: string;
  created_at?: string;
  updated_at?: string;
}

export type EmployerCreate = Omit<Employer, 'id' | 'created_at' | 'updated_at'>;

export const getEmployers = async (params?: { q?: string; limit?: number; offset?: number }) => {
  const response = await apiClient.get<Employer[]>('/employers', { params });
  return response.data;
};

export const createEmployer = async (data: EmployerCreate) => {
  const response = await apiClient.post<Employer>('/employers', data);
  return response.data;
};

export const updateEmployer = async (id: number, data: Partial<EmployerCreate>) => {
  const response = await apiClient.patch<Employer>(`/employers/${id}`, data);
  return response.data;
};

export const deleteEmployer = async (id: number) => {
  const response = await apiClient.delete(`/employers/${id}`);
  return response.data;
};
