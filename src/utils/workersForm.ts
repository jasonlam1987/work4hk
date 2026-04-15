export const PHONE_CODES = ['+86', '+852', '+853'] as const;
export type PhoneCode = (typeof PHONE_CODES)[number];

export const normalizeDate = (v: string) => {
  const s = String(v || '').trim();
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) return s.replace(/\//g, '-');
  return s;
};

export const isMainlandId = (v: string) => /^\d{17}[\dXx]$/.test(v.trim());

export const isPhoneNumber = (v: string) => /^\d{7,11}$/.test(v);

export const labourStatusOptions = ['在職', '離職', '待處理'] as const;

export const labourStatusToApi = (v?: string) => {
  if (v === '在職' || v === 'Active') return 'Active';
  if (v === '離職' || v === 'Inactive') return 'Inactive';
  return 'Pending';
};

export const labourStatusToUi = (v?: string) => {
  if (v === 'Active' || v === '在職') return '在職';
  if (v === 'Inactive' || v === '離職') return '離職';
  return '待處理';
};

export const mergePhone = (code: PhoneCode, number: string) => {
  const n = String(number || '').trim();
  if (!n) return '';
  return `${code}${n}`;
};
