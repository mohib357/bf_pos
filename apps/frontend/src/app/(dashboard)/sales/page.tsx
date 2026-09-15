'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader, SearchBar } from '@/components/ui/PageHeader';
import { Table, Pagination } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import {
  useSales, useSaleStats, useVoidSale,
  SaleListItem,
} from '@/hooks/useSales';

// ─── Badges ───────────────────────────────────────────────────────────────────

function SaleStatusBadge({ status, isVoided }: { status: string; isVoided: boolean }) {
  if (isVoided) return <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border bg-red-50 text-red-600 border-red-200">Voided / বাতিল</span>;
  const map: Record<string, string> = {
    COMPLETED: 'bg-green-50 text-green-700 border-green-200',
    DRAFT:     'bg-gray-100 text-gray-600 border-gray-200',
    CANCELLED: 'bg-red-50 text-red-600 border-red-200',
    RETURNED:  'bg-orange-50 text-orange-700 border-orange-200',
    PARTIAL:   'bg-yellow-50 text-yellow-700 border-yellow-200',
  };
  const labels: Record<string, string> = {
    COMPLETED: 'Completed/সম্পন্ন', DRAFT: 'Draft/খসড়া',
    CANCELLED: 'Cancelled/বাতিল', RETURNED: 'Returned/ফেরত', PARTIAL: 'Partial/আংশিক',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${map[status] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>
      {labels[status] ?? status}
    </span>
  );
}

function PayStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PAID:    'bg-green-100 text-green-700',
    PARTIAL: 'bg-yellow-100 text-yellow-700',
    PENDING: 'bg-orange-100 text-orange-700',
    OVERDUE: 'bg-red-100 text-red-700',
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>{status}</span>;
}

