import React, { useEffect, useState } from 'react';
import { Users, Building2, Briefcase, FileText, Loader2, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { getUsers } from '../api/users';
import { getEmployers } from '../api/employers';
import { getWorkers } from '../api/workers';
import { getApprovals, ApprovalReminder, getApprovalReminders, markApprovalReminderRead, reRemindApprovalReminder, setApprovalReminders } from '../api/approvals';
import { parseEmploymentMonths } from '../utils/workersForm';
import { generateApprovalReminders } from '../utils/approvalsRules';
import { userDisplayPipe } from '../utils/userDisplayPipe';

const DASHBOARD_CACHE_KEY = 'dashboardStats';
const DASHBOARD_CACHE_TS_KEY = 'dashboardStatsSavedAt';
const DASHBOARD_CACHE_TTL_MS = 3 * 60 * 1000;
const DASHBOARD_PERF_KEY = 'dashboard_perf_metrics_v1';

const readCacheListCount = (key: string) => {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    return items.length;
  } catch {
    return 0;
  }
};

const readDashboardCache = () => {
  try {
    const raw = sessionStorage.getItem(DASHBOARD_CACHE_KEY);
    return raw
      ? JSON.parse(raw)
      : { users: 0, employers: 0, workers: 0, approvals: 0 };
  } catch {
    return { users: 0, employers: 0, workers: 0, approvals: 0 };
  }
};

const writeDashboardCache = (counts: { users: number; employers: number; workers: number; approvals: number }) => {
  sessionStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(counts));
  sessionStorage.setItem(DASHBOARD_CACHE_TS_KEY, String(Date.now()));
};

