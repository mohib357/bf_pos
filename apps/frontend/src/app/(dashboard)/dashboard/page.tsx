'use client';
import { StatCard } from '@/components/ui/Card';
import { useDashboardStats } from '@/hooks/useDashboard';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar, Legend,
} from 'recharts';
import { cn } from '@/lib/utils';

// ── Payment status badge ─────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PAID:    'bg-green-100 text-green-700',
    PARTIAL: 'bg-yellow-100 text-yellow-700',
    PENDING: 'bg-red-100 text-red-700',
  };
  const labels: Record<string, string> = {
    PAID: 'Paid / পরিশোধিত',
    PARTIAL: 'Partial / আংশিক',
    PENDING: 'Due / বকেয়া',
  };
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', map[status] ?? 'bg-gray-100 text-gray-600')}>
      {labels[status] ?? status}
    </span>
  );
}

// ── Custom tooltip for recharts ───────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color }}>
          {entry.name}: <span className="font-medium">{formatCurrency(entry.value)}</span>
        </p>
      ))}
    </div>
  );
}

// ── Main Dashboard Page ───────────────────────────────────────────────────────
export default function DashboardPage() {
  const { data: stats, isLoading, isError, refetch } = useDashboardStats();

  return (
    <div className="p-6 space-y-6">
      {/* Page heading */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard / ড্যাশবোর্ড</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Barakah Finance — Library &amp; Stationery
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <svg className={cn('w-4 h-4', isLoading && 'animate-spin')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Error state */}
      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          Failed to load dashboard data. &nbsp;
          <button onClick={() => refetch()} className="underline font-medium">Retry</button>
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Today's Sales"
          labelBn="আজকের বিক্রয়"
          value={formatCurrency(stats?.todaySales ?? 0)}
          subValue={`${stats?.todayTransactions ?? 0} transactions`}
          color="green"
          loading={isLoading}
          trend={{ value: 12, label: 'vs yesterday' }}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Total Products"
          labelBn="মোট পণ্য"
          value={String(stats?.totalProducts ?? 0)}
          color="blue"
          loading={isLoading}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          }
        />
        <StatCard
          label="Low Stock Items"
          labelBn="কম স্টকের পণ্য"
          value={String(stats?.lowStockCount ?? 0)}
          color="yellow"
          loading={isLoading}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          }
        />
        <StatCard
          label="Total Due"
          labelBn="মোট বকেয়া"
          value={formatCurrency(stats?.totalDue ?? 0)}
          color="red"
          loading={isLoading}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          }
        />
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Sales area chart — 2/3 width */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Sales (Last 7 Days)</h2>
              <p className="text-xs text-gray-500">শেষ ৭ দিনের বিক্রয়</p>
            </div>
            <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">Daily</span>
          </div>
          {isLoading ? (
            <div className="h-48 bg-gray-50 animate-pulse rounded-lg" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={stats?.salesChartData ?? []} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
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

        {/* Transaction bar chart — 1/3 width */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-gray-800">Transactions</h2>
            <p className="text-xs text-gray-500">দৈনিক লেনদেন সংখ্যা</p>
          </div>
          {isLoading ? (
            <div className="h-48 bg-gray-50 animate-pulse rounded-lg" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stats?.salesChartData ?? []} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
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

      {/* ── Recent Sales table ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Recent Sales</h2>
            <p className="text-xs text-gray-500">সাম্প্রতিক বিক্রয়</p>
          </div>
          <a href="/sales" className="text-xs text-green-600 hover:text-green-700 font-medium">
            View all &rarr;
          </a>
        </div>

        {isLoading ? (
          <div className="p-5 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-gray-50 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : !stats?.recentSales?.length ? (
          <div className="p-10 text-center text-gray-400">
            <svg className="w-10 h-10 mx-auto mb-2 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm">No sales yet / এখনও কোনো বিক্রয় নেই</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Invoice</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {stats.recentSales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <a href={`/sales/${sale.id}`} className="text-green-600 hover:text-green-700 font-medium">
                        {sale.invoiceNumber}
                      </a>
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {sale.customerName ?? <span className="text-gray-400 italic">Walk-in</span>}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-gray-900">
                      {formatCurrency(sale.totalAmount)}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <StatusBadge status={sale.paymentStatus} />
                    </td>
                    <td className="px-5 py-3 text-right text-gray-500 text-xs">
                      {formatDateTime(sale.saleDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Quick actions ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { href: '/pos', label: 'New Sale', labelBn: 'নতুন বিক্রয়', color: 'bg-green-600 hover:bg-green-700', icon: '💰' },
          { href: '/purchases/new', label: 'New Purchase', labelBn: 'নতুন ক্রয়', color: 'bg-blue-600 hover:bg-blue-700', icon: '📦' },
          { href: '/products/new', label: 'Add Product', labelBn: 'পণ্য যোগ', color: 'bg-purple-600 hover:bg-purple-700', icon: '➕' },
          { href: '/reports', label: 'Reports', labelBn: 'রিপোর্ট', color: 'bg-orange-600 hover:bg-orange-700', icon: '📊' },
        ].map((action) => (
          <a
            key={action.href}
            href={action.href}
            className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-xl text-white font-medium text-sm transition-colors shadow-sm',
              action.color,
            )}
          >
            <span className="text-lg">{action.icon}</span>
            <span>
              <span className="block">{action.label}</span>
              <span className="text-xs opacity-80">{action.labelBn}</span>
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
