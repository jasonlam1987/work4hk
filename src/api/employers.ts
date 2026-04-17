import apiClient from './client';
import { appendGlobalAuditLog } from '../utils/auditLog';

const EMPLOYER_EXT_MAP_KEY = 'employer_ext_v1';
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

export const getEmployers = async (params?: { q?: string; limit?: number; offset?: number }) => {
  const response = await apiClient.get<Employer[]>('/employers', { params });
  return applyExtFields(response.data || []);
};

export const createEmployer = async (data: EmployerCreate) => {
  try {
    const response = await apiClient.post<Employer>('/employers', data);
    const out = applyExtFields([response.data])[0];
    persistExtFields({
      id: out.id,
      name: out.name,
      company_incorporation_number: data.company_incorporation_number,
      contact_person: data.contact_person,
      phone_code: data.phone_code,
      contact_phone: data.contact_phone,
    });
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
      const out = applyExtFields([response.data])[0];
      persistExtFields({
        id: out.id,
        name: out.name,
        company_incorporation_number: data.company_incorporation_number,
        contact_person: data.contact_person,
        phone_code: data.phone_code,
        contact_phone: data.contact_phone,
      });
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
  try {
    const response = await apiClient.patch<Employer>(`/employers/${id}`, data);
    const out = applyExtFields([response.data])[0];
    persistExtFields({
      id: out.id,
      name: out.name,
      company_incorporation_number: data.company_incorporation_number,
      contact_person: data.contact_person,
      phone_code: data.phone_code,
      contact_phone: data.contact_phone,
    });
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
      const out = applyExtFields([response.data])[0];
      persistExtFields({
        id: out.id,
        name: out.name,
        company_incorporation_number: data.company_incorporation_number,
        contact_person: data.contact_person,
        phone_code: data.phone_code,
        contact_phone: data.contact_phone,
      });
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

export const deleteEmployer = async (id: number) => {
  const response = await apiClient.delete(`/employers/${id}`);
  appendGlobalAuditLog({
    module: 'employers',
    action: 'delete',
    record_id: String(id),
    details: `刪除僱主 id=${id}`,
  });
  return response.data;
};
