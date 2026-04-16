import { randomUUID } from 'node:crypto';
import {
  downloadFromSupabaseStorage,
  isSupabaseStorageEnabled,
  listSupabaseStorageByPrefix,
  uploadToSupabaseStorage,
} from './_supabase_storage.js';

export type DeleteRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type StoredDeleteRequest = {
  request_id: string;
  uid: string;
  request_type?: 'DELETE_ATTACHMENT';
  module: 'employers' | 'approvals' | 'workers';
  owner_id: number;
  folder: string;
  section_name?: string;
  company_name?: string;
  original_name: string;
  stored_path: string;
  storage_object_path?: string;
  reason: string;
  status: DeleteRequestStatus;
  requester_id: string;
  requester_account?: string;
  requester_name: string;
  reviewer_id?: string;
  reviewer_name?: string;
  reject_reason?: string;
  created_at: string;
  reviewed_at?: string;
};

const REQUEST_PREFIX = '__delete_requests__/v1/';

const objectPath = (requestId: string) => `${REQUEST_PREFIX}${requestId}.json`;

const normalize = (row: any): StoredDeleteRequest | null => {
  if (!row || typeof row !== 'object') return null;
  const requestId = String(row.request_id || '').trim();
  if (!requestId) return null;
  return {
    request_id: requestId,
    uid: String(row.uid || '').trim(),
    request_type: 'DELETE_ATTACHMENT',
    module: String(row.module || '') as any,
    owner_id: Number(row.owner_id || 0),
    folder: String(row.folder || '').trim(),
    section_name: String(row.section_name || '').trim(),
    company_name: String(row.company_name || '').trim(),
    original_name: String(row.original_name || '').trim(),
    stored_path: String(row.stored_path || '').trim(),
    storage_object_path: String(row.storage_object_path || '').trim(),
    reason: String(row.reason || '').trim(),
    status: String(row.status || 'PENDING').toUpperCase() as DeleteRequestStatus,
    requester_id: String(row.requester_id || '').trim(),
    requester_account: String(row.requester_account || row.requester_id || '').trim(),
    requester_name: String(row.requester_name || '').trim(),
    reviewer_id: String(row.reviewer_id || '').trim(),
    reviewer_name: String(row.reviewer_name || '').trim(),
    reject_reason: String(row.reject_reason || '').trim(),
    created_at: String(row.created_at || '').trim(),
    reviewed_at: String(row.reviewed_at || '').trim(),
  };
};

export const createRequestId = () => randomUUID();

export const listDeleteRequestsFromStore = async (fallbackMap?: Record<string, any>) => {
  if (!isSupabaseStorageEnabled()) {
    const local = Object.values(fallbackMap || {}).map(normalize).filter(Boolean) as StoredDeleteRequest[];
    return local.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  }
  const rows = await listSupabaseStorageByPrefix(REQUEST_PREFIX);
  const out: StoredDeleteRequest[] = [];
  for (const row of rows) {
    const name = String(row?.name || '');
    if (!name.endsWith('.json')) continue;
    const bytes = await downloadFromSupabaseStorage(`${REQUEST_PREFIX}${name}`);
    const parsed = normalize(JSON.parse(bytes.toString('utf8')));
    if (parsed) out.push(parsed);
  }
  return out.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
};

export const saveDeleteRequestToStore = async (row: StoredDeleteRequest, fallbackMap?: Record<string, any>) => {
  if (!isSupabaseStorageEnabled()) {
    if (fallbackMap) fallbackMap[row.request_id] = row;
    return;
  }
  const bytes = Buffer.from(JSON.stringify(row), 'utf8');
  await uploadToSupabaseStorage(objectPath(row.request_id), bytes, 'application/json; charset=utf-8');
};
