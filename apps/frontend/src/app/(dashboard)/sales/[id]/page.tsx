'use client';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Table } from '@/components/ui/Table';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { useSaleDetail, useVoidSale, useAddSalePayment, SaleItem } from '@/hooks/useSales';

function Badge({ label, color }: { label: string; color: string }) {
  return <span className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full ${color}`}>{label}</span>;
}

export default function SaleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: sale, isLoading } = useSaleDetail(id);
  const voidMutation = useVoidSale();
  const paymentMutation = useAddSalePayment();

  const [showVoid, setShowVoid] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [payMethod, setPayMethod] = useState('CASH');
  const [payAmount, setPayAmount] = useState('');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!sale) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-gray-500">Sale not found / বিক্রয় পাওয়া যায়নি</p>
        <Button variant="outline" onClick={() => router.push('/sales')}>Back to Sales</Button>
      </div>
    );
  }

  const due = parseFloat(sale.dueAmount);

  async function handleVoid() {
    if (!voidReason.trim()) return;
    await voidMutation.mutateAsync({ id, reason: voidReason });
    setShowVoid(false);
  }

  async function handlePayment() {
    if (!payAmount || parseFloat(payAmount) <= 0) return;
    await paymentMutation.mutateAsync({ id, data: { method: payMethod, amount: parseFloat(payAmount) } });
    setShowPayment(false);
    setPayAmount('');
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={`Sale ${sale.invoiceNumber}`}
        titleBn="বিক্রয় বিবরণ"
        description={formatDateTime(sale.saleDate)}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Sales', href: '/sales' },
          { label: sale.invoiceNumber },
        ]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push(`/sales/receipt/${id}`)}>
              🖨️ Receipt
            </Button>
            {due > 0 && !sale.isVoided && (
              <Button variant="primary" onClick={() => setShowPayment(true)}>
                Collect Payment
              </Button>
            )}
            {!sale.isVoided && sale.status === 'COMPLETED' && (
              <Button variant="danger" onClick={() => setShowVoid(true)}>
                Void Sale
              </Button>
            )}
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Status bar */}
        <div className="flex flex-wrap gap-3 items-center">
          <Badge
            label={sale.isVoided ? 'VOIDED' : sale.status}
            color={sale.isVoided ? 'bg-red-100 text-red-700' : sale.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}
          />
          <Badge
            label={sale.paymentStatus}
            color={sale.paymentStatus === 'PAID' ? 'bg-green-100 text-green-700' : sale.paymentStatus === 'PARTIAL' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}
          />
          {sale.isVoided && sale.voidReason && (
            <span className="text-sm text-red-600 bg-red-50 px-3 py-1 rounded-full border border-red-200">
              Reason: {sale.voidReason}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Customer & info */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Sale Information</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Invoice</dt>
                  <dd className="font-semibold text-green-700">{sale.invoiceNumber}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Date</dt>
                  <dd>{formatDateTime(sale.saleDate)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Cashier</dt>
                  <dd>{sale.creator?.firstName ?? sale.creator?.username ?? '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Customer</dt>
                  <dd>{sale.customer?.name ?? 'Walk-in'}</dd>
                </div>
                {sale.notes && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Notes</dt>
                    <dd className="text-right max-w-[60%]">{sale.notes}</dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Payment summary */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Payment Summary</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-gray-500">Subtotal</dt><dd>{formatCurrency(sale.subtotal)}</dd></div>
                {parseFloat(sale.discountAmount) > 0 && <div className="flex justify-between text-green-600"><dt>Discount</dt><dd>-{formatCurrency(sale.discountAmount)}</dd></div>}
                {parseFloat(sale.taxAmount) > 0 && <div className="flex justify-between"><dt className="text-gray-500">Tax/VAT</dt><dd>{formatCurrency(sale.taxAmount)}</dd></div>}
                <div className="flex justify-between border-t pt-2 font-bold"><dt>Grand Total</dt><dd className="text-green-700">{formatCurrency(sale.totalAmount)}</dd></div>
                <div className="flex justify-between text-green-600"><dt>Paid</dt><dd>{formatCurrency(sale.paidAmount)}</dd></div>
                {due > 0 && <div className="flex justify-between text-red-600 font-semibold"><dt>Due / বাকি</dt><dd>{formatCurrency(sale.dueAmount)}</dd></div>}
                {parseFloat(sale.changeAmount) > 0 && <div className="flex justify-between text-blue-600"><dt>Change</dt><dd>{formatCurrency(sale.changeAmount)}</dd></div>}
              </dl>

              <div className="mt-3 pt-3 border-t">
                <p className="text-xs font-semibold text-gray-500 mb-2">Payment Methods</p>
                {sale.payments.map((p, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-gray-600">{p.method}</span>
                    <span>{formatCurrency(p.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700">Items ({sale.items.length})</h3>
              </div>
              <Table<SaleItem>
                columns={[
                  {
                    key: 'product',
                    header: 'Product',
                    headerBn: 'পণ্য',
                    render: row => (
                      <div>
                        <div className="text-sm font-medium">{row.product.nameBn ?? row.product.name}</div>
                        <div className="text-xs text-gray-400">{row.product.name} · {row.product.sku}</div>
                      </div>
                    ),
                  },
                  {
                    key: 'quantity',
                    header: 'Qty',
                    align: 'right',
                    render: row => <span className="font-medium">{parseFloat(row.quantity).toFixed(0)} {row.unit?.abbreviation ?? ''}</span>,
                  },
                  {
                    key: 'unitPrice',
                    header: 'Price',
                    align: 'right',
                    render: row => formatCurrency(row.unitPrice),
                  },
                  {
                    key: 'discountAmount',
                    header: 'Discount',
                    align: 'right',
                    render: row => parseFloat(row.discountAmount) > 0
                      ? <span className="text-green-600">-{formatCurrency(row.discountAmount)}</span>
                      : <span className="text-gray-300">—</span>,
                  },
                  {
                    key: 'totalAmount',
                    header: 'Total',
                    align: 'right',
                    render: row => <span className="font-semibold text-green-700">{formatCurrency(row.totalAmount)}</span>,
                  },
                ]}
                data={sale.items}
                keyField="id"
              />
            </div>

            {/* Returns */}
            {sale.saleReturns.length > 0 && (
              <div className="bg-white rounded-xl border border-orange-200 overflow-hidden mt-4">
                <div className="px-4 py-3 border-b border-orange-100 bg-orange-50">
                  <h3 className="text-sm font-semibold text-orange-700">Sale Returns ({sale.saleReturns.length})</h3>
                </div>
                {sale.saleReturns.map(ret => (
                  <div key={ret.id} className="px-4 py-3 border-b border-orange-100 flex justify-between text-sm">
                    <div>
                      <span className="font-medium text-orange-700">{ret.returnNumber}</span>
                      <span className="text-gray-400 ml-2">{formatDateTime(ret.returnDate)}</span>
                      {ret.reason && <p className="text-xs text-gray-500 mt-0.5">{ret.reason}</p>}
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{formatCurrency(ret.totalAmount)}</div>
                      <div className="text-xs text-gray-400">via {ret.refundMethod}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Void Modal */}
      <Modal
        open={showVoid}
        onClose={() => setShowVoid(false)}
        title="Void Sale / বিক্রয় বাতিল"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowVoid(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleVoid} loading={voidMutation.isPending} disabled={!voidReason.trim()}>
              Confirm Void
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            This will reverse all inventory and accounting entries. This cannot be undone.
          </div>
          <Input
            label="Reason (required)"
            value={voidReason}
            onChange={e => setVoidReason(e.target.value)}
            placeholder="e.g. Customer changed mind"
            autoFocus
          />
        </div>
      </Modal>

      {/* Payment Modal */}
      <Modal
        open={showPayment}
        onClose={() => setShowPayment(false)}
        title="Collect Payment / পেমেন্ট সংগ্রহ"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowPayment(false)}>Cancel</Button>
            <Button variant="primary" onClick={handlePayment} loading={paymentMutation.isPending}>
              Record Payment
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="text-center bg-red-50 rounded-xl p-3 text-red-700">
            <div className="text-xs">Due / বাকি</div>
            <div className="text-2xl font-bold">{formatCurrency(sale.dueAmount)}</div>
          </div>
          <select
            value={payMethod}
            onChange={e => setPayMethod(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5"
          >
            <option value="CASH">Cash / নগদ</option>
            <option value="BKASH">bKash / বিকাশ</option>
            <option value="NAGAD">Nagad / নগদ</option>
            <option value="CARD">Card / কার্ড</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
          </select>
          <Input
            label="Amount"
            type="number"
            step="0.01"
            min="0"
            max={sale.dueAmount}
            value={payAmount}
            onChange={e => setPayAmount(e.target.value)}
            autoFocus
            hint={`Max: ${formatCurrency(sale.dueAmount)}`}
          />
        </div>
      </Modal>
    </div>
  );
}
