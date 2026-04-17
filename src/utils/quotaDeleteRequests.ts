import { appendGlobalAuditLog } from './auditLog';
import { getAuthIdentity } from './authRole';

const QUOTA_APP_CACHE_KEY = 'quota_application_records_v1';
const QUOTA_DELETE_HISTORY_KEY = 'quota_delete_request_history_v1';

export type QuotaDeleteRequestRecord = {
  request_id: string;
  quota_id: string;
  approval_no: string;
  company_name: string;
  requester_id: string;
  requester_name: string;
  created_at: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
};

type QuotaDeleteHistoryRecord = QuotaDeleteRequestRecord & {
  reviewed_at?: string;
  reviewed_by_id?: string;
  reviewed_by_name?: string;
};

type QuotaRecordLike = {
  id: string;
  application_no?: string;
  employer_name_cn?: string;
  employer_name_en?: string;
  delete_request?: {
    status: 'pending' | 'approved' | 'rejected';
    reason: string;
    requested_by_id: string;
    requested_by_name: string;
    requested_at: string;
    reviewed_by_id?: string;
    reviewed_by_name?: string;
    reviewed_at?: string;
  };
};

const readQuotaRecords = (): QuotaRecordLike[] => {
  try {
    const raw = localStorage.getItem(QUOTA_APP_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as QuotaRecordLike[]) : [];
  } catch {
    return [];
  }
};

const writeQuotaRecords = (rows: QuotaRecordLike[]) => {
  localStorage.setItem(QUOTA_APP_CACHE_KEY, JSON.stringify(rows));
};

const readQuotaDeleteHistory = (): QuotaDeleteHistoryRecord[] => {
  try {
    const raw = localStorage.getItem(QUOTA_DELETE_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as QuotaDeleteHistoryRecord[]) : [];
  } catch {
    return [];
  }
};

const writeQuotaDeleteHistory = (rows: QuotaDeleteHistoryRecord[]) => {
  localStorage.setItem(QUOTA_DELETE_HISTORY_KEY, JSON.stringify(rows));
};

const upsertQuotaDeleteHistory = (record: QuotaDeleteHistoryRecord) => {
  const rows = readQuotaDeleteHistory();
  const idx = rows.findIndex((x) => x.request_id === record.request_id);
  if (idx >= 0) rows[idx] = record;
  else rows.unshift(record);
  writeQuotaDeleteHistory(rows);
};

export const listQuotaDeleteRequests = (): QuotaDeleteRequestRecord[] => {
  const rows = readQuotaRecords();
  const active = rows
    .filter((x) => x.delete_request)
    .map((x): QuotaDeleteRequestRecord => {
      const req = x.delete_request!;
      return {
        request_id: `quota-del-${x.id}`,
        quota_id: x.id,
        approval_no: String(x.application_no || ''),
        company_name: String(x.employer_name_cn || x.employer_name_en || ''),
        requester_id: String(req.requested_by_id || ''),
        requester_name: String(req.requested_by_name || ''),
        created_at: String(req.requested_at || ''),
        reason: String(req.reason || ''),
        status: req.status === 'pending' ? 'PENDING' : req.status === 'approved' ? 'APPROVED' : 'REJECTED',
      };
    });
  const history = readQuotaDeleteHistory();
  const merged = [...active, ...history];
  const uniqueByRequestId = new Map<string, QuotaDeleteRequestRecord>();
  for (const row of merged) {
    const id = String(row.request_id || '').trim();
    if (!id) continue;
    if (!uniqueByRequestId.has(id)) uniqueByRequestId.set(id, row);
  }
  return Array.from(uniqueByRequestId.values()).sort((a, b) =>
    String(b.created_at).localeCompare(String(a.created_at))
  );
};

export const reviewQuotaDeleteRequest = (requestId: string, decision: 'APPROVE' | 'REJECT') => {
  const quotaId = String(requestId || '').replace(/^quota-del-/, '');
  const rows = readQuotaRecords();
  const idx = rows.findIndex((r) => String(r.id) === quotaId);
  if (idx < 0) throw new Error('配額刪除申請不存在');

  const target = rows[idx];
  const identity = getAuthIdentity();
  const now = new Date().toISOString();

  if (decision === 'APPROVE') {
    const req = target.delete_request;
    upsertQuotaDeleteHistory({
      request_id: `quota-del-${target.id}`,
      quota_id: quotaId,
      approval_no: String(target.application_no || ''),
      company_name: String(target.employer_name_cn || target.employer_name_en || ''),
      requester_id: String(req?.requested_by_id || ''),
      requester_name: String(req?.requested_by_name || ''),
      created_at: String(req?.requested_at || now),
      reason: String(req?.reason || ''),
      status: 'APPROVED',
      reviewed_at: now,
      reviewed_by_id: identity.userId || 'unknown',
      reviewed_by_name: identity.userName || '未設定',
    });
    rows.splice(idx, 1);
    writeQuotaRecords(rows);
    appendGlobalAuditLog({
      module: 'quota-applications',
      action: 'delete_review',
      record_id: quotaId,
      record_no: target.application_no || '',
      details: `超管允許刪除申請並完成刪除`,
    });
    return { ok: true, status: 'APPROVED' as const };
  }

  rows[idx] = {
    ...target,
    delete_request: {
      ...(target.delete_request || ({} as any)),
      status: 'rejected',
      reviewed_by_id: identity.userId || 'unknown',
      reviewed_by_name: identity.userName || '未設定',
      reviewed_at: now,
    },
  };
  writeQuotaRecords(rows);
  appendGlobalAuditLog({
    module: 'quota-applications',
    action: 'delete_review',
    record_id: quotaId,
    record_no: target.application_no || '',
    details: `超管拒絕刪除申請`,
  });
  return { ok: true, status: 'REJECTED' as const };
};

export const pruneCompletedQuotaDeleteRequests = () => {
  const rows = readQuotaRecords();
  let removed = 0;
  const keptPending: QuotaRecordLike[] = rows.map((row) => {
    const req = row.delete_request;
    if (!req) return row;
    if (req.status === 'pending') return row;
    removed += 1;
    return { ...row, delete_request: undefined };
  });
  writeQuotaRecords(keptPending);

  const history = readQuotaDeleteHistory();
  const keptHistory = history.filter((row) => row.status === 'PENDING');
  removed += history.length - keptHistory.length;
  writeQuotaDeleteHistory(keptHistory);

  const pendingFromRows = keptPending.filter((row) => row.delete_request?.status === 'pending').length;
  const pendingFromHistory = keptHistory.length;
  return {
    ok: true,
    removed,
    kept_pending: pendingFromRows + pendingFromHistory,
  };
};
