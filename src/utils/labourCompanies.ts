export const LABOUR_COMPANIES_KEY = 'labour_companies_v1';

export type LabourCompany = {
  id: string;
  company_name: string;
  company_code: string;
  contact_person: string;
  labour_fee_per_person_month: number;
  insurance_fee_per_person_month: number;
  // Backward compatibility for old data model.
  price_per_person_month?: number;
  created_at: string;
  updated_at: string;
};

export type LabourCompanyInput = {
  company_name: string;
  company_code: string;
  contact_person: string;
  labour_fee_per_person_month: number;
  insurance_fee_per_person_month: number;
};

const normalizePrice = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
};

const normalizeItem = (item: LabourCompany): LabourCompany => ({
  ...item,
  company_name: String(item.company_name || '').trim(),
  company_code: String(item.company_code || '').trim(),
  contact_person: String(item.contact_person || '').trim(),
  labour_fee_per_person_month: normalizePrice(
    item.labour_fee_per_person_month ?? item.price_per_person_month
  ),
  insurance_fee_per_person_month: normalizePrice(item.insurance_fee_per_person_month),
});

export const readLabourCompanies = (): LabourCompany[] => {
  try {
    const raw = localStorage.getItem(LABOUR_COMPANIES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x === 'object')
      .map((x) => normalizeItem(x as LabourCompany))
      .sort((a, b) => Date.parse(b.updated_at || b.created_at || '') - Date.parse(a.updated_at || a.created_at || ''));
  } catch {
    return [];
  }
};

export const writeLabourCompanies = (items: LabourCompany[]) => {
  localStorage.setItem(LABOUR_COMPANIES_KEY, JSON.stringify(items.map(normalizeItem)));
};

export const createLabourCompany = (input: LabourCompanyInput): LabourCompany => {
  const now = new Date().toISOString();
  const next: LabourCompany = normalizeItem({
    id: `labour-company-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    created_at: now,
    updated_at: now,
    ...input,
  });
  const all = readLabourCompanies();
  writeLabourCompanies([next, ...all]);
  return next;
};

export const updateLabourCompany = (id: string, input: LabourCompanyInput): LabourCompany | null => {
  const all = readLabourCompanies();
  let updated: LabourCompany | null = null;
  const next = all.map((row) => {
    if (row.id !== id) return row;
    updated = normalizeItem({
      ...row,
      ...input,
      updated_at: new Date().toISOString(),
    });
    return updated;
  });
  writeLabourCompanies(next);
  return updated;
};

export const deleteLabourCompany = (id: string) => {
  const all = readLabourCompanies();
  writeLabourCompanies(all.filter((row) => row.id !== id));
};

export const filterLabourCompanies = (items: LabourCompany[], q: string) => {
  const keyword = String(q || '').trim().toLowerCase();
  if (!keyword) return items;
  return items.filter((row) =>
    `${row.company_name} ${row.company_code} ${row.contact_person} ${row.labour_fee_per_person_month} ${row.insurance_fee_per_person_month}`
      .toLowerCase()
      .includes(keyword)
  );
};
