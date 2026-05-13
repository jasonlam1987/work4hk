import apiClient from './client';
import { getAuthIdentity } from '../utils/authRole';
import { Approval, ApprovalCreate, QuotaDetail } from './approvals';

const getAuthHeaders = () => {
  const identity = getAuthIdentity();
  return {
    'x-user-id': String(identity.userId || '').trim(),
    'x-user-role': String(identity.roleKey || '').trim(),
    'x-user-name': encodeURIComponent(String(identity.userName || '').trim()),
  };
};

export const getApprovalsRemote = async (): Promise<Approval[]> => {
  const res = await apiClient.get('/ai/approvals', { headers: getAuthHeaders(), timeout: 30000 });
  const items = (res as any)?.data?.items;
  return Array.isArray(items) ? (items as Approval[]) : [];
};

export const createApprovalRemote = async (data: ApprovalCreate): Promise<Approval> => {
  const res = await apiClient.post('/ai/approvals', { action: 'create', item: data }, { headers: getAuthHeaders(), timeout: 30000 });
  return (res as any)?.data?.item as Approval;
};

export const updateApprovalRemote = async (id: number, patch: Partial<ApprovalCreate>): Promise<Approval> => {
  const res = await apiClient.post('/ai/approvals', { action: 'update', id, patch }, { headers: getAuthHeaders(), timeout: 30000 });
  return (res as any)?.data?.item as Approval;
};

export const deleteApprovalRemote = async (id: number): Promise<Approval[]> => {
  const res = await apiClient.delete('/ai/approvals', { params: { id }, headers: getAuthHeaders(), timeout: 30000 });
  const items = (res as any)?.data?.items;
  return Array.isArray(items) ? (items as Approval[]) : [];
};

export const setApprovalQuotaDetailsRemote = async (approvalId: number, details: QuotaDetail[]): Promise<QuotaDetail[]> => {
  const res = await apiClient.post(
    '/ai/approval-quotas',
    { approval_id: String(approvalId), details },
    { headers: getAuthHeaders(), timeout: 30000 }
  );
  const items = (res as any)?.data?.items;
  return Array.isArray(items) ? (items as QuotaDetail[]) : [];
};

export const getApprovalQuotaMapRemote = async (): Promise<Record<string, QuotaDetail[]>> => {
  const res = await apiClient.get('/ai/approval-quotas', { headers: getAuthHeaders(), timeout: 30000 });
  const map = (res as any)?.data?.map;
  return map && typeof map === 'object' ? (map as Record<string, QuotaDetail[]>) : {};
};

