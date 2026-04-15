import apiClient from './client';

export interface Approval {
  id: number;
  employer_id: number;
  employer_name?: string;
  partner_id: number;
  partner_name?: string;
  approval_number: string;
  department?: string;
  issue_date?: string;
  valid_until?: string;
  headcount?: number;
  signatory_name?: string;
  [key: string]: any;
}

export type ApprovalCreate = Partial<Omit<Approval, 'id' | 'employer_name' | 'employer_code' | 'partner_name' | 'created_at' | 'updated_at'>>;

const MOCK_STORAGE_KEY = 'mock_approvals';
const ENABLE_MOCK_APPROVALS = import.meta.env.DEV;

const readMockApprovals = (): Approval[] => {
  try {
    const raw = localStorage.getItem(MOCK_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Approval[]) : [];
  } catch {
    return [];
  }
};

const writeMockApprovals = (items: Approval[]) => {
  localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(items));
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
    const serverList = Array.isArray(response.data) ? response.data : [];
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
  const buildMock = () => {
    const list = readMockApprovals();
    const nextId = list.length > 0 ? Math.max(...list.map(a => a.id || 0)) + 1 : 1;
    const item: Approval = {
      id: nextId,
      employer_id: Number(data.employer_id),
      partner_id: Number(data.partner_id),
      approval_number: String(data.approval_number || ''),
      department: data.department as any,
      issue_date: data.issue_date as any,
      valid_until: data.valid_until as any,
      headcount: typeof data.headcount === 'number' ? data.headcount : undefined,
      signatory_name: data.signatory_name as any,
      __localOnly: true,
    };
    const next = [item, ...list];
    writeMockApprovals(next);
    return item;
  };

  try {
    const response = await apiClient.post<Approval>('/approvals', data);
    return response.data;
  } catch (err: any) {
    const status = err?.response?.status as number | undefined;
    if (status !== 500) throw err;

    const retryPayloads: ApprovalCreate[] = [
      {
        employer_id: data.employer_id,
        partner_id: data.partner_id,
        approval_number: data.approval_number,
        department: data.department,
        headcount: data.headcount,
        signatory_name: data.signatory_name,
      },
      {
        employer_id: data.employer_id,
        partner_id: data.partner_id,
        approval_number: data.approval_number,
        headcount: typeof data.headcount === 'number' ? data.headcount : 0,
      },
      {
        employer_id: data.employer_id,
        partner_id: data.partner_id,
        approval_number: data.approval_number,
      },
    ];

    for (const p of retryPayloads) {
      try {
        const response = await apiClient.post<Approval>('/approvals', p);
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
  try {
    const response = await apiClient.patch<Approval>(`/approvals/${id}`, data);
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
              employer_id: Number((data as any)?.employer_id || 0),
              partner_id: Number((data as any)?.partner_id || 0),
              approval_number: String((data as any)?.approval_number || ''),
            };

      const updated: Approval = { ...base, ...(data as any) };
      const next = idx >= 0 ? [...list] : [updated, ...list];
      if (idx >= 0) next[idx] = updated;
      writeMockApprovals(next);
      return updated;
    }

    if (!shouldFallbackToMock(err)) throw err;

    const list = readMockApprovals();
    const idx = list.findIndex(a => a.id === id);
    if (idx === -1) throw err;
    const updated: Approval = { ...list[idx], ...(data as any) };
    const next = [...list];
    next[idx] = updated;
    writeMockApprovals(next);
    return updated;
  }
};

export const deleteApproval = async (id: number) => {
  try {
    const response = await apiClient.delete(`/approvals/${id}`);
    return response.data;
  } catch (err: any) {
    const status = err?.response?.status as number | undefined;

    if (!ENABLE_MOCK_APPROVALS) throw err;

    // 後端回 404 代表資料已不存在：視為刪除成功，並同步清理本機 mock（避免畫面殘留）
    if (status === 404) {
      const list = readMockApprovals();
      const next = list.filter(a => a.id !== id);
      writeMockApprovals(next);
      return { ok: true, alreadyDeleted: true };
    }

    if (!shouldFallbackToMock(err)) throw err;

    const list = readMockApprovals();
    const next = list.filter(a => a.id !== id);
    writeMockApprovals(next);
    return { ok: true };
  }
};
