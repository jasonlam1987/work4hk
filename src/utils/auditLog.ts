import { getAuthIdentity } from './authRole';
import apiClient from '../api/client';

export const GLOBAL_AUDIT_LOG_KEY = 'global_audit_logs_v1';
const GLOBAL_AUDIT_PENDING_KEY = 'global_audit_logs_pending_v1';
let flushInFlight = false;

export type GlobalAuditAction =
  | 'login'
  | 'create'
  | 'update'
  | 'save'
  | 'save_draft'
  | 'save_final'
  | 'edit_continue'
  | 'delete'
  | 'delete_request'
  | 'delete_review'
  | 'view';

export type GlobalAuditLog = {
  id: string;
  at: string;
  module: 'employers' | 'quota-applications' | 'approvals' | 'workers' | 'jobs' | 'auth' | string;
  action: GlobalAuditAction;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  record_id?: string;
  record_no?: string;
  section?: string;
  details?: string;
};

type AuditLogsGetResponse = {
  items?: GlobalAuditLog[];
};

type AuditLogsPostResponse = {
  ok?: boolean;
  appended?: number;
};

const readPendingLogs = (): GlobalAuditLog[] => {
  try {
    const raw = localStorage.getItem(GLOBAL_AUDIT_PENDING_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as GlobalAuditLog[]) : [];
  } catch {
    return [];
  }
};

const writePendingLogs = (items: GlobalAuditLog[]) => {
  try {
    if (!items.length) {
      localStorage.removeItem(GLOBAL_AUDIT_PENDING_KEY);
      return;
    }
    localStorage.setItem(GLOBAL_AUDIT_PENDING_KEY, JSON.stringify(items));
  } catch {
    // keep silent to avoid blocking user actions
  }
};

const flushPendingLogs = async () => {
  if (flushInFlight) return;
  const pending = readPendingLogs();
  if (!pending.length) return;

  const identity = getAuthIdentity();
  flushInFlight = true;
  try {
    await apiClient.post<AuditLogsPostResponse>(
      '/ai/global-audit-logs',
      { items: pending },
      {
        headers: {
          'x-user-role': identity.roleKey || '',
          'x-user-id': identity.userId || '',
          'x-user-name': encodeURIComponent(identity.userName || ''),
        },
      }
    );
    writePendingLogs([]);
  } catch {
    // keep queue for next retry
  } finally {
    flushInFlight = false;
  }
};

export const readGlobalAuditLogs = async (): Promise<GlobalAuditLog[]> => {
  const identity = getAuthIdentity();
  try {
    const { data } = await apiClient.get<AuditLogsGetResponse>('/ai/global-audit-logs', {
      headers: {
        'x-user-role': identity.roleKey || '',
        'x-user-id': identity.userId || '',
        'x-user-name': encodeURIComponent(identity.userName || ''),
      },
    });
    const items = Array.isArray(data?.items) ? data.items : [];
    return items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  } catch {
    return [];
  }
};

export const appendGlobalAuditLog = (
  payload: Omit<GlobalAuditLog, 'id' | 'at' | 'actor_id' | 'actor_name' | 'actor_role'>
) => {
  const identity = getAuthIdentity();
  const nextLog: GlobalAuditLog = {
    id: `glog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    actor_id: identity.userId || 'unknown',
    actor_name: identity.userName || '未設定',
    actor_role: identity.roleKey || 'unknown',
    ...payload,
  };
  const pending = readPendingLogs();
  writePendingLogs([nextLog, ...pending].slice(0, 500));
  void flushPendingLogs();
  return nextLog;
};
