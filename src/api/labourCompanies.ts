import apiClient from './client';
import { getAuthIdentity } from '../utils/authRole';
import { deleteLabourCompany, LabourCompany, readLabourCompanies, writeLabourCompanies } from '../utils/labourCompanies';
import { isDevBypassSession } from '../utils/devBypass';

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

export const getLabourCompaniesRemote = async (): Promise<LabourCompany[]> => {
  if (isDevBypassSession()) {
    return readLabourCompanies();
  }
  const res = await apiClient.get('/ai/labour-companies', { headers: getAuthHeaders(), timeout: 30000 });
  const items = (res as any)?.data?.items;
  return Array.isArray(items) ? (items as LabourCompany[]) : [];
};

export const setLabourCompaniesRemote = async (items: LabourCompany[]): Promise<LabourCompany[]> => {
  if (isDevBypassSession()) {
    writeLabourCompanies(items);
    return readLabourCompanies();
  }
  const res = await apiClient.post(
    '/ai/labour-companies',
    { action: 'set', items },
    { headers: getAuthHeaders(), timeout: 30000 }
  );
  const next = (res as any)?.data?.items;
  return Array.isArray(next) ? (next as LabourCompany[]) : [];
};

export const deleteLabourCompanyRemote = async (id: string): Promise<LabourCompany[]> => {
  if (isDevBypassSession()) {
    deleteLabourCompany(id);
    return readLabourCompanies();
  }
  const res = await apiClient.delete('/ai/labour-companies', {
    params: { id },
    headers: getAuthHeaders(),
    timeout: 30000,
  });
  const next = (res as any)?.data?.items;
  return Array.isArray(next) ? (next as LabourCompany[]) : [];
};

