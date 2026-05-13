import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => {
  return {
    default: {
      post: vi.fn(),
      patch: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
    },
  };
});

vi.mock('../utils/auditLog', () => {
  return {
    appendGlobalAuditLog: vi.fn(),
  };
});

const createMemoryStorage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => {
      map.set(String(key), String(value));
    },
    removeItem: (key: string) => {
      map.delete(String(key));
    },
    clear: () => {
      map.clear();
    },
  };
};

const make500 = () => ({
  response: { status: 500, data: { detail: 'Internal Server Error' } },
});

describe('createApproval', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', createMemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to local-only mock on repeated 500', async () => {
    const mod = await import('./approvals');
    const apiClient = (await import('./client')).default as any;
    apiClient.post.mockReset();
    apiClient.post.mockRejectedValue(make500());

    const created = await mod.createApproval({
      employer_id: 55,
      partner_id: 2,
      approval_number: 'ELS111',
      department: '勞工處',
      issue_date: '2024-12-01T00:00:00.000Z',
      expiry_date: '2025-12-01',
      quota_details: [
        {
          quota_seq: '0001',
          work_location: 'abc',
          job_title: '見習廚師',
          monthly_salary: 12345,
          work_hours: '每週6天，每天8小時',
          employment_months: 24,
        },
      ],
    } as any);

    expect(apiClient.post).toHaveBeenCalledTimes(4);
    expect(created).toBeTruthy();
    expect((created as any).__localOnly).toBe(true);
    expect(typeof (created as any).id).toBe('number');
    expect((created as any).approval_number).toBe('ELS111');
    expect((created as any).id).toBeLessThan(0);
  });

  it('returns server response when first attempt succeeds', async () => {
    const mod = await import('./approvals');
    const apiClient = (await import('./client')).default as any;
    apiClient.post.mockReset();
    apiClient.post.mockResolvedValue({
      data: { id: 123, approval_number: 'ELS222' },
    });

    const created = await mod.createApproval({
      employer_id: 55,
      partner_id: 2,
      approval_number: 'ELS222',
      department: '勞工處',
      issue_date: '2024-12-01T00:00:00.000Z',
    } as any);

    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect((created as any).__localOnly).toBeUndefined();
    expect((created as any).id).toBe(123);
    expect((created as any).approval_number).toBe('ELS222');
  });
});
