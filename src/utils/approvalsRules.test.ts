import { describe, expect, it } from 'vitest';
import { APPROVAL_DEPARTMENTS, computeExpiryDate, generateApprovalReminders, isValidDepartment, normalizeQuotaSeq } from './approvalsRules';

describe('approvals rules', () => {
  it('validates department options', () => {
    expect(APPROVAL_DEPARTMENTS).toEqual(['勞工處', '發展局', '機管局', '福利處', '運輸署']);
    expect(isValidDepartment('勞工處')).toBe(true);
    expect(isValidDepartment('未知部門')).toBe(false);
  });

  it('normalizes quota sequence', () => {
    expect(normalizeQuotaSeq('1')).toBe('0001');
    expect(normalizeQuotaSeq('0999')).toBe('0999');
    expect(normalizeQuotaSeq('12a3')).toBe('0123');
    expect(normalizeQuotaSeq('')).toBe('0000');
  });

  it('computes expiry date by +12 months', () => {
    expect(computeExpiryDate('2025-01-15')).toBe('2026-01-15');
    expect(computeExpiryDate('')).toBe('');
    expect(computeExpiryDate('invalid')).toBe('');
  });

  it('generates 180/90/30 reminders with dedupe keys', () => {
    const now = new Date('2025-01-01');
    const list = [
      { id: 1, approval_number: 'ELS2025-0001', employer_name: '甲公司', expiry_date: '2025-06-30' }, // ~180
      { id: 2, approval_number: 'ELS2025-0002', employer_name: '乙公司', expiry_date: '2025-04-01' }, // ~90
      { id: 3, approval_number: 'ELS2025-0003', employer_name: '丙公司', expiry_date: '2025-01-31' }, // ~30
    ];
    const reminders = generateApprovalReminders(list as any, [], now);
    expect(reminders.some(r => r.id === '1-180')).toBe(true);
    expect(reminders.some(r => r.id === '2-90')).toBe(true);
    expect(reminders.some(r => r.id === '3-30')).toBe(true);
  });

  it('keeps old status and filters invalid expiry', () => {
    const now = new Date('2025-01-01');
    const existing = [{
      id: '9-180',
      approval_id: 9,
      approval_number: 'ELS2025-0009',
      company_name: '舊公司',
      window_days: 180,
      expiry_date: '2025-06-30',
      message: 'old',
      status: 'read' as const,
      created_at: '2025-01-01T00:00:00.000Z',
      updated_at: '2025-01-01T00:00:00.000Z',
    }];
    const list = [
      { id: 9, approval_number: 'ELS2025-0009', employer_name: '舊公司', expiry_date: '2025-06-30' },
      { id: 10, approval_number: 'ELS2025-0010', employer_name: '無效', expiry_date: '' },
      { id: 11, approval_number: 'ELS2025-0011', employer_name: '無效', expiry_date: 'invalid' },
    ];
    const reminders = generateApprovalReminders(list as any, existing as any, now);
    const r = reminders.find(x => x.id === '9-180');
    expect(r?.status).toBe('read');
    expect(reminders.some(x => x.approval_id === 10)).toBe(false);
    expect(reminders.some(x => x.approval_id === 11)).toBe(false);
  });
});
