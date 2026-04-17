import apiClient from './client';
import { appendGlobalAuditLog } from '../utils/auditLog';

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
  appendGlobalAuditLog({
    module: 'jobs',
    action: 'create',
    record_id: String(response.data?.id || ''),
    record_no: String(response.data?.position_code || response.data?.position_name || ''),
    details: `創建職位：${response.data?.position_name || response.data?.id || '-'}`,
  });
  return response.data;
};

export const updatePosition = async (id: number, data: Partial<PositionCreate>) => {
  const response = await apiClient.patch<Position>(`/positions/${id}`, data);
  appendGlobalAuditLog({
    module: 'jobs',
    action: 'update',
    record_id: String(id),
    record_no: String(response.data?.position_code || response.data?.position_name || ''),
    details: `更新職位：${response.data?.position_name || id}`,
  });
  return response.data;
};
