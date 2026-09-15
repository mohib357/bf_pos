'use client';
import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Table, Pagination } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import {
  useCashRegister, useCashRegisterHistory,
  useOpenCashRegister, useCloseCashRegister,
} from '@/hooks/useSales';
import { useAuthStore } from '@/store/auth.store';

export default function CashRegisterPage() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  const userId = user?.id ?? '';

  const { data: current, isLoading: loadingCurrent } = useCashRegister(branchId, userId);
  const { data: historyData, isLoading: loadingHistory } = useCashRegisterHistory({ branchId, limit: 20 });
  const openMutation = useOpenCashRegister();
  const closeMutation = useCloseCashRegister();

  const [showOpen, setShowOpen] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [openBalance, setOpenBalance] = useState('');
  const [registerName, setRegisterName] = useState(`Register ${new Date().toLocaleDateString()}`);
  const [actualCash, setActualCash] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [page, setPage] = useState(1);

  const history: any[] = historyData?.data ?? [];
  const total = historyData?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  async function handleOpen() {
    if (!openBalance || parseFloat(openBalance) < 0) return;
    await openMutation.mutateAsync({
      branchId,
      name: registerName,
      openingBalance: parseFloat(openBalance),
    });
    setShowOpen(false);
    setOpenBalance('');
  }

  async function handleClose() {
    if (!current?.id || !actualCash) return;
    await closeMutation.mutateAsync({
      id: current.id,
      actualCash: parseFloat(actualCash),
      notes: closeNotes || undefined,
    });
    setShowClose(false);
    setActualCash('');
    setCloseNotes('');
  }

  const expectedCash = current
    ? parseFloat(current.openingBalance) + parseFloat(current.cashSales ?? 0)
      - parseFloat(current.cashRefunds ?? 0) - parseFloat(current.cashExpenses ?? 0)
      + parseFloat(current.cashAdjustments ?? 0)
    : 0;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Cash Register / ক্যাশ রেজিস্টার"
        titleBn="ক্যাশ রেজিস্টার ব্যবস্থাপনা"
        description="Open and close daily cash registers"
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Cash Register' }]}
        actions={
          current
            ? <Button variant="danger" onClick={() => { setActualCash(expectedCash.toFixed(2)); setShowClose(true); }}>
                Close Register / বন্ধ করুন
              </Button>
            : <Button variant="primary" onClick={() => setShowOpen(true)}>
                Open Register / খুলুন
              </Button>
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* Current register */}
        {loadingCurrent ? (
          <div className="h-24 animate-pulse bg-gray-100 rounded-xl" />
        ) : current ? (
          <div className="bg-white rounded-xl border border-green-200 p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
              <h3 className="font-semibold text-gray-800">{current.name}</h3>
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full border border-green-200">OPEN</span>
              <span className="text-xs text-gray-400 ml-auto">Opened: {formatDateTime(current.openedAt)}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500">Opening</div>
                <div className="font-bold text-gray-800">{formatCurrency(current.openingBalance)}</div>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <div className="text-xs text-green-600">Cash Sales</div>
                <div className="font-bold text-green-700">{formatCurrency(current.cashSales ?? 0)}</div>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <div className="text-xs text-red-500">Refunds</div>
                <div className="font-bold text-red-600">{formatCurrency(current.cashRefunds ?? 0)}</div>
              </div>
              <div className="bg-orange-50 rounded-lg p-3 text-center">
                <div className="text-xs text-orange-500">Expenses</div>
                <div className="font-bold text-orange-600">{formatCurrency(current.cashExpenses ?? 0)}</div>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-center border-2 border-blue-200">
                <div className="text-xs text-blue-500">Expected</div>
                <div className="font-bold text-blue-700 text-lg">{formatCurrency(expectedCash)}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 text-center">
            <p className="text-yellow-700 font-medium">No register is currently open</p>
            <p className="text-sm text-yellow-600 mt-1">Open a register to start accepting cash payments</p>
          </div>
        )}

        {/* History */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-700">Register History / ইতিহাস</h3>
          </div>
          <Table<Record<string, any>>
            columns={[
              { key: 'name', header: 'Name', headerBn: 'নাম', render: r => <span className="font-medium">{r.name}</span> },
              { key: 'openedAt', header: 'Opened', render: r => formatDateTime(r.openedAt) },
              { key: 'closedAt', header: 'Closed', render: r => r.closedAt ? formatDateTime(r.closedAt) : <span className="text-green-600 font-medium">Open</span> },
              { key: 'openingBalance', header: 'Opening', align: 'right', render: r => formatCurrency(r.openingBalance) },
              { key: 'expectedCash', header: 'Expected', align: 'right', render: r => r.expectedCash ? formatCurrency(r.expectedCash) : '—' },
              { key: 'actualCash', header: 'Actual', align: 'right', render: r => r.actualCash ? formatCurrency(r.actualCash) : '—' },
              {
                key: 'difference',
                header: 'Diff',
                align: 'right',
                render: r => {
                  if (!r.difference) return '—';
                  const diff = parseFloat(r.difference);
                  return <span className={diff === 0 ? 'text-green-600' : diff > 0 ? 'text-blue-600' : 'text-red-600'}>{formatCurrency(r.difference)}</span>;
                },
              },
              { key: 'status', header: 'Status', render: r => <span className={`text-xs px-2 py-0.5 rounded-full ${r.status === 'OPEN' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{r.status}</span> },
            ]}
            data={history}
            keyField="id"
            loading={loadingHistory}
            emptyMessage="No register history"
            emptyMessageBn="কোনো ইতিহাস নেই"
          />
          {total > 20 && (
            <Pagination page={page} totalPages={totalPages} total={total} limit={20} onPageChange={setPage} />
          )}
        </div>
      </div>

      {/* Open Modal */}
      <Modal
        open={showOpen}
        onClose={() => setShowOpen(false)}
        title="Open Cash Register / ক্যাশ রেজিস্টার খুলুন"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleOpen} loading={openMutation.isPending} disabled={!openBalance}>
              Open Register
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input label="Register Name" value={registerName} onChange={e => setRegisterName(e.target.value)} />
          <Input
            label="Opening Balance (৳)"
            labelBn="প্রারম্ভিক ব্যালেন্স"
            type="number"
            min="0"
            step="0.01"
            value={openBalance}
            onChange={e => setOpenBalance(e.target.value)}
            autoFocus
            placeholder="0.00"
          />
        </div>
      </Modal>

      {/* Close Modal */}
      <Modal
        open={showClose}
        onClose={() => setShowClose(false)}
        title="Close Cash Register / রেজিস্টার বন্ধ করুন"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowClose(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleClose} loading={closeMutation.isPending} disabled={!actualCash}>
              Close Register
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-blue-600">Expected cash:</span>
              <span className="font-bold text-blue-700">{formatCurrency(expectedCash)}</span>
            </div>
          </div>
          <Input
            label="Actual Cash Count (৳)"
            labelBn="প্রকৃত নগদ পরিমাণ"
            type="number"
            min="0"
            step="0.01"
            value={actualCash}
            onChange={e => setActualCash(e.target.value)}
            autoFocus
          />
          {actualCash && (
            <div className={`text-sm p-2 rounded-lg text-center font-medium ${
              parseFloat(actualCash) === expectedCash ? 'bg-green-50 text-green-700'
              : parseFloat(actualCash) > expectedCash ? 'bg-blue-50 text-blue-700'
              : 'bg-red-50 text-red-700'
            }`}>
              Difference: {formatCurrency(parseFloat(actualCash) - expectedCash)}
            </div>
          )}
          <Input label="Notes (optional)" value={closeNotes} onChange={e => setCloseNotes(e.target.value)} />
        </div>
      </Modal>
    </div>
  );
}
