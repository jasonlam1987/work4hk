export const AUTHORIZED_PARTIES_KEY = 'authorized_parties_v1';

export type AuthorizedPartyGender = 'male' | 'female';
export type AuthorizedPartyIdType = 'HKID' | 'OTHER';

export type AuthorizedParty = {
  id: string;
  company_name: string;
  business_registration_number: string;
  representative_name: string;
  gender: AuthorizedPartyGender;
  email: string;
  id_type: AuthorizedPartyIdType;
  id_number: string;
  created_at: string;
  updated_at: string;
};

export type AuthorizedPartyInput = {
  company_name: string;
  business_registration_number: string;
  representative_name: string;
  gender: AuthorizedPartyGender;
  email: string;
  id_type: AuthorizedPartyIdType;
  id_number: string;
};

const normalizeBrNo = (value: string) => String(value || '').replace(/[^\d]/g, '').slice(0, 8);

const normalizeItem = (item: AuthorizedParty): AuthorizedParty => ({
  ...item,
  company_name: String(item.company_name || '').trim(),
  business_registration_number: normalizeBrNo(item.business_registration_number),
  representative_name: String(item.representative_name || '').trim(),
  email: String(item.email || '').trim(),
  id_number: String(item.id_number || '').trim(),
});

export const readAuthorizedParties = (): AuthorizedParty[] => {
  try {
    const raw = localStorage.getItem(AUTHORIZED_PARTIES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x === 'object')
      .map((x) => normalizeItem(x as AuthorizedParty))
      .sort((a, b) => Date.parse(b.updated_at || b.created_at || '') - Date.parse(a.updated_at || a.created_at || ''));
  } catch {
    return [];
  }
};

export const writeAuthorizedParties = (items: AuthorizedParty[]) => {
  localStorage.setItem(AUTHORIZED_PARTIES_KEY, JSON.stringify(items.map(normalizeItem)));
};

export const createAuthorizedParty = (input: AuthorizedPartyInput): AuthorizedParty => {
  const now = new Date().toISOString();
  const next: AuthorizedParty = normalizeItem({
    id: `auth-party-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    created_at: now,
    updated_at: now,
    ...input,
  });
  const all = readAuthorizedParties();
  writeAuthorizedParties([next, ...all]);
  return next;
};

export const updateAuthorizedParty = (id: string, input: AuthorizedPartyInput): AuthorizedParty | null => {
  const all = readAuthorizedParties();
  let updated: AuthorizedParty | null = null;
  const next = all.map((row) => {
    if (row.id !== id) return row;
    updated = normalizeItem({
      ...row,
      ...input,
      updated_at: new Date().toISOString(),
    });
    return updated;
  });
  writeAuthorizedParties(next);
  return updated;
};

export const deleteAuthorizedParty = (id: string) => {
  const all = readAuthorizedParties();
  writeAuthorizedParties(all.filter((row) => row.id !== id));
};

export const filterAuthorizedParties = (items: AuthorizedParty[], q: string) => {
  const keyword = String(q || '').trim().toLowerCase();
  if (!keyword) return items;
  return items.filter((row) =>
    `${row.company_name} ${row.business_registration_number} ${row.representative_name} ${row.email} ${row.id_number}`
      .toLowerCase()
      .includes(keyword)
  );
};
