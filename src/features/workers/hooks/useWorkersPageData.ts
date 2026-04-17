import { useCallback, useEffect, useRef, useState } from 'react';
import { Approval, getApprovals } from '../../../api/approvals';
import { Employer, getEmployers } from '../../../api/employers';
import { Worker, getWorkers } from '../../../api/workers';

const WORKERS_CACHE_KEY = 'cache_workers_list_v1';
const EMPLOYERS_CACHE_KEY = 'cache_employers_list_v1';
const APPROVALS_CACHE_KEY = 'cache_approvals_list_v1';
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
      setApprovals(list);
      writeCachedItems(APPROVALS_CACHE_KEY, list);
      return list;
    } catch {
      const cached = readCachedEntry<Approval>(APPROVALS_CACHE_KEY).items;
      setApprovals(cached);
      return cached;
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
