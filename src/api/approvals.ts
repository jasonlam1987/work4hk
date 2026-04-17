import apiClient from './client';
import { appendGlobalAuditLog } from '../utils/auditLog';

export interface Approval {
  id: number;
  employer_id: number;
  employer_name?: string;
  partner_id: number;
  partner_name?: string;
  approval_number: string;
  department?: '勞工處' | '發展局' | '機管局' | '福利處' | '運輸署' | string;
  issue_date?: string;
  expiry_date?: string;
  signatory_name?: string;
  quota_details?: QuotaDetail[];
  quota_quantity?: number;
  [key: string]: any;
}

export type ApprovalCreate = Partial<Omit<Approval, 'id' | 'employer_name' | 'employer_code' | 'partner_name' | 'created_at' | 'updated_at'>>;

export type QuotaDetail = {
  quota_seq: string;
  work_location: string;
  work_locations?: string[];
  job_title: string;
  monthly_salary: number;
  work_hours: string;
  employment_months: number;
};

export type ApprovalReminder = {
  id: string;
  approval_id: number;
  approval_number: string;
  company_name: string;
  window_days: 180 | 90 | 30;
  expiry_date: string;
  message: string;
  status: 'unread' | 'read';
  created_at: string;
  updated_at: string;
};

export type ApprovalVersionLog = {
  id: string;
  approval_id: number;
  action: 'department_changed' | 'quota_deleted';
  detail: string;
  operator: string;
  created_at: string;
};

const MOCK_STORAGE_KEY = 'mock_approvals';
const QUOTA_STORAGE_KEY = 'approval_quota_details_v1';
const VERSION_STORAGE_KEY = 'approval_versions_v1';
const REMINDER_STORAGE_KEY = 'approval_reminders_v1';
const ENABLE_MOCK_APPROVALS = import.meta.env.DEV;
export const DEPARTMENT_OPTIONS = ['勞工處', '發展局', '機管局', '福利處', '運輸署'] as const;

