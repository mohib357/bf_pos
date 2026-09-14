'use client';
import { useState } from 'react';
import { PageHeader, SearchBar } from '@/components/ui/PageHeader';
import { Table, Pagination } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { useAuditLogs } from '@/hooks/useAdmin';
import { formatDateTime, cn } from '@/lib/utils';

const ACTION_STYLES: Record<string, string> = {
  CREATE:  'bg-green-100 text-green-700',
  UPDATE:  'bg-blue-100 text-blue-700',
  DELETE:  'bg-red-100 text-red-700',
  LOGIN:   'bg-purple-100 text-purple-700',
  LOGOUT:  'bg-gray-100 text-gray-600',
  VOID:    'bg-orange-100 text-orange-700',
  APPROVE: 'bg-teal-100 text-teal-700',
  REJECT:  'bg-rose-100 text-rose-700',
};

export default function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [tableName, setTableName] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useAuditLogs({
    page, limit: 20,
    action: action || undefined,
    tableName: tableName || undefined,
    from: from || undefined,
    to: to || undefined,
  });

  const logs: any[] = data?.data ?? [];
  const meta = data?.meta;

  const columns = [
    {
      key: 'timestamp',
      header: 'Timestamp', headerBn: 'সময়',
      render: (row: any) => (
        <span className="text-xs text-gray-600 whitespace-nowrap">{formatDateTime(row.createdAt)}</span>
      ),
    },
    {
      key: 'user',
      header: 'User', headerBn: 'ব্যবহারকারী',
      render: (row: any) => (
        <div>
          <p className="text-sm font-medium text-gray-800">{row.user?.username ?? 'System'}</p>
          <p className="text-xs text-gray-400">{row.user?.firstName}</p>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action', headerBn: 'কার্যক্রম',
      render: (row: any) => (
        <span className={cn('px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wide', ACTION_STYLES[row.action] ?? 'bg-gray-100 text-gray-600')}>
          {row.action}
        </span>
      ),
    },
    {
      key: 'module',
      header: 'Module / Record', headerBn: 'মডিউল',
      render: (row: any) => (
        <div>
          <p className="text-sm font-medium text-gray-700">{row.tableName}</p>
          {row.recordId && (
            <p className="text-xs text-gray-400 font-mono">{row.recordId.substring(0, 12)}...</p>
          )}
        </div>
      ),
    },
    {
      key: 'ip',
      header: 'IP / Device', headerBn: 'আইপি',
      render: (row: any) => (
        <div>
          <p className="text-xs text-gray-500 font-mono">{row.ipAddress ?? '—'}</p>
          {row.userAgent && (
            <p className="text-xs text-gray-400 truncate max-w-32" title={row.userAgent}>
              {row.userAgent.substring(0, 30)}...
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'details',
      header: 'Details',
      render: (row: any) => (
        <button
          onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
          className="text-xs text-blue-600 hover:underline"
        >
          {expandedId === row.id ? 'Hide' : 'View'}
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Audit Logs"
        titleBn="অডিট লগ"
        description="Complete activity history of all system operations."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Admin' }, { label: 'Audit Logs' }]}
        actions={
          <button
            onClick={() => {
              setAction('');
              setTableName('');
              setFrom('');
              setTo('');
              setPage(1);
            }}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Clear Filters
          </button>
        }
      />

      <div className="p-6 flex-1 overflow-auto space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <select
            value={action}
            onChange={(e) => { setAction(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">All Actions</option>
            {['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'VOID', 'APPROVE', 'REJECT'].map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <input
            value={tableName}
            onChange={(e) => { setTableName(e.target.value); setPage(1); }}
            placeholder="Filter by table/module..."
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <span className="self-center text-gray-500 text-sm">to</span>
          <input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <div className="ml-auto text-xs text-gray-500 self-center">
            {meta?.total ?? 0} log entries
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Table with expanded rows */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {columns.map(col => (
                    <th key={col.key} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      {col.header}
                      {'headerBn' in col && col.headerBn && <span className="block text-gray-400 normal-case font-normal">{col.headerBn}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {columns.map(col => (
                        <td key={col.key} className="px-4 py-3">
                          <div className="h-4 bg-gray-100 animate-pulse rounded" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="px-4 py-12 text-center text-gray-400 text-sm">
                      No audit logs found / কোনো লগ পাওয়া যায়নি
                    </td>
                  </tr>
                ) : (
                  logs.map(row => (
                    <>
                      <tr key={row.id} className="hover:bg-gray-50">
                        {columns.map(col => (
                          <td key={col.key} className="px-4 py-3 text-gray-700">
                            {col.render ? col.render(row) : row[col.key]}
                          </td>
                        ))}
                      </tr>
                      {expandedId === row.id && (
                        <tr key={`${row.id}-expanded`} className="bg-gray-50">
                          <td colSpan={columns.length} className="px-4 py-3">
                            <div className="grid grid-cols-2 gap-4 text-xs">
                              {row.oldValues && (
                                <div>
                                  <p className="font-semibold text-gray-700 mb-1">Old Values:</p>
                                  <pre className="bg-red-50 border border-red-200 rounded p-2 text-red-800 overflow-auto max-h-32 text-xs">
                                    {JSON.stringify(row.oldValues, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {row.newValues && (
                                <div>
                                  <p className="font-semibold text-gray-700 mb-1">New Values:</p>
                                  <pre className="bg-green-50 border border-green-200 rounded p-2 text-green-800 overflow-auto max-h-32 text-xs">
                                    {JSON.stringify(row.newValues, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {meta && meta.totalPages > 1 && (
            <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} limit={meta.limit} onPageChange={setPage} />
          )}
        </div>
      </div>
    </div>
  );
}
