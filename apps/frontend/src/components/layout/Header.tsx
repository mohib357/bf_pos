'use client';
import { useAuthStore } from '@/store/auth.store';
import { useRouter, usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api';

interface HeaderProps {
  onToggleSidebar: () => void;
  sidebarCollapsed: boolean;
}

// Simple breadcrumb generator from pathname
function useBreadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  const labelMap: Record<string, string> = {
    dashboard: 'Dashboard / ড্যাশবোর্ড',
    pos: 'POS / বিক্রয়',
    sales: 'Sales / বিক্রয়',
    purchases: 'Purchases / ক্রয়',
    products: 'Products / পণ্য',
    inventory: 'Inventory / ইনভেন্টরি',
    customers: 'Customers / গ্রাহক',
    suppliers: 'Suppliers / সরবরাহকারী',
    accounting: 'Accounting / হিসাব',
    reports: 'Reports / রিপোর্ট',
    admin: 'Admin',
    users: 'Users / ব্যবহারকারী',
    roles: 'Roles & Permissions / ভূমিকা',
    'audit-logs': 'Audit Logs / অডিট লগ',
    branches: 'Branches / শাখা',
    settings: 'Settings / সেটিংস',
    new: 'New',
    edit: 'Edit',
    profile: 'Profile',
  };

  return segments.map((seg, i) => ({
    label: labelMap[seg] ?? seg,
    href: i < segments.length - 1 ? '/' + segments.slice(0, i + 1).join('/') : undefined,
  }));
}

export function Header({ onToggleSidebar, sidebarCollapsed }: HeaderProps) {
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const breadcrumbs = useBreadcrumbs();

  // Real notifications from backend
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = async () => {
    try {
      const [listRes, countRes] = await Promise.all([
        apiClient.get('/notifications', { params: { limit: 8 } }),
        apiClient.get('/notifications/unread-count'),
      ]);
      setNotifications(listRes.data?.data ?? []);
      setUnreadCount(countRes.data?.data?.count ?? 0);
    } catch {
      // Silent — notifications are non-critical
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(interval);
  }, []);

  const markAllRead = async () => {
    try {
      await apiClient.post('/notifications/mark-all-read', {});
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch {}
  };

  const handleLogout = async () => {
    setShowUserMenu(false);
    await logout();
    toast.success('লগআউট হয়েছে / Logged out');
    router.push('/login');
  };

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  };

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-3 shrink-0 z-10">
      {/* Sidebar toggle */}
      <button
        onClick={onToggleSidebar}
        className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
        aria-label="Toggle sidebar"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d={sidebarCollapsed ? 'M4 6h16M4 12h16M4 18h16' : 'M4 6h16M4 12h8M4 18h16'} />
        </svg>
      </button>

      {/* Breadcrumbs */}
      <nav className="hidden md:flex items-center gap-1.5 text-xs text-gray-500 flex-1 min-w-0">
        <Link href="/dashboard" className="text-gray-400 hover:text-green-600 shrink-0">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </Link>
        {breadcrumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1.5 min-w-0">
            <span className="text-gray-300">/</span>
            {crumb.href ? (
              <Link href={crumb.href} className="hover:text-green-600 truncate">
                {crumb.label}
              </Link>
            ) : (
              <span className="text-gray-700 font-medium truncate">{crumb.label}</span>
            )}
          </span>
        ))}
      </nav>

      <div className="flex-1 md:flex-none" />

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
        aria-label="Toggle theme"
        title="Toggle theme"
      >
        {theme === 'light' ? (
          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        )}
      </button>

      {/* Notifications */}
      <div className="relative">
        <button
          onClick={() => { setShowNotifications(v => !v); setShowUserMenu(false); }}
          className="relative p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
          aria-label="Notifications"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {/* Real unread count badge */}
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
        {showNotifications && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowNotifications(false)} />
            <div className="absolute right-0 mt-1 w-80 bg-white rounded-xl border border-gray-200 shadow-lg z-20 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Notifications / বিজ্ঞপ্তি</h3>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-xs text-green-600 hover:underline">
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center text-xs text-gray-400">
                    No notifications / কোনো বিজ্ঞপ্তি নেই
                  </div>
                ) : (
                  notifications.map((n: any) => (
                    <div
                      key={n.id}
                      className={cn(
                        'px-4 py-3 border-b border-gray-50 hover:bg-gray-50 cursor-pointer',
                        !n.isRead && 'bg-green-50 border-l-2 border-l-green-500',
                      )}
                    >
                      <div className="flex items-start gap-2">
                        {!n.isRead && (
                          <span className="w-2 h-2 bg-green-500 rounded-full mt-1.5 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm text-gray-700 font-medium truncate">{n.title}</p>
                          {n.titleBn && <p className="text-xs text-gray-500 truncate">{n.titleBn}</p>}
                          <p className="text-xs text-gray-400 mt-0.5">{new Date(n.createdAt).toLocaleString('en-GB')}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="px-4 py-2 border-t border-gray-100 text-center">
                <span className="text-xs text-gray-400">
                  Served from <code className="bg-gray-100 px-1 rounded">/api/v1/notifications</code>
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* User menu */}
      <div className="relative">
        <button
          onClick={() => { setShowUserMenu(v => !v); setShowNotifications(false); }}
          className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <div className="w-7 h-7 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm">
            {user?.firstName?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <span className="text-sm font-medium text-gray-700 hidden sm:block max-w-24 truncate">
            {user?.firstName}
          </span>
          <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showUserMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowUserMenu(false)} />
            <div className="absolute right-0 mt-1 w-56 bg-white rounded-xl border border-gray-200 shadow-lg z-20 py-1 overflow-hidden">
              {/* Profile info */}
              <div className="px-4 py-3 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                    {user?.firstName?.[0]?.toUpperCase() ?? 'U'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{user?.firstName} {user?.lastName}</p>
                    <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                    <p className="text-xs text-green-600 font-medium mt-0.5">
                      {user?.roles?.[0]?.replace(/_/g, ' ')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Menu items */}
              <div className="py-1">
                <Link
                  href="/profile"
                  onClick={() => setShowUserMenu(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  My Profile / প্রোফাইল
                </Link>
                <Link
                  href="/profile/change-password"
                  onClick={() => setShowUserMenu(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                      d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  Change Password / পাসওয়ার্ড
                </Link>
              </div>

              <div className="border-t border-gray-100 py-1">
                <button
                  onClick={handleLogout}
                  className="w-full text-left flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Logout / লগআউট
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
