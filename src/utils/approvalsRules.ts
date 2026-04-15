import type { ApprovalReminder } from '../api/approvals';

export const APPROVAL_DEPARTMENTS = ['勞工處', '發展局', '機管局', '福利處', '運輸署'] as const;

export const isValidDepartment = (v?: string) => APPROVAL_DEPARTMENTS.includes(String(v || '').trim() as any);

export const normalizeQuotaSeq = (v?: string) => String(v || '').replace(/[^\d]/g, '').padStart(4, '0').slice(-4);

export const computeExpiryDate = (issueDate?: string) => {
  const v = String(issueDate || '').trim();
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  d.setMonth(d.getMonth() + 12);
  return d.toISOString().slice(0, 10);
};

export const generateApprovalReminders = (
  approvals: Array<{ id: number; approval_number?: string; employer_name?: string; expiry_date?: string }>,
  existing: ApprovalReminder[],
  now: Date = new Date()
) => {
  const windows = [180, 90, 30] as const;
  const result: ApprovalReminder[] = [];
  for (const a of approvals) {
    const expiry = String(a.expiry_date || '').trim();
    if (!expiry) continue;
    const expDate = new Date(expiry);
    if (Number.isNaN(expDate.getTime())) continue;
    const days = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    for (const w of windows) {
      if (Math.abs(days - w) <= 1) {
        const id = `${a.id}-${w}`;
        const old = existing.find(x => x.id === id);
        result.push({
          id,
          approval_id: a.id,
          approval_number: String(a.approval_number || '').toUpperCase(),
          company_name: String(a.employer_name || '未指定公司'),
          window_days: w,
          expiry_date: expiry,
          message: `${String(a.employer_name || '未指定公司')}，批文編號 ${String(a.approval_number || '').toLowerCase()}，剩餘 ${w} 天到期`,
          status: old?.status || 'unread',
          created_at: old?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }
  }
  return result;
};
