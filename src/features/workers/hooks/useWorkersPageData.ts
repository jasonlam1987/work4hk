import { useCallback, useEffect, useRef, useState } from 'react';
import { Approval, getApprovals, QuotaDetail, setApprovalQuotaDetails } from '../../../api/approvals';
import { Employer, getEmployers } from '../../../api/employers';
import { Worker, getWorkers } from '../../../api/workers';

const WORKERS_CACHE_KEY = 'cache_workers_list_v1';
const EMPLOYERS_CACHE_KEY = 'cache_employers_list_v1';
const APPROVALS_CACHE_KEY = 'cache_approvals_list_v1';
const QUOTA_APP_CACHE_KEY = 'quota_application_records_v1';
const WORKERS_PERF_KEY = 'workers_perf_metrics_v1';
const CACHE_TTL_MS = 5 * 60 * 1000;
const SEARCH_DEBOUNCE_MS = 350;

type CacheEntry<T> = {
  items: T[];
  savedAt: number;
};

const readCachedEntry = <T,>(key: string): CacheEntry<T> => {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    const items = Array.isArray(parsed?.items) ? (parsed.items as T[]) : [];
    const savedAt = Number(parsed?.savedAt || 0);
    return { items, savedAt: Number.isFinite(savedAt) ? savedAt : 0 };
  } catch {
    return { items: [], savedAt: 0 };
  }
};

const writeCachedItems = <T,>(key: string, items: T[]) => {
  try {
    localStorage.setItem(key, JSON.stringify({ items, savedAt: Date.now() }));
  } catch {
    // Ignore quota and private mode write failures.
  }
};

