import { getAuthIdentity } from './authRole';

export const GLOBAL_AUDIT_LOG_KEY = 'global_audit_logs_v1';

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

export const readGlobalAuditLogs = (): GlobalAuditLog[] => {
  try {
    const raw = localStorage.getItem(GLOBAL_AUDIT_LOG_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as GlobalAuditLog[]) : [];
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
  const all = [nextLog, ...readGlobalAuditLogs()];
  localStorage.setItem(GLOBAL_AUDIT_LOG_KEY, JSON.stringify(all));
  return nextLog;
};
