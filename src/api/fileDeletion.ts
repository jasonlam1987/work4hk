import apiClient from './client';
import { FileModule } from './files';
import { getAuthIdentity } from '../utils/authRole';

export type DeleteContext = {
  uid: string;
  fileName: string;
  companyName: string;
  module: FileModule;
  sectionName: string;
  folder: string;
  storedPath?: string;
};

export type DeleteRequestRecord = {
  request_id: string;
  uid: string;
  module: FileModule;
  owner_id: number;
  folder: string;
  original_name: string;
  stored_path: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requester_id: string;
  requester_name: string;
  reviewer_id?: string;
  reviewer_name?: string;
  reject_reason?: string;
  created_at: string;
  reviewed_at?: string;
};

let cachedCsrf = '';

const headersWithIdentity = async () => {
  const { roleKey, userId, userName } = getAuthIdentity();
  if (!cachedCsrf) {
    const resp = await apiClient.get('/ai/csrf');
    cachedCsrf = String(resp?.data?.csrf_token || '');
  }
  return {
    'x-user-role': roleKey || 'admin',
    'x-user-id': userId || 'unknown',
    'x-user-name': userName || 'unknown',
    'x-csrf-token': cachedCsrf,
  };
};

export const permanentDeleteFile = async (uid: string, confirmText: string) => {
  const res = await apiClient.post(
    '/ai/files-delete',
    { uid, confirm_text: confirmText },
    { headers: await headersWithIdentity() }
  );
  return res.data;
};

export const requestDeleteFile = async (ctx: DeleteContext, reason: string) => {
  const res = await apiClient.post(
    '/ai/files-delete-request',
    {
      uid: ctx.uid,
      reason,
      company_name: ctx.companyName,
      section_name: ctx.sectionName,
    },
    { headers: await headersWithIdentity() }
  );
  return res.data;
};

export const listDeleteRequests = async () => {
  const res = await apiClient.get<{ items: DeleteRequestRecord[] }>('/ai/files-delete-requests', {
    headers: await headersWithIdentity(),
  });
  return Array.isArray(res?.data?.items) ? res.data.items : [];
};

export const reviewDeleteRequest = async (
  requestId: string,
  action: 'APPROVE' | 'REJECT',
  rejectReason?: string
) => {
  const res = await apiClient.post(
    '/ai/files-delete-review',
    {
      request_id: requestId,
      action,
      reject_reason: rejectReason || '',
    },
    { headers: await headersWithIdentity() }
  );
  return res.data;
};
