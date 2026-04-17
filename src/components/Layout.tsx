import React, { useEffect, useMemo, useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { 
  LayoutDashboard, 
  Users, 
  Building2, 
  Briefcase, 
  FileText, 
  ClipboardList,
  LogOut,
  Settings,
  ShieldCheck,
  Menu,
  X,
  Bell,
  ChevronDown
} from 'lucide-react';
import clsx from 'clsx';
import { canAccessPath, getAuthIdentity, getRoleLabel } from '../utils/authRole';
import { getInAppMessages, getUnreadInAppCount, markAllInAppRead, markInAppMessageRead, subscribeInAppMessages } from '../utils/inAppMessages';
import { userDisplayPipe } from '../utils/userDisplayPipe';
import { listDeleteRequests } from '../api/fileDeletion';
import { listQuotaDeleteRequests } from '../utils/quotaDeleteRequests';
import { listEntityDeleteRequests } from '../utils/entityDeleteRequests';
import { subscribeDeleteNotice } from '../utils/deleteNotifications';
import { getDisplayVersion } from '../utils/version';

type PendingPreviewItem = {
  id: string;
  type: string;
  company: string;
  reason: string;
  createdAt: string;
};

const PENDING_NOTICE_READ_KEY = 'work4hk_pending_notice_reads_v1';

const readPendingNoticeReads = (): Record<string, number> => {
  try {
    const raw = localStorage.getItem(PENDING_NOTICE_READ_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writePendingNoticeReads = (map: Record<string, number>) => {
  localStorage.setItem(PENDING_NOTICE_READ_KEY, JSON.stringify(map));
};

const Layout: React.FC = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [applyDocsOpen, setApplyDocsOpen] = useState(true);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const [pendingPreviewItems, setPendingPreviewItems] = useState<PendingPreviewItem[]>([]);
  const [pendingReadMap, setPendingReadMap] = useState<Record<string, number>>(() => readPendingNoticeReads());
  const [messages, setMessages] = useState<ReturnType<typeof getInAppMessages>>([]);
  const identity = useMemo(() => getAuthIdentity(), [user?.id, user?.role_key, user?.username, user?.full_name]);
  const displayVersion = useMemo(() => getDisplayVersion(), []);

  const refreshIndicators = async () => {
    const list = getInAppMessages(identity.userId, identity.roleKey);
    setMessages(list);
    setUnreadCount(getUnreadInAppCount(identity.userId, identity.roleKey));
    if (identity.roleKey !== 'super_admin') {
      setPendingApprovalCount(0);
      setPendingPreviewItems([]);
      return;
    }
    try {
      const fileRows = await listDeleteRequests().catch(() => []);
      const quotaRows = listQuotaDeleteRequests();
      const entityRows = listEntityDeleteRequests();
      const filePending = fileRows
        .filter((x) => x.status === 'PENDING')
        .map((x) => ({
          id: x.request_id,
          type: '刪除附件',
          company: String(x.company_name || '-'),
          reason: String(x.reason || ''),
          createdAt: String(x.created_at || ''),
        }));
      const quotaPending = quotaRows
        .filter((x) => x.status === 'PENDING')
        .map((x) => ({
          id: x.request_id,
          type: '刪除申請配額',
          company: String(x.company_name || '-'),
          reason: String(x.reason || ''),
          createdAt: String(x.created_at || ''),
        }));
      const entityPending = entityRows
        .filter((x) => x.status === 'PENDING')
        .map((x) => ({
          id: x.request_id,
          type: x.module === 'approvals' ? '刪除批文' : x.module === 'employers' ? '刪除僱主' : '刪除勞工',
          company: String(x.company_name || '-'),
          reason: String(x.reason || ''),
          createdAt: String(x.created_at || ''),
        }));
      const pendingAll = [...filePending, ...quotaPending, ...entityPending]
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      setPendingApprovalCount(pendingAll.length);
      setPendingPreviewItems(pendingAll.slice(0, 20));
    } catch {
      setPendingApprovalCount(0);
      setPendingPreviewItems([]);
    }
  };

  useEffect(() => {
    void refreshIndicators();
    const unsubMsg = subscribeInAppMessages(() => {
      void refreshIndicators();
    });
    const unsubDelete = subscribeDeleteNotice(() => {
      void refreshIndicators();
    });
    return () => {
      unsubMsg();
      unsubDelete();
    };
  }, [identity.userId, identity.roleKey]);
  const pendingUnreadCount = pendingPreviewItems.filter((x) => !pendingReadMap[x.id]).length;
  const displayNoticeCount = unreadCount > 0 ? unreadCount : pendingUnreadCount;

  const markPendingRead = (id: string) => {
    setPendingReadMap((prev) => {
      const next = { ...prev, [id]: Date.now() };
      writePendingNoticeReads(next);
      return next;
    });
  };

  const markAllNotificationsRead = () => {
    markAllInAppRead(identity.userId, identity.roleKey);
    setPendingReadMap((prev) => {
      const next = { ...prev };
      for (const item of pendingPreviewItems) {
        next[item.id] = Date.now();
      }
      writePendingNoticeReads(next);
      return next;
    });
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const formatAt = (v?: string | number) => {
    const d = v ? new Date(v) : null;
    if (!d || Number.isNaN(d.getTime())) return '-';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}/${m}/${day} ${hh}:${mm}`;
  };

  const navItemsTop = [
    { to: '/dashboard', icon: LayoutDashboard, label: '業務概覽' },
    { to: '/employers', icon: Building2, label: '僱主管理' },
    { to: '/approvals', icon: FileText, label: '批文管理' },
    { to: '/workers', icon: Users, label: '勞工管理' },
    { to: '/jobs', icon: Briefcase, label: '職位管理' },
  ];
  const navItemsBottom = [
    { to: '/deletion-approvals', icon: ShieldCheck, label: '審批管理' },
    { to: '/settings', icon: Settings, label: '系統設定' },
  ];
  const applyDocChildren = [
    { to: '/quota-applications', icon: ClipboardList, label: '申請配額' },
    { to: '/work-visa-applications', icon: FileText, label: '申請工簽' },
  ].filter((item) => canAccessPath(item.to, identity.roleKey));
  const isApplyDocActive = applyDocChildren.some(
    (item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)
  );
  const visibleTopNavItems = navItemsTop.filter((item) => canAccessPath(item.to, identity.roleKey));
  const visibleBottomNavItems = navItemsBottom.filter((item) => canAccessPath(item.to, identity.roleKey));

  useEffect(() => {
    if (isApplyDocActive) setApplyDocsOpen(true);
  }, [isApplyDocActive]);

  return (
    <div className="min-h-screen bg-apple-gray flex">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-20 lg:hidden backdrop-blur-sm"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={clsx(
        "fixed lg:static inset-y-0 left-0 z-30 w-64 bg-white/80 backdrop-blur-xl border-r border-gray-200/50 transition-transform duration-300 ease-in-out lg:transform-none flex flex-col",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="px-6 py-8 flex items-center justify-between">
          <img src="/logo.svg" alt="Work4HK Logo" className="h-12 w-auto object-contain" />
          <button className="lg:hidden" onClick={() => setIsSidebarOpen(false)}>
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 space-y-1">
          {visibleTopNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setIsSidebarOpen(false)}
              className={({ isActive }) => clsx(
                "relative flex items-center space-x-3 px-3 py-2.5 rounded-apple-sm transition-colors duration-200",
                isActive 
                  ? "bg-apple-blue/10 text-apple-blue font-medium" 
                  : "text-gray-600 hover:bg-gray-100/80 hover:text-gray-900"
              )}
            >
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
              {item.to === '/deletion-approvals' && pendingApprovalCount > 0 && (
                <span className="absolute right-2 top-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] leading-4 text-center">
                  {pendingApprovalCount > 99 ? '99+' : pendingApprovalCount}
                </span>
              )}
            </NavLink>
          ))}
          {applyDocChildren.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setApplyDocsOpen((prev) => !prev)}
                className={clsx(
                  "w-full relative flex items-center px-3 py-2.5 rounded-apple-sm transition-colors duration-200",
                  isApplyDocActive
                    ? "bg-apple-blue/10 text-apple-blue font-medium"
                    : "text-gray-600 hover:bg-gray-100/80 hover:text-gray-900"
                )}
              >
                <ClipboardList className="w-5 h-5" />
                <span className="ml-3 flex-1 text-left">申請文件</span>
                <ChevronDown className={clsx("w-4 h-4 transition-transform", applyDocsOpen ? "rotate-180" : "rotate-0")} />
              </button>
              {applyDocsOpen && (
                <div className="ml-7 pl-3 border-l border-gray-200 space-y-1">
                  {applyDocChildren.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setIsSidebarOpen(false)}
                      className={({ isActive }) => clsx(
                        "relative flex items-center space-x-2 px-3 py-2 rounded-apple-sm text-sm transition-colors duration-200",
                        isActive
                          ? "bg-apple-blue/10 text-apple-blue font-medium"
                          : "text-gray-600 hover:bg-gray-100/80 hover:text-gray-900"
                      )}
                    >
                      <item.icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </>
          )}
          {visibleBottomNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setIsSidebarOpen(false)}
              className={({ isActive }) => clsx(
                "relative flex items-center space-x-3 px-3 py-2.5 rounded-apple-sm transition-colors duration-200",
                isActive
                  ? "bg-apple-blue/10 text-apple-blue font-medium"
                  : "text-gray-600 hover:bg-gray-100/80 hover:text-gray-900"
              )}
            >
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
              {item.to === '/deletion-approvals' && pendingApprovalCount > 0 && (
                <span className="absolute right-2 top-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] leading-4 text-center">
                  {pendingApprovalCount > 99 ? '99+' : pendingApprovalCount}
                </span>
              )}
            </NavLink>
          ))}
        </div>

        <div className="p-4 border-t border-gray-200/50">
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-900">{userDisplayPipe(user)}</span>
              <span className="text-xs text-gray-500">{getRoleLabel(user?.role_key || '')}</span>
              <span className="text-[11px] text-gray-400 mt-0.5">Version {displayVersion}</span>
            </div>
            <div className="relative flex items-center gap-1">
              <button
                onClick={() => {
                  setNoticeOpen(!noticeOpen);
                }}
                className="p-2 text-gray-500 hover:text-apple-blue hover:bg-blue-50 rounded-full transition-colors relative"
                title="消息通知"
                aria-label="打開消息通知"
              >
                <Bell className="w-4 h-4" />
                {displayNoticeCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] leading-4 text-center">
                    {displayNoticeCount > 99 ? '99+' : displayNoticeCount}
                  </span>
                )}
              </button>
              <button
                onClick={handleLogout}
                className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                title="登出"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>
      {noticeOpen && (
        <div className="fixed inset-0 z-50" role="dialog" aria-label="消息通知面板">
          <div className="absolute inset-0 bg-black/20" onClick={() => setNoticeOpen(false)} />
          <div className="absolute left-3 right-3 bottom-20 lg:left-72 lg:right-auto lg:bottom-6 lg:w-[420px] max-h-[70vh] overflow-y-auto bg-white border border-gray-200 rounded-2xl shadow-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-900">消息通知</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={markAllNotificationsRead}
                  className="px-2 py-1 text-xs rounded border border-blue-200 text-blue-700 hover:bg-blue-50"
                  aria-label="全部已閱"
                >
                  全部已閱
                </button>
                <button
                  type="button"
                  onClick={() => setNoticeOpen(false)}
                  className="px-2 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50"
                  aria-label="關閉消息通知"
                >
                  關閉
                </button>
              </div>
            </div>
            {messages.length === 0 && pendingPreviewItems.length === 0 ? (
              <div className="px-3 py-6 text-sm text-gray-400 text-center">暫無新消息</div>
            ) : (
              <div role="list" className="space-y-2">
                {messages.length === 0 && pendingPreviewItems.length > 0 && (
                  pendingPreviewItems.map((m) => (
                    <button
                      type="button"
                      key={m.id}
                      onClick={() => markPendingRead(m.id)}
                      className={clsx(
                        "w-full text-left p-3 rounded-xl border transition-colors",
                        pendingReadMap[m.id]
                          ? "border-gray-200 bg-white"
                          : "border-blue-200 bg-blue-50"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-gray-900">{m.type}</div>
                        <span className={clsx(
                          "text-xs px-2 py-0.5 rounded-full",
                          pendingReadMap[m.id] ? "bg-gray-100 text-gray-600" : "bg-amber-100 text-amber-700"
                        )}>
                          {pendingReadMap[m.id] ? '已閱' : '待審批'}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600 mt-1">公司：{m.company}</div>
                      <div className="text-xs text-gray-600 mt-1">原因：{m.reason || '-'}</div>
                      <div className="text-[11px] text-gray-400 mt-2">{formatAt(m.createdAt)}</div>
                    </button>
                  ))
                )}
                {messages.slice(0, 20).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => markInAppMessageRead(m.id)}
                    className={clsx(
                      "w-full text-left p-3 rounded-xl border transition-colors",
                      m.readAt ? "border-gray-200 bg-white" : "border-blue-200 bg-blue-50"
                    )}
                    aria-label={`查看消息：${m.title}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-gray-900">{m.title}</div>
                      {m.kind === 'delete_review' && (
                        <span className={clsx(
                          "text-xs px-2 py-0.5 rounded-full",
                          m.status === 'APPROVED' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                        )}>
                          {m.status === 'APPROVED' ? '允許' : '拒絕'}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">{m.content}</div>
                    {m.kind === 'delete_review' && (
                      <div className="mt-2 rounded-lg border border-gray-200 bg-white p-2 text-xs text-gray-700">
                        <div><span className="font-medium">審批結果：</span>{m.status === 'APPROVED' ? '已允許刪除' : '已拒絕刪除'}</div>
                        <div><span className="font-medium">附件：</span>{m.fileName || '-'}</div>
                        <div><span className="font-medium">操作時間：</span>{formatAt(m.operatedAt || m.createdAt)}</div>
                        <div className="mt-1"><span className="font-medium">拒絕原因：</span>{m.status === 'REJECTED' ? (m.rejectReason || '未提供') : '-'}</div>
                      </div>
                    )}
                    <div className="text-[11px] text-gray-400 mt-2">{formatAt(m.createdAt)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 lg:hidden bg-white/80 backdrop-blur-xl border-b border-gray-200/50 flex items-center px-4 justify-between sticky top-0 z-10">
          <div className="flex items-center space-x-3">
            <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 text-gray-600">
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="font-semibold text-lg">Work4HK 勞務管理系統</h1>
          </div>
        </header>
        <div className="flex-1 p-4 lg:p-8 overflow-y-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