const normalizeDate = (v?: any) => {
  const s = String(v || '').trim();
  if (!s) return '';
  const base = s.includes('T') ? s.split('T')[0] : s;
  return /^\d{4}\/\d{2}\/\d{2}$/.test(base) ? base.replace(/\//g, '-') : base;
};

const calcExpiryDate = (issueDate: string) => {
  const d = new Date(issueDate);
  if (Number.isNaN(d.getTime())) return '';
  const exp = new Date(d);
  exp.setMonth(exp.getMonth() + 12);
  return exp.toISOString().slice(0, 10);
};

const readQuotaMap = (): Record<string, QuotaDetail[]> => {
  try {
    const raw = localStorage.getItem(QUOTA_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeQuotaMap = (map: Record<string, QuotaDetail[]>) => {
  localStorage.setItem(QUOTA_STORAGE_KEY, JSON.stringify(map));
};

const clearApprovalQuotaDetails = (approvalId: number) => {
  const map = readQuotaMap();
  delete map[String(approvalId)];
  writeQuotaMap(map);
};

export const getApprovalQuotaDetails = (approvalId: number): QuotaDetail[] => {
  const map = readQuotaMap();
  const list = Array.isArray(map[String(approvalId)]) ? map[String(approvalId)] : [];
  return list.map((q: any) => {
    const locations = Array.isArray(q?.work_locations)
      ? q.work_locations.map((x: any) => String(x || '').trim()).filter(Boolean).slice(0, 3)
      : String(q?.work_location || '')
          .split('|')
          .map((x: any) => String(x || '').trim())
          .filter(Boolean)
          .slice(0, 3);
    return {
      ...q,
      work_location: locations[0] || String(q?.work_location || '').trim(),
      work_locations: locations,
    } as QuotaDetail;
  });
};

export const getApprovalQuotaMap = (): Record<string, QuotaDetail[]> => {
  const map = readQuotaMap();
  const out: Record<string, QuotaDetail[]> = {};
  for (const [approvalId, list] of Object.entries(map)) {
    const safeList = Array.isArray(list) ? list : [];
    out[approvalId] = safeList.map((q: any) => {
      const locations = Array.isArray(q?.work_locations)
        ? q.work_locations.map((x: any) => String(x || '').trim()).filter(Boolean).slice(0, 3)
        : String(q?.work_location || '')
            .split('|')
            .map((x: any) => String(x || '').trim())
            .filter(Boolean)
            .slice(0, 3);
      return {
        ...q,
        work_location: locations[0] || String(q?.work_location || '').trim(),
        work_locations: locations,
      } as QuotaDetail;
    });
  }
  return out;
};

export const setApprovalQuotaDetails = (approvalId: number, details: QuotaDetail[]) => {
  const map = readQuotaMap();
  map[String(approvalId)] = details.map((q: any) => {
    const locations = Array.isArray(q?.work_locations)
      ? q.work_locations.map((x: any) => String(x || '').trim()).filter(Boolean).slice(0, 3)
      : String(q?.work_location || '')
          .split('|')
          .map((x: any) => String(x || '').trim())
          .filter(Boolean)
          .slice(0, 3);
    return {
      ...q,
      work_location: locations[0] || '',
      work_locations: locations,
    };
  });
  writeQuotaMap(map);
};

const readVersionLogs = (): ApprovalVersionLog[] => {
  try {
    const raw = localStorage.getItem(VERSION_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeVersionLogs = (items: ApprovalVersionLog[]) => {
  localStorage.setItem(VERSION_STORAGE_KEY, JSON.stringify(items));
};

export const appendApprovalVersionLog = (log: Omit<ApprovalVersionLog, 'id' | 'created_at'>) => {
  const list = readVersionLogs();
  list.unshift({
    ...log,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
  });
  writeVersionLogs(list.slice(0, 1000));
};

export const getApprovalVersionLogs = (approvalId: number) => {
  return readVersionLogs().filter(x => x.approval_id === approvalId);
};

export const getApprovalReminders = (): ApprovalReminder[] => {
  try {
    const raw = localStorage.getItem(REMINDER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const setApprovalReminders = (items: ApprovalReminder[]) => {
  localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(items));
};

export const markApprovalReminderRead = (id: string) => {
  const list = getApprovalReminders().map(r => (r.id === id ? { ...r, status: 'read' as const, updated_at: new Date().toISOString() } : r));
  setApprovalReminders(list);
};

export const reRemindApprovalReminder = (id: string) => {
  const list = getApprovalReminders().map(r => (r.id === id ? { ...r, status: 'unread' as const, updated_at: new Date().toISOString() } : r));
  setApprovalReminders(list);
};

const readMockApprovals = (): Approval[] => {
  try {
    const raw = localStorage.getItem(MOCK_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? (parsed as Approval[]) : [];
    return list.map(a => {
      const issue = normalizeDate((a as any).issue_date);
      const expiry = normalizeDate((a as any).expiry_date) || (issue ? calcExpiryDate(issue) : '');
      return {
        ...a,
        issue_date: issue || undefined,
        expiry_date: expiry || undefined,
      };
    });
  } catch {
    return [];
  }
};

const writeMockApprovals = (items: Approval[]) => {
  const normalized = items.map(a => {
    const issue = normalizeDate((a as any).issue_date);
    const expiry = normalizeDate((a as any).expiry_date) || (issue ? calcExpiryDate(issue) : '');
    return {
      ...a,
      issue_date: issue || undefined,
      expiry_date: expiry || undefined,
    };
  });
  localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(normalized));
};

const shouldFallbackToMock = (err: any, allowProd = false) => {
  const status = err?.response?.status as number | undefined;
  return status === 500 && (ENABLE_MOCK_APPROVALS || allowProd);
};

export const getApprovals = async (params?: { q?: string; limit?: number; offset?: number }) => {
  const cleanedParams: { q?: string; limit?: number; offset?: number } = {};
  if (params?.q && params.q.trim()) cleanedParams.q = params.q.trim();
  if (typeof params?.limit === 'number') cleanedParams.limit = params.limit;
  if (typeof params?.offset === 'number') cleanedParams.offset = params.offset;

  try {
    const response = await apiClient.get<Approval[]>('/approvals', {
      params: cleanedParams,
      timeout: 30000,
    });
    const serverListRaw = Array.isArray(response.data) ? response.data : [];
    const serverList: Approval[] = serverListRaw.map((a: any) => {
      const issue = normalizeDate((a as any).issue_date);
      const expiry = normalizeDate((a as any).expiry_date) || normalizeDate((a as any).valid_until) || (issue ? calcExpiryDate(issue) : '');
      const quotaQuantity = Array.isArray((a as any).quota_details) ? (a as any).quota_details.length : undefined;
      return {
        ...a,
        issue_date: issue || undefined,
        expiry_date: expiry || undefined,
        quota_quantity: quotaQuantity,
      } as Approval;
    });
    if (!ENABLE_MOCK_APPROVALS) {
      const q = (cleanedParams.q || '').toLowerCase();
      if (!q) return serverList;
      return serverList.filter(a => String(a.approval_number || '').toLowerCase().includes(q));
    }

    const mockList = readMockApprovals();

    const serverKeys = new Set(
      serverList
        .map(a => String(a.approval_number || '').trim().toLowerCase())
        .filter(Boolean)
    );

    const merged = [...serverList];
    for (const m of mockList) {
      const key = String(m.approval_number || '').trim().toLowerCase();
      if (!key) continue;
      if (serverKeys.has(key)) continue;
      merged.push(m);
    }

    const q = (cleanedParams.q || '').toLowerCase();
    if (!q) return merged;
    return merged.filter(a => (String(a.approval_number || '').toLowerCase().includes(q)));
  } catch (err: any) {
    if (!shouldFallbackToMock(err, true)) throw err;

    const list = readMockApprovals();
    const q = (cleanedParams.q || '').toLowerCase();
    const filtered = q
      ? list.filter(a => (a.approval_number || '').toLowerCase().includes(q))
      : list;
    return filtered;
  }
};

export const createApproval = async (data: ApprovalCreate) => {
  const normalizedIssue = normalizeDate((data as any).issue_date);
  const normalizedDepartment = String((data as any).department || '勞工處').trim();
  const normalizedPayload: ApprovalCreate = {
    ...data,
    department: DEPARTMENT_OPTIONS.includes(normalizedDepartment as any) ? normalizedDepartment : '勞工處',
    issue_date: normalizedIssue || undefined,
    expiry_date: normalizedIssue ? calcExpiryDate(normalizedIssue) : undefined,
  };

  const buildMock = () => {
    const list = readMockApprovals();
    const nextId = list.length > 0 ? Math.max(...list.map(a => a.id || 0)) + 1 : 1;
    const item: Approval = {
      id: nextId,
      employer_id: Number(normalizedPayload.employer_id),
      partner_id: Number(normalizedPayload.partner_id),
      approval_number: String(normalizedPayload.approval_number || ''),
      department: normalizedPayload.department as any,
      issue_date: normalizedPayload.issue_date as any,
      expiry_date: normalizedPayload.expiry_date as any,
      signatory_name: normalizedPayload.signatory_name as any,
      __localOnly: true,
    };
    const next = [item, ...list];
    writeMockApprovals(next);
    return item;
  };

  try {
    const response = await apiClient.post<Approval>('/approvals', normalizedPayload);
    appendGlobalAuditLog({
      module: 'approvals',
      action: 'create',
      record_id: String(response.data?.id || ''),
      record_no: String(response.data?.approval_number || normalizedPayload.approval_number || ''),
      details: `創建批文：${response.data?.approval_number || '-'}`,
    });
    return response.data;
  } catch (err: any) {
    const status = err?.response?.status as number | undefined;
    if (status !== 500) throw err;

    const retryPayloads: ApprovalCreate[] = [
      normalizedPayload,
      {
        employer_id: normalizedPayload.employer_id,
        partner_id: normalizedPayload.partner_id,
        approval_number: normalizedPayload.approval_number,
        department: normalizedPayload.department,
        issue_date: normalizedPayload.issue_date,
        expiry_date: normalizedPayload.expiry_date,
      },
      { employer_id: normalizedPayload.employer_id, partner_id: normalizedPayload.partner_id, approval_number: normalizedPayload.approval_number },
    ];

    for (const p of retryPayloads) {
      try {
        const response = await apiClient.post<Approval>('/approvals', p);
        appendGlobalAuditLog({
          module: 'approvals',
          action: 'create',
          record_id: String(response.data?.id || ''),
          record_no: String(response.data?.approval_number || p.approval_number || ''),
          details: `創建批文（重試成功）：${response.data?.approval_number || '-'}`,
        });
        return response.data;
      } catch (e: any) {
        const s = e?.response?.status as number | undefined;
        if (s !== 500) throw e;
      }
    }

    if (!shouldFallbackToMock(err, true)) throw err;
    return buildMock();
  }
};

export const updateApproval = async (id: number, data: Partial<ApprovalCreate>) => {
  const nextData: Partial<ApprovalCreate> = { ...data };
  if ((data as any).department !== undefined) {
    const dept = String((data as any).department || '').trim();
    (nextData as any).department = DEPARTMENT_OPTIONS.includes(dept as any) ? dept : '勞工處';
  }
  if ((data as any).issue_date !== undefined) {
    const issue = normalizeDate((data as any).issue_date);
    (nextData as any).issue_date = issue || undefined;
    (nextData as any).expiry_date = issue ? calcExpiryDate(issue) : undefined;
  }
  try {
    const response = await apiClient.patch<Approval>(`/approvals/${id}`, nextData);
    appendGlobalAuditLog({
      module: 'approvals',
      action: 'update',
      record_id: String(id),
      record_no: String(response.data?.approval_number || ''),
      details: `更新批文：${response.data?.approval_number || id}`,
    });
    return response.data;
  } catch (err: any) {
    const status = err?.response?.status as number | undefined;

    if (!ENABLE_MOCK_APPROVALS) throw err;

    if (status === 404) {
      const list = readMockApprovals();
      const idx = list.findIndex(a => a.id === id);

      const base: Approval =
        idx >= 0
          ? list[idx]
          : {
              id,
              employer_id: Number((nextData as any)?.employer_id || 0),
              partner_id: Number((nextData as any)?.partner_id || 0),
              approval_number: String((nextData as any)?.approval_number || ''),
            };

      const updated: Approval = { ...base, ...(nextData as any) };
      const next = idx >= 0 ? [...list] : [updated, ...list];
      if (idx >= 0) next[idx] = updated;
      writeMockApprovals(next);
      appendGlobalAuditLog({
        module: 'approvals',
        action: 'update',
        record_id: String(id),
        record_no: String(updated?.approval_number || ''),
        details: `更新批文（本機mock）：${updated?.approval_number || id}`,
      });
      return updated;
    }

    if (!shouldFallbackToMock(err)) throw err;

    const list = readMockApprovals();
    const idx = list.findIndex(a => a.id === id);
    if (idx === -1) throw err;
    const updated: Approval = { ...list[idx], ...(nextData as any) };
    const next = [...list];
    next[idx] = updated;
    writeMockApprovals(next);
    appendGlobalAuditLog({
      module: 'approvals',
      action: 'update',
      record_id: String(id),
      record_no: String(updated?.approval_number || ''),
      details: `更新批文（回退）：${updated?.approval_number || id}`,
    });
    return updated;
  }
};

export const deleteApproval = async (id: number) => {
  try {
    const response = await apiClient.delete(`/approvals/${id}`);
    clearApprovalQuotaDetails(id);
    appendGlobalAuditLog({
      module: 'approvals',
      action: 'delete',
      record_id: String(id),
      details: `刪除批文 id=${id}`,
    });
    return response.data;
  } catch (err: any) {
    const status = err?.response?.status as number | undefined;

    if (!ENABLE_MOCK_APPROVALS) throw err;

    // 後端回 404 代表資料已不存在：視為刪除成功，並同步清理本機 mock（避免畫面殘留）
    if (status === 404) {
      const list = readMockApprovals();
      const next = list.filter(a => a.id !== id);
      writeMockApprovals(next);
      clearApprovalQuotaDetails(id);
      appendGlobalAuditLog({
        module: 'approvals',
        action: 'delete',
        record_id: String(id),
        details: `刪除批文（已不存在，視作成功） id=${id}`,
      });
      return { ok: true, alreadyDeleted: true };
    }

    if (!shouldFallbackToMock(err)) throw err;

    const list = readMockApprovals();
    const next = list.filter(a => a.id !== id);
    writeMockApprovals(next);
    clearApprovalQuotaDetails(id);
    appendGlobalAuditLog({
      module: 'approvals',
      action: 'delete',
      record_id: String(id),
      details: `刪除批文（回退） id=${id}`,
    });
    return { ok: true };
  }
};
