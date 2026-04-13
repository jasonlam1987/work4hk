import apiClient from './client';

export interface Position {
  id: number;
  employer_id: number;
  employer_name?: string;
  approval_id: number;
  position_code: string;
  position_name: string;
  employment_term?: number;
  contract_salary?: string;
  usage_status?: string;
  [key: string]: any;
}

export type PositionCreate = Partial<Omit<Position, 'id' | 'employer_name' | 'employer_code' | 'approval_number'>>;

export const getPositions = async (params?: { q?: string; limit?: number; offset?: number }) => {
  const response = await apiClient.get<Position[]>('/positions', { params });
  return response.data;
};

export const createPosition = async (data: PositionCreate) => {
  const response = await apiClient.post<Position>('/positions', data);
  return response.data;
};

export const updatePosition = async (id: number, data: Partial<PositionCreate>) => {
  const response = await apiClient.patch<Position>(`/positions/${id}`, data);
  return response.data;
};