const readQuotaAppRecords = (): any[] => {
  try {
    const raw = localStorage.getItem(QUOTA_APP_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const normalizeSeq4 = (v: string) => String(v || '').replace(/[^\d]/g, '').padStart(4, '0').slice(-4);

const hashToPositiveInt = (input: string) => {
  let h = 0;
  const s = String(input || '');
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

const deriveAppliedCount = (row: any, category: string) => {
  const newCount = Number(String(row?.apply_count_new || '').replace(/[^\d]/g, '') || 0);
  const renewCount = Number(String(row?.apply_count_renewal || '').replace(/[^\d]/g, '') || 0);
  if (category === '新申請') return newCount;
  if (category === '續約') return renewCount;
  return newCount + renewCount;
};

const scheduleText = (slots?: Array<{ start?: string; end?: string }>) =>
  (Array.isArray(slots) ? slots : [])
    .map((s) => {
      const start = String(s?.start || '').trim();
      const end = String(s?.end || '').trim();
      return start && end ? `${start}-${end}` : '';
    })
    .filter(Boolean)
    .join('；');

const toQuotaDetailList = (record: any): QuotaDetail[] => {
  const jobs = Array.isArray(record?.common_jobs) ? record.common_jobs : [];
  const reqs = Array.isArray(record?.common_job_new_requests) ? record.common_job_new_requests : [];
  const reqMap = new Map<string, any>();
  for (const r of reqs) {
    const id = String(r?.selected_common_job_id || '').trim();
    if (id) reqMap.set(id, r);
  }
  const out: QuotaDetail[] = [];
  let seq = 1;
  for (const job of jobs) {
    const count = deriveAppliedCount(job, String(record?.category || '新申請'));
    if (!Number.isFinite(count) || count <= 0) continue;
    const jobId = String(job?.id || '').trim();
    const req = jobId ? reqMap.get(jobId) : undefined;
    const locations = (Array.isArray(req?.work_addresses) ? req.work_addresses : [])
      .map((x: any) => String(x || '').trim())
      .filter(Boolean)
      .slice(0, 3);
    const months = Number(String(job?.employment_months || '').replace(/[^\d]/g, '') || 0);
    for (let i = 0; i < count; i += 1) {
      out.push({
        quota_seq: normalizeSeq4(String(seq)),
        work_location: locations[0] || '',
        work_locations: locations,
        job_title: String(job?.post_name || '').trim(),
        monthly_salary: 0,
        work_hours: scheduleText(req?.schedules),
        employment_months: Number.isFinite(months) ? months : 0,
      });
      seq += 1;
    }
  }
  return out;
};

const mergeQuotaApprovedAsApprovals = (base: Approval[]): Approval[] => {
  const records = readQuotaAppRecords().filter((r) => String(r?.status || '') === '已批出');
  if (records.length === 0) return base;
  const byNo = new Set(base.map((a) => String(a.approval_number || '').trim().toLowerCase()).filter(Boolean));
  const merged = [...base];
  for (const r of records) {
    const approvalNo = String(r?.application_no || '').trim().toUpperCase();
    if (!approvalNo) continue;
    if (byNo.has(approvalNo.toLowerCase())) continue;
    const employerId = Number(r?.employer_id || 0);
    if (!employerId) continue;
    const syntheticId = 700000000 + (hashToPositiveInt(String(r?.id || approvalNo)) % 100000000);
    const quotaDetails = toQuotaDetailList(r);
    setApprovalQuotaDetails(syntheticId, quotaDetails);
    merged.push({
      id: syntheticId,
      employer_id: employerId,
      employer_name: String(r?.employer_name_cn || r?.employer_name_en || ''),
      partner_id: 0,
      approval_number: approvalNo,
      department: '勞工處',
      issue_date: String(r?.submitted_at || '').slice(0, 10) || undefined,
      expiry_date: undefined,
      signatory_name: '',
      quota_quantity: quotaDetails.length,
      quota_details: quotaDetails,
    } as Approval);
    byNo.add(approvalNo.toLowerCase());
  }
  return merged;
};

export const useWorkersPageData = (search: string) => {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [debouncedSearch, setDebouncedSearch] = useState(search.trim());
  const [hasBootstrapped, setHasBootstrapped] = useState(false);
  const hasLoadedRef = useRef(false);
  const lastFetchedQueryRef = useRef<string | null>(null);
  const inFlightWorkersRef = useRef<Promise<void> | null>(null);
  const inFlightEmployersRef = useRef<Promise<Employer[]> | null>(null);
  const inFlightApprovalsRef = useRef<Promise<Approval[]> | null>(null);

  const fetchWorkers = useCallback(async (keyword?: string, progressive = false, force = false) => {
    const startedAt = performance.now();
    const q = (typeof keyword === 'string' ? keyword : '').trim();
    if (lastFetchedQueryRef.current === q && !progressive && !force) return;
    if (inFlightWorkersRef.current) return inFlightWorkersRef.current;
    const run = (async () => {
    try {
      setLoading(true);
      if (progressive && !q) {
        const fastList = await getWorkers({ q, limit: 200 });
        setWorkers(fastList);
      }
      const data = await getWorkers({ q });
      setWorkers(data);
      setError('');
      setHasLoaded(true);
      hasLoadedRef.current = true;
      lastFetchedQueryRef.current = q;
      writeCachedItems(WORKERS_CACHE_KEY, data);
      sessionStorage.setItem(WORKERS_PERF_KEY, JSON.stringify({ loadMs: Number((performance.now() - startedAt).toFixed(1)), size: data.length, q, savedAt: Date.now() }));
    } catch (err: any) {
      const msg = err?.response?.data?.detail || '獲取勞工列表失敗';
      setError(msg);
      if (!hasLoadedRef.current) {
        const cached = readCachedEntry<Worker>(WORKERS_CACHE_KEY).items;
        if (cached.length > 0) {
          setWorkers(cached);
          setHasLoaded(true);
          hasLoadedRef.current = true;
        }
      }
    } finally {
      setLoading(false);
    }
    })();
    inFlightWorkersRef.current = run;
    try {
      await run;
    } finally {
      inFlightWorkersRef.current = null;
    }
  }, []);

  const fetchEmployers = useCallback(async () => {
    if (inFlightEmployersRef.current) return inFlightEmployersRef.current;
    const run = (async () => {
    try {
      const list = await getEmployers({ limit: 300 });
      setEmployers(list);
      writeCachedItems(EMPLOYERS_CACHE_KEY, list);
      return list;
    } catch {
      const cached = readCachedEntry<Employer>(EMPLOYERS_CACHE_KEY).items;
      setEmployers(cached);
      return cached;
    }
    })();
    inFlightEmployersRef.current = run;
    try {
      return await run;
    } finally {
      inFlightEmployersRef.current = null;
    }
  }, []);

  const fetchApprovals = useCallback(async () => {
    if (inFlightApprovalsRef.current) return inFlightApprovalsRef.current;
    const run = (async () => {
    try {
      const list = await getApprovals({ limit: 300 });
      const merged = mergeQuotaApprovedAsApprovals(list);
      setApprovals(merged);
      writeCachedItems(APPROVALS_CACHE_KEY, merged);
      return merged;
    } catch {
      const cached = readCachedEntry<Approval>(APPROVALS_CACHE_KEY).items;
      const merged = mergeQuotaApprovedAsApprovals(cached);
      setApprovals(merged);
      return merged;
    }
    })();
    inFlightApprovalsRef.current = run;
    try {
      return await run;
    } finally {
      inFlightApprovalsRef.current = null;
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const workersCache = readCachedEntry<Worker>(WORKERS_CACHE_KEY);
    const employersCache = readCachedEntry<Employer>(EMPLOYERS_CACHE_KEY);
    const approvalsCache = readCachedEntry<Approval>(APPROVALS_CACHE_KEY);
    const now = Date.now();

    if (workersCache.items.length > 0) {
      setWorkers(workersCache.items);
      setHasLoaded(true);
      hasLoadedRef.current = true;
    }
    if (employersCache.items.length > 0) setEmployers(employersCache.items);
    if (approvalsCache.items.length > 0) setApprovals(approvalsCache.items);

    const workersFresh = now - workersCache.savedAt <= CACHE_TTL_MS;
    const employersFresh = now - employersCache.savedAt <= CACHE_TTL_MS;
    const approvalsFresh = now - approvalsCache.savedAt <= CACHE_TTL_MS;
    if (!workersFresh || workersCache.items.length === 0) fetchWorkers('', true);
    if (!employersFresh || employersCache.items.length === 0) fetchEmployers();
    if (!approvalsFresh || approvalsCache.items.length === 0) fetchApprovals();
    setHasBootstrapped(true);
  }, [fetchApprovals, fetchEmployers, fetchWorkers]);

  useEffect(() => {
    if (!hasBootstrapped) return;
    fetchWorkers(debouncedSearch);
  }, [debouncedSearch, fetchWorkers, hasBootstrapped]);

  return {
    workers,
    setWorkers,
    loading,
    error,
    hasLoaded,
    employers,
    approvals,
    fetchWorkers,
    fetchEmployers,
    fetchApprovals,
  };
};
