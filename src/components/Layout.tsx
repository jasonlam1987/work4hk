import React, { useEffect, useMemo, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { 
  LayoutDashboard, 
  Users, 
  Building2, 
  Briefcase, 
  FileText, 
  LogOut,
  Settings,
  ShieldCheck,
  Menu,
  X,
  Bell
} from 'lucide-react';
import clsx from 'clsx';
import { getAuthIdentity } from '../utils/authRole';
import { getInAppMessages, getUnreadInAppCount, markAllInAppRead, markInAppMessageRead, subscribeInAppMessages } from '../utils/inAppMessages';

const Layout: React.FC = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [messages, setMessages] = useState<ReturnType<typeof getInAppMessages>>([]);
  const identity = useMemo(() => getAuthIdentity(), [user?.id, user?.role_key, user?.username, user?.full_name]);

  const refreshMessages = () => {
    const list = getInAppMessages(identity.userId, identity.roleKey);
    setMessages(list);
    setUnreadCount(getUnreadInAppCount(identity.userId, identity.roleKey));
  };

  useEffect(() => {
    refreshMessages();
    const unsub = subscribeInAppMessages(refreshMessages);
    return () => unsub();
  }, [identity.userId, identity.roleKey]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: '業務概覽' },
    { to: '/employers', icon: Building2, label: '僱主管理' },
    { to: '/approvals', icon: FileText, label: '批文管理' },
    { to: '/workers', icon: Users, label: '勞工管理' },
    { to: '/jobs', icon: Briefcase, label: '職位管理' },
    { to: '/deletion-approvals', icon: ShieldCheck, label: '審批管理' },
    { to: '/settings', icon: Settings, label: '系統設定' },
  ];

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
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setIsSidebarOpen(false)}
              className={({ isActive }) => clsx(
                "flex items-center space-x-3 px-3 py-2.5 rounded-apple-sm transition-colors duration-200",
                isActive 
                  ? "bg-apple-blue/10 text-apple-blue font-medium" 
                  : "text-gray-600 hover:bg-gray-100/80 hover:text-gray-900"
              )}
            >
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>

        <div className="p-4 border-t border-gray-200/50">
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-900">{user?.full_name || user?.username}</span>
              <span className="text-xs text-gray-500 capitalize">{user?.role_key?.replace('_', ' ')}</span>
            </div>
            <div className="relative flex items-center gap-1">
              <button
                onClick={() => {
                  const next = !noticeOpen;
                  setNoticeOpen(next);
                  if (next) markAllInAppRead(identity.userId, identity.roleKey);
                }}
                className="p-2 text-gray-500 hover:text-apple-blue hover:bg-blue-50 rounded-full transition-colors relative"
                title="消息通知"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] leading-4 text-center">
                    {unreadCount > 99 ? '99+' : unreadCount}
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
              {noticeOpen && (
                <div className="absolute bottom-12 right-0 w-80 max-h-96 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg p-2 z-50">
                  <div className="px-2 py-1 text-xs text-gray-500">消息通知</div>
                  {messages.length === 0 ? (
                    <div className="px-2 py-4 text-xs text-gray-400">暫無新消息</div>
                  ) : (
                    messages.slice(0, 20).map((m) => (
                      <button
                        key={m.id}
                        onClick={() => markInAppMessageRead(m.id)}
                        className={clsx(
                          "w-full text-left px-2 py-2 rounded-lg border mb-1",
                          m.readAt ? "border-gray-100 bg-gray-50" : "border-blue-100 bg-blue-50"
                        )}
                      >
                        <div className="text-xs font-medium text-gray-800">{m.title}</div>
                        <div className="text-xs text-gray-600 mt-1">{m.content}</div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

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
