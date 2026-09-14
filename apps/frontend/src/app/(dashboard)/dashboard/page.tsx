'use client';
import { useAdminDashboard } from '@/hooks/useAdmin';
import { StatCard } from '@/components/ui/Card';
import { formatCurrency, formatDateTime, cn } from '@/lib/utils';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar,
} from 'recharts';

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PAID:    'bg-green-100 text-green-700',
    PARTIAL: 'bg-yellow-100 text-yellow-700',
    PENDING: 'bg-red-100 text-red-700',
    COMPLETED: 'bg-green-100 text-green-700',
  };
  const labels: Record<string, string> = {
    PAID:     'Paid / পরিশোধিত',
    PARTIAL:  'Partial / আংশিক',
    PENDING:  'Due / বকেয়া',
    COMPLETED:'Completed',
  };
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', map[status] ?? 'bg-gray-100 text-gray-600')}>
      {labels[status] ?? status}
    </span>
  );
}

function ActionBadge({ action }: { action: string }) {
  const map: Record<string, string> = {
    CREATE: 'bg-green-100 text-green-700',
    UPDATE: 'bg-blue-100 text-blue-700',
    DELETE: 'bg-red-100 text-red-700',
    LOGIN:  'bg-purple-100 text-purple-700',
    LOGOUT: 'bg-gray-100 text-gray-600',
    VOID:   'bg-orange-100 text-orange-700',
    APPROVE:'bg-teal-100 text-teal-700',
  };
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', map[action] ?? 'bg-gray-100 text-gray-600')}>
      {action}
    </span>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color }}>
          {entry.name}: <span className="font-medium">{typeof entry.value === 'number' && entry.name?.includes('Sales') ? formatCurrency(entry.value) : entry.value}</span>
        </p>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { data: stats, isLoading, isError, refetch } = useAdminDashboard();

  const today = stats?.today;
  const inventory = stats?.inventory;
  const financial = stats?.financial;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard / ড্যাশবোর্ড</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
        >
          <svg className={cn('w-4 h-4', isLoading && 'animate-spin')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
          Failed to load dashboard data.
          <button onClick={() => refetch()} className="underline font-medium ml-1">Retry</button>
        </div>
      )}

      {/* KPI Row 1: Today's financials */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Today's Sales" labelBn="আজকের বিক্রয়"
          value={formatCurrency(today?.sales ?? 0)}
          subValue={`${today?.transactions ?? 0} transactions`}
          color="green" loading={isLoading}
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <StatCard
          label="Today's Expenses" labelBn="আজকের খরচ"
          value={formatCurrency(today?.expenses ?? 0)}
          color="red" loading={isLoading}
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
        />
        <StatCard
          label="Gross Profit" labelBn="মোট মুনাফা"
          value={formatCurrency(today?.grossProfit ?? 0)}
          color="blue" loading={isLoading}
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
        />
        <StatCard
          label="Inventory Value" labelBn="মজুদ মূল্য"
          value={formatCurrency(inventory?.inventoryValue ?? 0)}
          color="purple" loading={isLoading}
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
        />
      </div>

      {/* KPI Row 2: inventory + receivables */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Customer Due" labelBn="গ্রাহক বকেয়া"
          value={formatCurrency(financial?.customerDue ?? 0)}
          color="yellow" loading={isLoading}
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
        />
        <StatCard
          label="Supplier Payable" labelBn="সরবরাহকারী বকেয়া"
          value={formatCurrency(financial?.supplierPayable ?? 0)}
          color="red" loading={isLoading}
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" /></svg>}
        />
        <StatCard
          label="Low Stock" labelBn="কম স্টক"
          value={String(inventory?.lowStockCount ?? 0)}
          subValue="items below reorder level"
          color="yellow" loading={isLoading}
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
        />
        <StatCard
          label="Out of Stock" labelBn="স্টক নেই"
          value={String(inventory?.outOfStockCount ?? 0)}
          color="red" loading={isLoading}
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Sales — Last 7 Days</h2>
              <p className="text-xs text-gray-500">শেষ ৭ দিনের বিক্রয়</p>
            </div>
          </div>
          {isLoading ? (
            <div className="h-48 bg-gray-50 animate-pulse rounded-lg" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={stats?.salesChart ?? []} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => `৳${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="sales" name="Sales (BDT)"
                  stroke="#16a34a" strokeWidth={2} fill="url(#salesGrad)" dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-gray-800">Daily Transactions</h2>
            <p className="text-xs text-gray-500">দৈনিক লেনদেন</p>
          </div>
          {isLoading ? (
            <div className="h-48 bg-gray-50 animate-pulse rounded-lg" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stats?.salesChart ?? []} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Bar dataKey="transactions" name="Txns" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Bottom row: recent sales + recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Recent Sales */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Recent Sales</h2>
              <p className="text-xs text-gray-500">সাম্প্রতিক বিক্রয়</p>
            </div>
            <a href="/sales" className="text-xs text-green-600 hover:text-green-700 font-medium">View all →</a>
          </div>
          {isLoading ? (
            <div className="p-5 space-y-3">{[1,2,3].map(i => <div key={i} className="h-10 bg-gray-50 animate-pulse rounded" />)}</div>
          ) : !stats?.recentSales?.length ? (
            <div className="p-8 text-center text-gray-400 text-sm">No sales yet / এখনও কোনো বিক্রয় নেই</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {stats.recentSales.slice(0, 6).map((sale: any) => (
                <div key={sale.id} className="flex items-center px-5 py-3 hover:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-green-600 truncate">{sale.invoiceNumber}</p>
                    <p className="text-xs text-gray-500 truncate">{sale.customerName ?? 'Walk-in'}</p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-sm font-semibold text-gray-900">{formatCurrency(sale.totalAmount)}</p>
                    <StatusBadge status={sale.paymentStatus} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Recent Activity</h2>
              <p className="text-xs text-gray-500">সাম্প্রতিক কার্যক্রম</p>
            </div>
            <a href="/admin/audit-logs" className="text-xs text-green-600 hover:text-green-700 font-medium">View logs →</a>
          </div>
          {isLoading ? (
            <div className="p-5 space-y-3">{[1,2,3].map(i => <div key={i} className="h-10 bg-gray-50 animate-pulse rounded" />)}</div>
          ) : !stats?.recentActivity?.length ? (
            <div className="p-8 text-center text-gray-400 text-sm">No activity yet</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {stats.recentActivity.slice(0, 6).map((log: any) => (
                <div key={log.id} className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50">
                  <ActionBadge action={log.action} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate">
                      {log.user?.username ?? 'System'} — {log.tableName}
                      {log.recordId ? ` #${log.recordId.substring(0, 8)}` : ''}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(log.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { href: '/pos', label: 'New Sale', labelBn: 'নতুন বিক্রয়', color: 'bg-green-600 hover:bg-green-700', emoji: '💰' },
          { href: '/purchases/new', label: 'New Purchase', labelBn: 'নতুন ক্রয়', color: 'bg-blue-600 hover:bg-blue-700', emoji: '📦' },
          { href: '/admin/users/new', label: 'Add User', labelBn: 'ব্যবহারকারী যোগ', color: 'bg-purple-600 hover:bg-purple-700', emoji: '👤' },
          { href: '/reports', label: 'Reports', labelBn: 'রিপোর্ট', color: 'bg-orange-600 hover:bg-orange-700', emoji: '📊' },
        ].map((a) => (
          <a key={a.href} href={a.href}
            className={cn('flex items-center gap-3 px-4 py-3 rounded-xl text-white font-medium text-sm transition-colors shadow-sm', a.color)}
          >
            <span className="text-xl">{a.emoji}</span>
            <span>
              <span className="block">{a.label}</span>
              <span className="text-xs opacity-80">{a.labelBn}</span>
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
