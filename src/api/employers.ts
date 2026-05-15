import apiClient from './client';
import { appendGlobalAuditLog } from '../utils/auditLog';
import { isDevBypassSession } from '../utils/devBypass';

const EMPLOYER_EXT_MAP_KEY = 'employer_ext_v1';
const DEV_EMPLOYERS_KEY = 'dev_mock_employers_v1';
const PHONE_CODES = new Set(['+86', '+852', '+853']);

type EmployerExt = {
  company_incorporation_number?: string;
  contact_person?: string;
  phone_code?: string;
  contact_phone?: string;
};

const readExtMap = (): Record<string, EmployerExt> => {
  try {
    const raw = localStorage.getItem(EMPLOYER_EXT_MAP_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeExtMap = (map: Record<string, EmployerExt>) => {
  try {
    localStorage.setItem(EMPLOYER_EXT_MAP_KEY, JSON.stringify(map));
  } catch {
  }
};

const extKey = (id?: number, name?: string) => {
  if (Number.isFinite(Number(id))) return `id:${Number(id)}`;
  return `name:${String(name || '').trim().toLowerCase()}`;
};

const normalizePhoneCode = (value?: string) => {
  const code = String(value || '').trim();
  return PHONE_CODES.has(code) ? code : '+852';
};

const applyExtFields = (items: Employer[]) => {
  const map = readExtMap();
  return items.map((it) => {
    const ext =
      map[extKey(it.id, it.name)] ||
      map[`name:${String(it.name || '').trim().toLowerCase()}`] ||
      {};
    const ci =
      String(it.company_incorporation_number || '').trim() ||
      String(ext.company_incorporation_number || '').trim() ||
      '';
    const contactPerson = String(it.contact_person || '').trim() || String(ext.contact_person || '').trim();
    const contactPhone = String(it.contact_phone || '').trim() || String(ext.contact_phone || '').trim();
    const phoneCode = normalizePhoneCode(it.phone_code || ext.phone_code);
    return {
      ...it,
      company_incorporation_number: ci || undefined,
      contact_person: contactPerson || undefined,
      contact_phone: contactPhone || undefined,
      phone_code: phoneCode,
    };
  });
};

const persistExtFields = (employer: { id?: number; name?: string; company_incorporation_number?: string; contact_person?: string; phone_code?: string; contact_phone?: string }) => {
  const map = readExtMap();
  const payload: EmployerExt = {
    company_incorporation_number: String(employer.company_incorporation_number || '').trim() || undefined,
    contact_person: String(employer.contact_person || '').trim() || undefined,
    phone_code: normalizePhoneCode(employer.phone_code),
    contact_phone: String(employer.contact_phone || '').trim() || undefined,
  };
  const key = extKey(employer.id, employer.name);
  map[key] = payload;
  if (employer.name) map[`name:${String(employer.name).trim().toLowerCase()}`] = payload;
  writeExtMap(map);
};

const removeExtFields = (employer: { id?: number; name?: string }) => {
  const map = readExtMap();
  const idKey = extKey(employer.id, undefined);
  delete map[idKey];
  if (employer.name) {
    delete map[`name:${String(employer.name).trim().toLowerCase()}`];
  }
  writeExtMap(map);
};

export interface Employer {
  id: number;
  name: string;
  english_name?: string;
  code?: string;
  short_name?: string;
  company_address?: string;
  mailing_address?: string;
  business_registration_number?: string;
  company_incorporation_number?: string;
  contact_person?: string;
  phone_code?: '+86' | '+852' | '+853' | string;
  contact_phone?: string;
  business_type?: string;
  remarks?: string;
  created_at?: string;
  updated_at?: string;
}

export type EmployerCreate = Omit<Employer, 'id' | 'created_at' | 'updated_at'>;

const nowIso = () => new Date().toISOString();

const seedDevEmployers = (): Employer[] => {
  const seeded: Employer[] = [
    {
      id: 1,
      name: '香港測試僱主有限公司',
      english_name: 'HK Demo Employer Limited',
      code: 'EST00001',
      short_name: '測試僱主A',
      company_address: '香港九龍測試道 1 號',
      mailing_address: '香港九龍測試道 1 號',
      business_registration_number: 'BR123456',
      company_incorporation_number: 'CI123456',
      contact_person: '李主管',
      phone_code: '+852',
      contact_phone: '61234567',
      business_type: '餐飲',
      remarks: '本機免登入測試資料',
      created_at: new Date('2026-01-01T09:00:00.000Z').toISOString(),
      updated_at: new Date('2026-01-01T09:00:00.000Z').toISOString(),
    },
    {
      id: 2,
      name: '澳門示範僱主有限公司',
      english_name: 'Macau Sample Employer Limited',
      code: 'EST00002',
      short_name: '測試僱主B',
      company_address: '澳門示範街 8 號',
      mailing_address: '澳門示範街 8 號',
      business_registration_number: 'BR223344',
      company_incorporation_number: 'CI223344',
      contact_person: '陳經理',
      phone_code: '+853',
      contact_phone: '66123456',
      business_type: '清潔',
      remarks: '本機免登入測試資料',
      created_at: new Date('2026-01-02T09:00:00.000Z').toISOString(),
      updated_at: new Date('2026-01-02T09:00:00.000Z').toISOString(),
    },
  ];
  localStorage.setItem(DEV_EMPLOYERS_KEY, JSON.stringify(seeded));
  seeded.forEach((row) => persistExtFields(row));
  return seeded;
};

const readDevEmployers = (): Employer[] => {
  try {
    const raw = localStorage.getItem(DEV_EMPLOYERS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const items = Array.isArray(parsed) ? (parsed as Employer[]) : [];
    if (items.length > 0) return applyExtFields(items);
  } catch {
  }
  return seedDevEmployers();
};

const writeDevEmployers = (items: Employer[]) => {
  localStorage.setItem(DEV_EMPLOYERS_KEY, JSON.stringify(items));
};

export const getEmployers = async (params?: { q?: string; limit?: number; offset?: number }) => {
  if (isDevBypassSession()) {
    const keyword = String(params?.q || '').trim().toLowerCase();
    const offset = Math.max(0, Number(params?.offset || 0));
    const limit = Number(params?.limit || 0);
    let items = readDevEmployers();
    if (keyword) {
      items = items.filter((item) =>
        `${item.code || ''} ${item.name || ''} ${item.english_name || ''} ${item.business_registration_number || ''} ${item.company_incorporation_number || ''}`
          .toLowerCase()
          .includes(keyword)
      );
    }
    return limit > 0 ? items.slice(offset, offset + limit) : items.slice(offset);
  }
  const response = await apiClient.get<Employer[]>('/employers', { params });
  return applyExtFields(response.data || []);
};

export const createEmployer = async (data: EmployerCreate) => {
  if (isDevBypassSession()) {
    const items = readDevEmployers();
    const next: Employer = {
      id: items.reduce((max, item) => Math.max(max, Number(item.id || 0)), 0) + 1,
      ...data,
      name: String(data.name || '').trim(),
      phone_code: normalizePhoneCode(data.phone_code),
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    persistExtFields(next);
    writeDevEmployers([next, ...items]);
    return applyExtFields([next])[0];
  }
  try {
    const response = await apiClient.post<Employer>('/employers', data);
    persistExtFields({
      id: response.data?.id,
      name: response.data?.name,
      company_incorporation_number: data.company_incorporation_number,
      contact_person: data.contact_person,
      phone_code: data.phone_code,
      contact_phone: data.contact_phone,
    });
    const out = applyExtFields([response.data])[0];
    appendGlobalAuditLog({
      module: 'employers',
      action: 'create',
      record_id: String(out.id || ''),
      record_no: out.name || '',
      details: `創建僱主：${out.name || '-'}`,
    });
    return out;
  } catch (err: any) {
    const detail = err?.response?.data?.detail;
    const msg = typeof detail === 'string' ? detail : String(err?.message || '');
    const lower = msg.toLowerCase();
    const unknownField = lower.includes('unknown') || lower.includes('invalid') || lower.includes('field');
    if (
      unknownField &&
      (
        data.company_incorporation_number ||
        data.contact_person ||
        data.contact_phone ||
        data.phone_code
      )
    ) {
      const fallback: EmployerCreate = { ...data };
      delete (fallback as any).company_incorporation_number;
      delete (fallback as any).contact_person;
      delete (fallback as any).phone_code;
      delete (fallback as any).contact_phone;
      const response = await apiClient.post<Employer>('/employers', fallback);
      persistExtFields({
        id: response.data?.id,
        name: response.data?.name,
        company_incorporation_number: data.company_incorporation_number,
        contact_person: data.contact_person,
        phone_code: data.phone_code,
        contact_phone: data.contact_phone,
      });
      const out = applyExtFields([response.data])[0];
      appendGlobalAuditLog({
        module: 'employers',
        action: 'create',
        record_id: String(out.id || ''),
        record_no: out.name || '',
        details: `創建僱主（回退模式）：${out.name || '-'}`,
      });
      return out;
    }
    throw err;
  }
};

export const updateEmployer = async (id: number, data: Partial<EmployerCreate>) => {
  if (isDevBypassSession()) {
    const items = readDevEmployers();
    const next = items.map((item) =>
      Number(item.id) === Number(id)
        ? {
            ...item,
            ...data,
            name: String((data.name ?? item.name) || '').trim(),
            phone_code: normalizePhoneCode(String((data.phone_code ?? item.phone_code) || '')),
            updated_at: nowIso(),
          }
        : item
    );
    const updated = next.find((item) => Number(item.id) === Number(id));
    if (!updated) throw new Error('EMPLOYER_NOT_FOUND');
    persistExtFields(updated);
    writeDevEmployers(next);
    return applyExtFields([updated])[0];
  }
  try {
    const response = await apiClient.patch<Employer>(`/employers/${id}`, data);
    persistExtFields({
      id: response.data?.id,
      name: response.data?.name,
      company_incorporation_number: data.company_incorporation_number,
      contact_person: data.contact_person,
      phone_code: data.phone_code,
      contact_phone: data.contact_phone,
    });
    const out = applyExtFields([response.data])[0];
    appendGlobalAuditLog({
      module: 'employers',
      action: 'update',
      record_id: String(out.id || id || ''),
      record_no: out.name || '',
      details: `更新僱主：${out.name || id}`,
    });
    return out;
  } catch (err: any) {
    const detail = err?.response?.data?.detail;
    const msg = typeof detail === 'string' ? detail : String(err?.message || '');
    const lower = msg.toLowerCase();
    const unknownField = lower.includes('unknown') || lower.includes('invalid') || lower.includes('field');
    if (
      unknownField &&
      (
        data.company_incorporation_number !== undefined ||
        data.contact_person !== undefined ||
        data.phone_code !== undefined ||
        data.contact_phone !== undefined
      )
    ) {
      const fallback: Partial<EmployerCreate> = { ...data };
      delete (fallback as any).company_incorporation_number;
      delete (fallback as any).contact_person;
      delete (fallback as any).phone_code;
      delete (fallback as any).contact_phone;
      const response = await apiClient.patch<Employer>(`/employers/${id}`, fallback);
      persistExtFields({
        id: response.data?.id,
        name: response.data?.name,
        company_incorporation_number: data.company_incorporation_number,
        contact_person: data.contact_person,
        phone_code: data.phone_code,
        contact_phone: data.contact_phone,
      });
      const out = applyExtFields([response.data])[0];
      appendGlobalAuditLog({
        module: 'employers',
        action: 'update',
        record_id: String(out.id || id || ''),
        record_no: out.name || '',
        details: `更新僱主（回退模式）：${out.name || id}`,
      });
      return out;
    }
    throw err;
  }
};

export const deleteEmployer = async (id: number, employerName?: string) => {
  if (isDevBypassSession()) {
    const items = readDevEmployers().filter((item) => Number(item.id) !== Number(id));
    writeDevEmployers(items);
    removeExtFields({ id, name: employerName });
    return { ok: true };
  }
  const response = await apiClient.delete(`/employers/${id}`);
  const serverName = String((response as any)?.data?.name || '').trim();
  removeExtFields({ id, name: employerName || serverName });
  appendGlobalAuditLog({
    module: 'employers',
    action: 'delete',
    record_id: String(id),
    details: `刪除僱主 id=${id}`,
  });
  return response.data;
};