const Dashboard: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const [loading, setLoading] = useState(() => !sessionStorage.getItem(DASHBOARD_CACHE_KEY));
  const [warnings, setWarnings] = useState<ApprovalReminder[]>([]);
  const [workerRenewWarnings, setWorkerRenewWarnings] = useState<Array<{ id: number; name: string; daysLeft: number; expiresAt: string }>>([]);
  const [counts, setCounts] = useState(() => {
    const cached = readDashboardCache();
    if (cached.users || cached.employers || cached.workers || cached.approvals) return cached;
    return {
      users: readCacheListCount('cache_users_list_v1'),
      employers: readCacheListCount('cache_employers_list_v1'),
      workers: readCacheListCount('cache_workers_list_v1'),
      approvals: readCacheListCount('cache_approvals_list_v1'),
    };
  });

  useEffect(() => {
    let isMounted = true;
    
    const fetchStats = async () => {
      const startedAt = performance.now();
      const metric: Record<string, number> = {};
      try {
        const savedAt = Number(sessionStorage.getItem(DASHBOARD_CACHE_TS_KEY) || 0);
        const isFresh = Date.now() - savedAt <= DASHBOARD_CACHE_TTL_MS;
        if (isFresh) setLoading(false);

        const timed = async <T,>(name: string, p: Promise<T>) => {
          const t0 = performance.now();
          try {
            return await p;
          } finally {
            metric[name] = Number((performance.now() - t0).toFixed(1));
          }
        };

        getUsers().then(res => {
          if (isMounted) {
            setCounts(prev => {
              const next = { ...prev, users: res?.length || 0 };
              writeDashboardCache(next);
              return next;
            });
          }
        }).catch(console.error);

        timed('employers', getEmployers()).then(res => {
          if (isMounted) {
            setCounts(prev => {
              const next = { ...prev, employers: res?.length || 0 };
              writeDashboardCache(next);
              return next;
            });
          }
        }).catch(console.error);

        timed('workers', getWorkers({ limit: 500 })).then(res => {
          if (isMounted) {
            const workers = res || [];
            setCounts(prev => {
              const next = { ...prev, workers: workers.length || 0 };
              writeDashboardCache(next);
              return next;
            });

            // 勞工續期提醒：到期前 9 個月開始提醒
            try {
              const raw = localStorage.getItem('worker_profiles_v1');
              const profiles = raw ? JSON.parse(raw) : {};
              const today = new Date();
              const remindDays = 9 * 30;

              const reminders = workers
                .map((w: any) => {
                  const p = profiles?.[String(w.id)] || {};
                  const statusUi = w?.labour_status === 'Active' ? '在職' : w?.labour_status === 'Inactive' ? '離職' : w?.labour_status === 'Pending' ? '辦證中' : w?.labour_status;
                  if (statusUi !== '在職') return null;
                  const start = String(p?.arrival_date || '').trim();
                  const months = Number(parseEmploymentMonths(w?.employment_term || p?.employment_term_months || ''));
                  if (!start || !months) return null;
                  const d = new Date(start);
                  if (Number.isNaN(d.getTime())) return null;
                  d.setMonth(d.getMonth() + months);
                  const ms = d.getTime() - today.getTime();
                  const daysLeft = Math.ceil(ms / (1000 * 60 * 60 * 24));
                  if (daysLeft < 0 || daysLeft > remindDays) return null;
                  return {
                    id: Number(w.id),
                    name: String(w.labour_name || '未命名'),
                    daysLeft,
                    expiresAt: d.toISOString().slice(0, 10),
                  };
                })
                .filter(Boolean) as Array<{ id: number; name: string; daysLeft: number; expiresAt: string }>;

              setWorkerRenewWarnings(reminders.sort((a, b) => a.daysLeft - b.daysLeft));
            } catch {
              setWorkerRenewWarnings([]);
            }
          }
        }).catch(console.error);

        timed('approvals', getApprovals({ limit: 500 })).then(res => {
          if (isMounted) {
            const data = res || [];
            setCounts(prev => {
              const next = { ...prev, approvals: data.length };
              writeDashboardCache(next);
              return next;
            });

            // 批文到期提醒：180/90/30（±1天），同一區間去重
            const existing = getApprovalReminders();
            const next = generateApprovalReminders(
              data.map((a: any) => ({
                id: Number(a.id),
                approval_number: a.approval_number,
                employer_name: a.employer_name,
                expiry_date: a.expiry_date,
              })),
              existing
            ) as ApprovalReminder[];
            setApprovalReminders(next);
            setWarnings(next.sort((a, b) => a.window_days - b.window_days));
            setLoading(false); // 批文載入完成後隱藏警告區塊的 loading
            metric.total = Number((performance.now() - startedAt).toFixed(1));
            sessionStorage.setItem(DASHBOARD_PERF_KEY, JSON.stringify({ ...metric, savedAt: Date.now() }));
          }
        }).catch(err => {
          console.error(err);
          if (isMounted) setLoading(false);
        });

      } catch (error) {
        console.error('Failed to init fetch:', error);
        if (isMounted) setLoading(false);
      }
    };

    fetchStats();
    
    return () => {
      isMounted = false;
    };
  }, []);

  const stats = [
    { label: '總用戶數', value: counts.users.toString(), icon: Users, color: 'text-blue-500', bg: 'bg-blue-50' },
    { label: '合作僱主', value: counts.employers.toString(), icon: Building2, color: 'text-green-500', bg: 'bg-green-50' },
    { label: '活躍勞工', value: counts.workers.toString(), icon: Briefcase, color: 'text-purple-500', bg: 'bg-purple-50' },
    { label: '待處理批文', value: counts.approvals.toString(), icon: FileText, color: 'text-orange-500', bg: 'bg-orange-50' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-apple-sm p-8 shadow-sm border border-gray-100">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">
          歡迎回來，{userDisplayPipe(user)}
        </h1>
        <p className="text-gray-500">
          這裡是 Work4HK 勞務管理系統總覽。您可以在此查看系統最新狀態與統計數據。
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="bg-white rounded-apple-sm p-6 shadow-sm border border-gray-100 flex items-center space-x-4">
              <div className={`p-4 rounded-apple-sm ${stat.bg}`}>
                <Icon className={`w-8 h-8 ${stat.color}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">{stat.label}</p>
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400 mt-1" />
                ) : (
                  <p className="text-2xl font-semibold text-gray-900">{stat.value}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 警告提醒區塊 */}
      <div className="bg-white rounded-apple-sm p-6 shadow-sm border border-gray-100 mt-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <AlertCircle className="w-5 h-5 mr-2 text-orange-500" />
          近期警告與提醒
        </h2>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-apple-blue" />
          </div>
        ) : (warnings.length > 0 || workerRenewWarnings.length > 0) ? (
          <div className="space-y-3">
            {workerRenewWarnings.map((w) => (
              <div key={`w-${w.id}`} className="flex items-center justify-between p-4 bg-blue-50/50 border border-blue-100 rounded-apple-sm">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      勞工續期提示：{w.name}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      餘下 {w.daysLeft} 天到期
                    </p>
                  </div>
                </div>
                <div className="text-sm font-medium text-blue-600">
                  到期日：{w.expiresAt}
                </div>
              </div>
            ))}
            {warnings.map((warning) => (
              <div key={warning.id} className="flex items-center justify-between p-4 bg-orange-50/50 border border-orange-100 rounded-apple-sm">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {warning.message}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      狀態：{warning.status === 'read' ? '已讀' : '未讀'}
                    </p>
                  </div>
                </div>
                <div className="text-sm font-medium text-orange-600 text-right">
                  <div>到期日：{warning.expiry_date}</div>
                  <div className="mt-2 flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        markApprovalReminderRead(warning.id);
                        setWarnings(prev => prev.map(x => (x.id === warning.id ? { ...x, status: 'read' } : x)));
                      }}
                      className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 text-gray-700"
                    >
                      標記已讀
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        reRemindApprovalReminder(warning.id);
                        setWarnings(prev => prev.map(x => (x.id === warning.id ? { ...x, status: 'unread' } : x)));
                      }}
                      className="px-2 py-1 text-xs rounded bg-blue-50 hover:bg-blue-100 text-blue-700"
                    >
                      再次提醒
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-apple-sm border border-dashed border-gray-200">
            目前沒有即將到期的批文或勞工續期提醒。
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
