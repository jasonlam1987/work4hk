import { deleteApproval } from '../api/approvals';
import { deleteEmployer } from '../api/employers';
import { deleteWorker } from '../api/workers';
import { appendGlobalAuditLog } from './auditLog';
import { getAuthIdentity } from './authRole';
import { pushInAppMessage } from './inAppMessages';
import { pushDeleteNotice } from './deleteNotifications';

const ENTITY_DELETE_REQUESTS_KEY = 'entity_delete_requests_v1';

export type EntityDeleteModule = 'approvals' | 'employers' | 'workers';

export type EntityDeleteRequestRecord = {
  request_id: string;
  module: EntityDeleteModule;
  entity_id: number;
  record_no: string;
  company_name: string;
  requester_id: string;
  requester_name: string;
  created_at: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewer_id?: string;
  reviewer_name?: string;
  reviewed_at?: string;
};

type SubmitEntityDeleteInput = {
  module: EntityDeleteModule;
  entityId: number;
  recordNo: string;
  companyName: string;
  reason: string;
};

const readRows = (): EntityDeleteRequestRecord[] => {
  try {
    const raw = localStorage.getItem(ENTITY_DELETE_REQUESTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as EntityDeleteRequestRecord[]) : [];
  } catch {
    return [];
  }
};

const writeRows = (rows: EntityDeleteRequestRecord[]) => {
  localStorage.setItem(ENTITY_DELETE_REQUESTS_KEY, JSON.stringify(rows));
};

export const listEntityDeleteRequests = (): EntityDeleteRequestRecord[] => {
  return readRows().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
};

export const pruneCompletedEntityDeleteRequests = () => {
  const rows = readRows();
  const keepPending = rows.filter((row) => row.status === 'PENDING');
  const removed = rows.length - keepPending.length;
  writeRows(keepPending);
  return {
    ok: true,
    removed,
    kept_pending: keepPending.length,
  };
};

export const submitEntityDeleteRequest = (input: SubmitEntityDeleteInput) => {
  const identity = getAuthIdentity();
  const rows = readRows();
  const module = input.module;
  const entityId = Number(input.entityId || 0);
  const reason = String(input.reason || '').trim();
  if (!entityId) throw new Error('目標記錄不存在');
  if (!reason) throw new Error('請填寫刪除理由');

  const existingPending = rows.find(
    (row) => row.module === module && Number(row.entity_id) === entityId && row.status === 'PENDING'
  );
  if (existingPending) {
    return {
      ok: true,
      code: 'DELETE_REQUEST_ALREADY_PENDING' as const,
      message: '已提交刪除申請，等待超級管理員審批',
      request: existingPending,
    };
  }

  const created: EntityDeleteRequestRecord = {
    request_id: `entity-del-${module}-${entityId}-${Date.now()}`,
    module,
    entity_id: entityId,
    record_no: String(input.recordNo || '').trim(),
    company_name: String(input.companyName || '').trim(),
    requester_id: identity.userId || 'unknown',
    requester_name: identity.userName || '未設定',
    created_at: new Date().toISOString(),
    reason,
    status: 'PENDING',
  };
  writeRows([created, ...rows]);

  appendGlobalAuditLog({
    module,
    action: 'delete_request',
    record_id: String(entityId),
    record_no: created.record_no,
    details: `提交刪除申請：${reason}`,
  });
  pushInAppMessage({
    kind: 'generic',
    title: '新刪除申請待審批',
    content: `${module === 'approvals' ? '批文' : module === 'employers' ? '僱主' : '勞工'}刪除申請：${created.company_name || created.record_no || '-'}（原因：${reason}）`,
    recipientRoleKey: 'super_admin',
  });
  pushDeleteNotice({
    at: Date.now(),
    message: '有新的刪除申請待審批',
    uid: created.request_id,
    module,
  });

  return {
    ok: true,
    message: '已提交刪除申請，等待超級管理員審批',
    request: created,
  };
};

export const reviewEntityDeleteRequest = async (
  requestId: string,
  decision: 'APPROVE' | 'REJECT'
) => {
  const rows = readRows();
  const idx = rows.findIndex((row) => row.request_id === requestId);
  if (idx < 0) throw new Error('刪除申請不存在');

  const row = rows[idx];
  const identity = getAuthIdentity();
  const reviewedAt = new Date().toISOString();

  if (decision === 'APPROVE') {
    if (row.module === 'approvals') {
      await deleteApproval(Number(row.entity_id));
    } else if (row.module === 'employers') {
      await deleteEmployer(Number(row.entity_id));
    } else {
      await deleteWorker(Number(row.entity_id));
    }
    rows[idx] = {
      ...row,
      status: 'APPROVED',
      reviewer_id: identity.userId || 'unknown',
      reviewer_name: identity.userName || '未設定',
      reviewed_at: reviewedAt,
    };
    writeRows(rows);
    appendGlobalAuditLog({
      module: row.module,
      action: 'delete_review',
      record_id: String(row.entity_id),
      record_no: row.record_no,
      details: '超管允許刪除申請並完成刪除',
    });
    return { ok: true, status: 'APPROVED' as const };
  }

  rows[idx] = {
    ...row,
    status: 'REJECTED',
    reviewer_id: identity.userId || 'unknown',
    reviewer_name: identity.userName || '未設定',
    reviewed_at: reviewedAt,
  };
  writeRows(rows);
  appendGlobalAuditLog({
    module: row.module,
    action: 'delete_review',
    record_id: String(row.entity_id),
    record_no: row.record_no,
    details: '超管拒絕刪除申請',
  });
  return { ok: true, status: 'REJECTED' as const };
};
