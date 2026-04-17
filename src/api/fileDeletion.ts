import apiClient from './client';
import { FileModule } from './files';
import { getAuthIdentity } from '../utils/authRole';

export type DeleteContext = {
  uid: string;
  fileName: string;
  companyName: string;
  module: FileModule;
  ownerId?: number;
  sectionName: string;
  folder: string;
  storedPath?: string;
  objectPath?: string;
  uploaderId?: string;
  uploaderName?: string;
};

export type DeleteRequestRecord = {
  request_id: string;
  approval_no?: string;
  uid: string;
  request_type?: 'DELETE_ATTACHMENT';
  module: FileModule;
  owner_id: number;
  folder: string;
  section_name?: string;
  company_name?: string;
  original_name: string;
  stored_path: string;
  storage_object_path?: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requester_id: string;
  requester_account?: string;
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
  const safeUserName = encodeURIComponent(String(userName || 'unknown'));
  if (!cachedCsrf) {
    const resp = await apiClient.get('/ai/csrf');
    cachedCsrf = String(resp?.data?.csrf_token || '');
  }
  return {
    'x-user-role': roleKey || 'admin',
    'x-user-id': userId || 'unknown',
    'x-user-name': safeUserName,
    'x-csrf-token': cachedCsrf,
  };
};

const objectPathFromContext = (ctx?: DeleteContext | null) => {
  const direct = String(ctx?.objectPath || '').trim();
  if (direct) return direct;
  const raw = String(ctx?.storedPath || '').trim();
  if (raw.startsWith('supabase://')) return raw.slice('supabase://'.length);
  return '';
};

export const permanentDeleteFile = async (uid: string, confirmText: string, context?: DeleteContext | null) => {
  const headers = await headersWithIdentity();
  const objectPath = objectPathFromContext(context);
  if (objectPath) {
    const res = await apiClient.delete('/ai/files', {
      data: { object_path: objectPath },
      headers,
    });
    return res.data;
  }
  const res = await apiClient.post('/ai/files-delete', { uid, confirm_text: confirmText }, { headers });
  return res.data;
};

export const requestDeleteFile = async (ctx: DeleteContext, reason: string) => {
  try {
    const res = await apiClient.post(
      '/ai/files-delete-request',
      {
        uid: ctx.uid,
        module: ctx.module,
        owner_id: Number(ctx.ownerId || 0),
        folder: ctx.folder,
        file_name: ctx.fileName,
        stored_path: ctx.storedPath || '',
        object_path: objectPathFromContext(ctx),
        uploader_id: ctx.uploaderId || '',
        uploader_name: ctx.uploaderName || '',
        reason,
        company_name: ctx.companyName,
        section_name: ctx.sectionName,
      },
      { headers: await headersWithIdentity() }
    );
    return res.data;
  } catch (err: any) {
    const status = Number(err?.response?.status || 0);
    const code = String(err?.response?.data?.code || '');
    if (status === 409 && code === 'DUPLICATE_PENDING_REQUEST') {
      return {
        ok: true,
        code: 'DELETE_REQUEST_ALREADY_PENDING',
        message: '已向超級管理員申請刪除，待批准後將自動刪除',
      };
    }
    throw err;
  }
};

export const listDeleteRequests = async () => {
  const res = await apiClient.get<{ items: DeleteRequestRecord[] }>('/ai/files-delete-requests', {
    headers: await headersWithIdentity(),
  });
  return Array.isArray(res?.data?.items) ? res.data.items : [];
};

export const pruneCompletedDeleteRequests = async () => {
  const res = await apiClient.post('/ai/files-delete-requests-prune', {}, {
    headers: await headersWithIdentity(),
  });
  return res.data;
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
