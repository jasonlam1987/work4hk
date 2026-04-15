import { describe, expect, it } from 'vitest';
import {
  PHONE_CODES,
  isMainlandId,
  isPhoneNumber,
  labourStatusToApi,
  labourStatusToUi,
  mergePhone,
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
    expect(labourStatusToApi('在職')).toBe('Active');
    expect(labourStatusToApi('離職')).toBe('Inactive');
    expect(labourStatusToApi('待處理')).toBe('Pending');
    expect(labourStatusToUi('Active')).toBe('在職');
    expect(labourStatusToUi('Inactive')).toBe('離職');
    expect(labourStatusToUi('Pending')).toBe('待處理');
  });

  it('merges phone', () => {
    expect(PHONE_CODES).toEqual(['+86', '+852', '+853']);
    expect(mergePhone('+852', '98765432')).toBe('+85298765432');
    expect(mergePhone('+86', '')).toBe('');
  });
});
