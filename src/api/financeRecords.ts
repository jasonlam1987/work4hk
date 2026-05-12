import apiClient from './client';
import { getAuthIdentity } from '../utils/authRole';
import { FinanceRecord } from '../utils/financeRecords';

const getAuthHeaders = () => {
  const identity = getAuthIdentity();
  const userId = String(identity.userId || '').trim();
  const role = String(identity.roleKey || '').trim();
  const name = String(identity.userName || '').trim();
  return {
    'x-user-id': userId,
    'x-user-role': role,
    'x-user-name': encodeURIComponent(name),
  };
};

export const getFinanceRecordsRemote = async (): Promise<FinanceRecord[]> => {
  const res = await apiClient.get('/ai/finance-records', { headers: getAuthHeaders(), timeout: 30000 });
  const items = (res as any)?.data?.items;
  return Array.isArray(items) ? (items as FinanceRecord[]) : [];
};

export const upsertFinanceRecordRemote = async (record: FinanceRecord): Promise<FinanceRecord | null> => {
  const res = await apiClient.post(
    '/ai/finance-records',
    { action: 'upsert', record },
    { headers: getAuthHeaders(), timeout: 30000 }
  );
  const item = (res as any)?.data?.item;
  return item && typeof item === 'object' ? (item as FinanceRecord) : null;
};

export const bulkUpsertFinanceRecordsRemote = async (records: FinanceRecord[]): Promise<FinanceRecord[]> => {
  const res = await apiClient.post(
    '/ai/finance-records',
    { action: 'bulk_upsert', records },
    { headers: getAuthHeaders(), timeout: 30000 }
  );
  const items = (res as any)?.data?.items;
  return Array.isArray(items) ? (items as FinanceRecord[]) : [];
};

export const deleteFinanceRecordRemote = async (workerId: number): Promise<FinanceRecord[]> => {
  const res = await apiClient.delete('/ai/finance-records', {
    params: { worker_id: workerId },
    headers: getAuthHeaders(),
    timeout: 30000,
  });
  const items = (res as any)?.data?.items;
  return Array.isArray(items) ? (items as FinanceRecord[]) : [];
};