function PaymentMethodChips({ payments }: { payments: { method: string; amount: string }[] }) {
  const map: Record<string, string> = { CASH: '💵', CARD: '💳', BKASH: '📱', NAGAD: '📲', BANK_TRANSFER: '🏦', DUE: '🔴', CREDIT: '🔴' };
  return (
    <div className="flex flex-wrap gap-1">
      {payments.map((p, i) => (
        <span key={i} className="text-xs bg-gray-100 px-1.5 py-0.5 rounded-full text-gray-600">
          {map[p.method] ?? '💰'} {formatCurrency(p.amount)}
        </span>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SalesPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [voidTarget, setVoidTarget] = useState<SaleListItem | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const { data, isLoading } = useSales({ page, limit: 20, search, status: statusFilter || undefined, from: from || undefined, to: to || undefined });
  const { data: stats } = useSaleStats();
  const voidMutation = useVoidSale();

  const sales: SaleListItem[] = data?.data ?? [];
  const total: number = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  async function handleVoid() {
    if (!voidTarget || !voidReason.trim()) { return; }
    await voidMutation.mutateAsync({ id: voidTarget.id, reason: voidReason });
    setVoidTarget(null);
    setVoidReason('');
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Sales / বিক্রয়"
        titleBn="বিক্রয় তালিকা"
        description="All sales transactions"
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Sales' }]}
        actions={
          <Button variant="primary" onClick={() => router.push('/pos')}>
            + নতুন বিক্রয় / New Sale (POS)
          </Button>
        }
      />

      {/* Stats */}
      {stats && (
        <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-gray-200 bg-white">
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
            <div className="text-xs text-gray-500">Today / আজ</div>
            <div className="text-xl font-bold text-green-700">{formatCurrency(stats.todayTotal)}</div>
            <div className="text-xs text-gray-500">{stats.todayCount} sales</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
            <div className="text-xs text-gray-500">Cash / নগদ</div>
            <div className="text-xl font-bold text-blue-700">{formatCurrency(stats.paymentBreakdown.cash)}</div>
          </div>
          <div className="bg-pink-50 border border-pink-200 rounded-xl p-3 text-center">
            <div className="text-xs text-gray-500">bKash</div>
            <div className="text-xl font-bold text-pink-700">{formatCurrency(stats.paymentBreakdown.bkash)}</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
            <div className="text-xs text-gray-500">Due / বাকি</div>
            <div className="text-xl font-bold text-red-600">{formatCurrency(stats.todayDue)}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="px-6 py-3 flex flex-wrap gap-3 items-center border-b border-gray-200 bg-white">
        <SearchBar value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Search invoice/customer..." className="w-64" />
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">All Status</option>
          <option value="COMPLETED">Completed</option>
          <option value="DRAFT">Draft</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="RETURNED">Returned</option>
        </select>
        <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500" />
        <span className="text-gray-400 text-sm">to</span>
        <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500" />
        {(search || statusFilter || from || to) && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setStatusFilter(''); setFrom(''); setTo(''); setPage(1); }}>
            Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-white">
        <Table<SaleListItem>
          columns={[
            {
              key: 'invoiceNumber',
              header: 'Invoice',
              headerBn: 'চালান',
              render: row => (
                <div>
                  <div className="font-medium text-green-700 hover:underline cursor-pointer" onClick={() => router.push(`/sales/${row.id}`)}>
                    {row.invoiceNumber}
                  </div>
                  <div className="text-xs text-gray-400">{formatDateTime(row.saleDate)}</div>
                </div>
              ),
            },
            {
              key: 'customer',
              header: 'Customer',
              headerBn: 'গ্রাহক',
              render: row => row.customer ? (
                <div>
                  <div className="text-sm font-medium text-gray-800">{row.customer.name}</div>
                  <div className="text-xs text-gray-400">{row.customer.phone}</div>
                </div>
              ) : <span className="text-xs text-gray-400">Walk-in</span>,
            },
            {
              key: 'status',
              header: 'Status',
              headerBn: 'অবস্থা',
              render: row => (
                <div className="flex flex-col gap-1">
                  <SaleStatusBadge status={row.status} isVoided={row.isVoided} />
                  <PayStatusBadge status={row.paymentStatus} />
                </div>
              ),
            },
            {
              key: 'payments',
              header: 'Payments',
              headerBn: 'পেমেন্ট',
              render: row => <PaymentMethodChips payments={row.payments} />,
            },
            {
              key: 'totalAmount',
              header: 'Total',
              headerBn: 'মোট',
              align: 'right',
              render: row => (
                <div className="text-right">
                  <div className="font-semibold text-gray-900">{formatCurrency(row.totalAmount)}</div>
                  {parseFloat(row.dueAmount) > 0 && (
                    <div className="text-xs text-red-500">Due: {formatCurrency(row.dueAmount)}</div>
                  )}
                </div>
              ),
            },
            {
              key: 'actions',
              header: '',
              render: row => (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => router.push(`/sales/${row.id}`)}>View</Button>
                  {!row.isVoided && row.status === 'COMPLETED' && (
                    <Button size="sm" variant="ghost" onClick={() => { setVoidTarget(row); setVoidReason(''); }}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50">
                      Void
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
          data={sales}
          keyField="id"
          loading={isLoading}
          onRowClick={row => router.push(`/sales/${row.id}`)}
          emptyMessage="No sales found"
          emptyMessageBn="কোনো বিক্রয় পাওয়া যায়নি"
        />
        {total > 20 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            limit={20}
            onPageChange={setPage}
          />
        )}
      </div>

      {/* Void Dialog */}
      <Modal
        open={!!voidTarget}
        onClose={() => setVoidTarget(null)}
        title="Void Sale / বিক্রয় বাতিল"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setVoidTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleVoid} loading={voidMutation.isPending} disabled={!voidReason.trim()}>
              Confirm Void / বাতিল নিশ্চিত করুন
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            Invoice: <strong>{voidTarget?.invoiceNumber}</strong> · {formatCurrency(voidTarget?.totalAmount ?? 0)}
          </div>
          <Input
            label="Void Reason (required)"
            labelBn="বাতিলের কারণ"
            value={voidReason}
            onChange={e => setVoidReason(e.target.value)}
            placeholder="e.g. Customer changed mind"
            autoFocus
          />
        </div>
      </Modal>
    </div>
  );
}
