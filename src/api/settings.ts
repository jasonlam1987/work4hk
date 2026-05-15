import apiClient from './client';
import { isDevBypassSession } from '../utils/devBypass';

export interface Agency {
  id: number;
  name: string;
  english_name?: string | null;
  short_name?: string | null;
  certificate_number?: string | null;
  manager?: string | null;
  manager_position?: string | null;
  remarks?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AgencyCreate {
  name: string;
  english_name?: string | null;
  short_name?: string | null;
  certificate_number?: string | null;
  manager?: string | null;
  manager_position?: string | null;
  remarks?: string | null;
}

export interface Recruiter {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  remarks?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface RecruiterCreate {
  name: string;
  phone?: string | null;
  email?: string | null;
  remarks?: string | null;
}

export interface Partner {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  remarks?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface PartnerCreate {
  name: string;
  phone?: string | null;
  email?: string | null;
  remarks?: string | null;
}

const DEV_PARTNERS_KEY = 'dev_mock_partners_v1';

const nowIso = () => new Date().toISOString();

const readDevPartners = (): Partner[] => {
  try {
    const raw = localStorage.getItem(DEV_PARTNERS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const items = Array.isArray(parsed) ? parsed : [];
    if (items.length > 0) return items as Partner[];
  } catch {
  }
  const seeded: Partner[] = [
    {
      id: 1001,
      name: '測試合作方 A',
      phone: '852-60000001',
      email: 'partner-a@example.com',
      remarks: '本機免登入測試資料',
      created_at: new Date('2026-01-01T10:00:00.000Z').toISOString(),
      updated_at: new Date('2026-01-01T10:00:00.000Z').toISOString(),
    },
    {
      id: 1002,
      name: '測試合作方 B',
      phone: '852-60000002',
      email: 'partner-b@example.com',
      remarks: '本機免登入測試資料',
      created_at: new Date('2026-01-02T10:00:00.000Z').toISOString(),
      updated_at: new Date('2026-01-02T10:00:00.000Z').toISOString(),
    },
  ];
  localStorage.setItem(DEV_PARTNERS_KEY, JSON.stringify(seeded));
  return seeded;
};

const writeDevPartners = (items: Partner[]) => {
  localStorage.setItem(DEV_PARTNERS_KEY, JSON.stringify(items));
};

// Agencies
export const getAgencies = async (params?: { q?: string; limit?: number; offset?: number }) => {
  const response = await apiClient.get<Agency[]>('/agencies', { params });
  return response.data;
};

export const getAgency = async (id: number) => {
  const response = await apiClient.get<Agency>(`/agencies/${id}`);
  return response.data;
};

export const createAgency = async (data: AgencyCreate) => {
  const response = await apiClient.post<Agency>('/agencies', data);
  return response.data;
};

export const updateAgency = async (id: number, data: Partial<AgencyCreate>) => {
  const response = await apiClient.put<Agency>(`/agencies/${id}`, data);
  return response.data;
};

export const deleteAgency = async (id: number) => {
  const response = await apiClient.delete(`/agencies/${id}`);
  return response.data;
};

// Recruiters
export const getRecruiters = async (params?: { q?: string; limit?: number; offset?: number }) => {
  const response = await apiClient.get<Recruiter[]>('/recruiters', { params });
  return response.data;
};

export const getRecruiter = async (id: number) => {
  const response = await apiClient.get<Recruiter>(`/recruiters/${id}`);
  return response.data;
};

export const createRecruiter = async (data: RecruiterCreate) => {
  const response = await apiClient.post<Recruiter>('/recruiters', data);
  return response.data;
};

export const updateRecruiter = async (id: number, data: Partial<RecruiterCreate>) => {
  const response = await apiClient.put<Recruiter>(`/recruiters/${id}`, data);
  return response.data;
};

export const deleteRecruiter = async (id: number) => {
  const response = await apiClient.delete(`/recruiters/${id}`);
  return response.data;
};

// Partners
export const getPartners = async (params?: { q?: string }) => {
  if (isDevBypassSession()) {
    const keyword = String(params?.q || '').trim().toLowerCase();
    const items = readDevPartners();
    return keyword
      ? items.filter((item) => `${item.name} ${item.phone || ''} ${item.email || ''} ${item.remarks || ''}`.toLowerCase().includes(keyword))
      : items;
  }
  const cleanedParams: { q?: string } = {};
  if (params?.q && params.q.trim()) cleanedParams.q = params.q.trim();
  const response = await apiClient.get<Partner[]>('/partners', {
    params: cleanedParams,
  });
  return response.data;
};

export const getPartner = async (id: number) => {
  if (isDevBypassSession()) {
    const found = readDevPartners().find((item) => Number(item.id) === Number(id));
    if (!found) throw new Error('PARTNER_NOT_FOUND');
    return found;
  }
  const response = await apiClient.get<Partner>(`/partners/${id}`);
  return response.data;
};

export const createPartner = async (data: PartnerCreate) => {
  if (isDevBypassSession()) {
    const items = readDevPartners();
    const createdAt = nowIso();
    const next: Partner = {
      id: items.reduce((max, item) => Math.max(max, Number(item.id || 0)), 1000) + 1,
      name: String(data.name || '').trim(),
      phone: data.phone ?? null,
      email: data.email ?? null,
      remarks: data.remarks ?? null,
      created_at: createdAt,
      updated_at: createdAt,
    };
    writeDevPartners([next, ...items]);
    return next;
  }
  const response = await apiClient.post<Partner>('/partners', data);
  return response.data;
};

export const updatePartner = async (id: number, data: Partial<PartnerCreate>) => {
  if (isDevBypassSession()) {
    const items = readDevPartners();
    const next = items.map((item) =>
      Number(item.id) === Number(id)
        ? {
            ...item,
            ...data,
            name: String((data.name ?? item.name) || '').trim(),
            updated_at: nowIso(),
          }
        : item
    );
    const updated = next.find((item) => Number(item.id) === Number(id));
    if (!updated) throw new Error('PARTNER_NOT_FOUND');
    writeDevPartners(next);
    return updated;
  }
  const response = await apiClient.put<Partner>(`/partners/${id}`, data);
  return response.data;
};

export const deletePartner = async (id: number) => {
  if (isDevBypassSession()) {
    const items = readDevPartners().filter((item) => Number(item.id) !== Number(id));
    writeDevPartners(items);
    return { ok: true };
  }
  const response = await apiClient.delete(`/partners/${id}`);
  return response.data;
};
