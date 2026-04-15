import { describe, expect, it } from 'vitest';
import {
  PHONE_CODES,
  isMainlandId,
  isPhoneNumber,
  labourStatusToApi,
  labourStatusToUi,
  mergePhone,
  parseEmploymentMonths,
  formatEmploymentMonths,
  normalizeDate,
} from './workersForm';

describe('workersForm utils', () => {
  it('normalizes date', () => {
    expect(normalizeDate('2025/12/13')).toBe('2025-12-13');
    expect(normalizeDate('2025-12-13')).toBe('2025-12-13');
  });

  it('validates mainland id', () => {
    expect(isMainlandId('11010519491231002X')).toBe(true);
    expect(isMainlandId('11010519491231002')).toBe(false);
  });

  it('validates phone number', () => {
    expect(isPhoneNumber('1234567')).toBe(true);
    expect(isPhoneNumber('12345678901')).toBe(true);
    expect(isPhoneNumber('123456')).toBe(false);
    expect(isPhoneNumber('123456789012')).toBe(false);
    expect(isPhoneNumber('12ab5678')).toBe(false);
  });

  it('maps labour status ui/api', () => {
    expect(labourStatusToApi('辦證中')).toBe('Pending');
    expect(labourStatusToApi('在職')).toBe('Active');
    expect(labourStatusToApi('離職')).toBe('Inactive');
    expect(labourStatusToApi('Pending')).toBe('Pending');
    expect(labourStatusToUi('Pending')).toBe('辦證中');
    expect(labourStatusToUi('Active')).toBe('在職');
    expect(labourStatusToUi('Inactive')).toBe('離職');
    expect(labourStatusToUi('辦證中')).toBe('辦證中');
    expect(labourStatusToApi('未知')).toBe('Pending');
    expect(labourStatusToUi('未知')).toBe('辦證中');
  });

  it('merges phone', () => {
    expect(PHONE_CODES).toEqual(['+86', '+852', '+853']);
    expect(mergePhone('+852', '98765432')).toBe('+85298765432');
    expect(mergePhone('+86', '')).toBe('');
  });

  it('parses and formats employment months', () => {
    expect(parseEmploymentMonths('24個月')).toBe('24');
    expect(parseEmploymentMonths('2年')).toBe('24');
    expect(parseEmploymentMonths(12)).toBe('12');
    expect(formatEmploymentMonths('24')).toBe('24個月');
    expect(formatEmploymentMonths('2年')).toBe('24個月');
    expect(parseEmploymentMonths('')).toBe('');
    expect(parseEmploymentMonths('abc')).toBe('');
    expect(parseEmploymentMonths('0')).toBe('');
    expect(formatEmploymentMonths('')).toBe('');
  });
});
