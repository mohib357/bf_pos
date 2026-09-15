'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PageHeader, SearchBar } from '@/components/ui/PageHeader';
import { Table, Pagination } from '@/components/ui/Table';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  useSuppliers, useCreateSupplier, useUpdateSupplier, useSupplierStatement,
  Supplier,
} from '@/hooks/usePurchases';

// ─── Schema ───────────────────────────────────────────────────────────────────
const supplierSchema = z.object({
  name:         z.string().min(1, 'Supplier name required'),
  nameBn:       z.string().optional(),
  company:      z.string().optional(),
  mobile:       z.string().optional(),
  email:        z.string().email().optional().or(z.literal('')),
  address:      z.string().optional(),
  city:         z.string().optional(),
  openingDue:   z.coerce.number().min(0).optional(),
  creditLimit:  z.coerce.number().min(0).optional(),
  creditDays:   z.coerce.number().min(0).optional(),
  notes:        z.string().optional(),
});
type SupplierForm = z.infer<typeof supplierSchema>;

// ─── Statement modal ──────────────────────────────────────────────────────────
function StatementModal({ supplierId, supplierName, onClose }: {
  supplierId: string; supplierName: string; onClose: () => void;
}) {
  const { data, isLoading } = useSupplierStatement(supplierId);
  return (
    <Modal open onClose={onClose} title={`Statement — ${supplierName}`} size="lg">
      {isLoading ? (
        <div className="py-8 text-center text-gray-400">Loading…</div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-lg p-4">
            {[
              { label: 'Opening Balance', val: data?.openingBalance, color: 'text-gray-900' },
              { label: 'Total Purchases', val: data?.totalPurchases, color: 'text-blue-600' },
              { label: 'Total Payments',  val: data?.totalPayments,  color: 'text-green-600' },
              { label: 'Total Returns',   val: data?.totalReturns,   color: 'text-orange-600' },
            ].map(r => (
              <div key={r.label}>
                <p className="text-xs text-gray-500">{r.label}</p>
                <p className={`text-lg font-bold ${r.color}`}>{formatCurrency(r.val)}</p>
              </div>
            ))}
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex justify-between items-center">
            <span className="font-semibold text-blue-800">Current Payable / বর্তমান বকেয়া</span>
            <span className="text-2xl font-bold text-blue-700">{formatCurrency(data?.currentPayable)}</span>
          </div>
          {(data?.purchases?.length ?? 0) > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Purchases</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-100 text-left">
                      {['Invoice','Date','Total','Paid','Due'].map(h => (
                        <th key={h} className="px-3 py-2 font-medium text-gray-600">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.purchases.map((p: any) => (
                      <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-xs">{p.invoiceNumber}</td>
                        <td className="px-3 py-2 text-gray-500">{formatDate(p.purchaseDate)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(p.totalAmount)}</td>
                        <td className="px-3 py-2 text-right text-green-600">{formatCurrency(p.paidAmount)}</td>
                        <td className="px-3 py-2 text-right text-red-500">{formatCurrency(p.dueAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ─── Supplier Form Modal ──────────────────────────────────────────────────────
function SupplierFormModal({ supplier, onClose }: {
  supplier: Supplier | null; onClose: () => void;
}) {
  const createMutation = useCreateSupplier();
  const updateMutation = useUpdateSupplier();
  const { register, handleSubmit, formState: { errors } } = useForm<SupplierForm>({
    resolver: zodResolver(supplierSchema),
    defaultValues: supplier ? {
      name: supplier.name, nameBn: supplier.nameBn ?? '',
      company: supplier.company ?? '', mobile: supplier.phone ?? '',
      email: supplier.email ?? '', address: supplier.address ?? '',
      city: supplier.city ?? '', creditLimit: Number(supplier.creditLimit),
    } : {},
  });

  const onSubmit = (data: SupplierForm) => {
    if (supplier) {
      updateMutation.mutate({ id: supplier.id, data }, { onSuccess: onClose });
    } else {
      createMutation.mutate(data, { onSuccess: onClose });
    }
  };

  return (
    <Modal open onClose={onClose}
      title={supplier ? 'Edit Supplier' : 'New Supplier / নতুন সরবরাহকারী'}
      size="lg"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input label="Name / নাম *" {...register('name')} error={errors.name?.message} />
          <Input label="Name (Bengali)" {...register('nameBn')} />
        </div>
        <Input label="Company / কোম্পানি" {...register('company')} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Mobile / মোবাইল *" {...register('mobile')} placeholder="01XXXXXXXXX" />
          <Input label="Email" {...register('email')} type="email" />
        </div>
        <Input label="Address / ঠিকানা" {...register('address')} />
        <div className="grid grid-cols-3 gap-4">
          <Input label="City / শহর" {...register('city')} />
          <Input label="Opening Due ৳" {...register('openingDue')} type="number" min="0" />
          <Input label="Credit Limit ৳" {...register('creditLimit')} type="number" min="0" />
        </div>
        <Input label="Notes / নোট" {...register('notes')} />
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>
            {supplier ? 'Save Changes' : 'Create Supplier'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SuppliersPage() {
  const LIMIT = 20;
  const [page, setPage]               = useState(1);
  const [search, setSearch]           = useState('');
  const [showForm, setShowForm]       = useState(false);
  const [editSup, setEditSup]         = useState<Supplier | null>(null);
  const [stmtSup, setStmtSup]         = useState<Supplier | null>(null);

  const { data, isLoading } = useSuppliers({ page, limit: LIMIT, search });
  const suppliers: Supplier[] = data?.data ?? [];
  const meta = data?.meta ?? { total: 0, totalPages: 1 };

  const columns = [
    {
      key: 'code', header: 'Code',
      render: (s: Supplier) => (
        <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{s.code}</span>
      ),
    },
    {
      key: 'name', header: 'Supplier / সরবরাহকারী',
      render: (s: Supplier) => (
        <div>
          <div className="font-medium text-gray-900">{s.name}</div>
          {s.nameBn && <div className="text-xs text-gray-400">{s.nameBn}</div>}
          {s.company && <div className="text-xs text-gray-400 italic">{s.company}</div>}
        </div>
      ),
    },
    {
      key: 'phone', header: 'Contact',
      render: (s: Supplier) => (
        <div>
          {s.phone && <div className="text-sm">{s.phone}</div>}
          {s.email && <div className="text-xs text-gray-400">{s.email}</div>}
        </div>
      ),
    },
    {
      key: 'city', header: 'City',
      render: (s: Supplier) => s.city ?? '—',
    },
    {
      key: 'currentBalance', header: 'Payable / বকেয়া',
      align: 'right' as const,
      render: (s: Supplier) => {
        const num = parseFloat(s.currentBalance);
        if (num > 0) return <span className="text-red-600 font-semibold">{formatCurrency(num)}</span>;
        if (num < 0) return <span className="text-green-600 font-semibold">{formatCurrency(num)}</span>;
        return <span className="text-gray-400">—</span>;
      },
    },
    {
      key: 'isActive', header: 'Status',
      render: (s: Supplier) => (
        <span className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full border ${
          s.isActive
            ? 'bg-green-50 text-green-700 border-green-200'
            : 'bg-gray-50 text-gray-500 border-gray-200'
        }`}>
          {s.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'actions', header: '',
      render: (s: Supplier) => (
        <div className="flex gap-3 justify-end">
          <button
            onClick={() => setStmtSup(s)}
            className="text-xs text-blue-600 hover:underline"
          >
            Statement
          </button>
          <button
            onClick={() => { setEditSup(s); setShowForm(true); }}
            className="text-xs text-gray-600 hover:underline"
          >
            Edit
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers"
        titleBn="সরবরাহকারী"
        description={`${meta.total} suppliers`}
        actions={
          <Button onClick={() => { setEditSup(null); setShowForm(true); }} data-testid="create-supplier">
            + New Supplier
          </Button>
        }
      />

      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search by name, phone, code…"
      />

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <p className="text-xs text-gray-500">Total</p>
          <p className="text-2xl font-bold text-gray-900">{meta.total}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <p className="text-xs text-gray-500">Active</p>
          <p className="text-2xl font-bold text-green-600">{suppliers.filter(s => s.isActive).length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <p className="text-xs text-gray-500">With Balance</p>
          <p className="text-2xl font-bold text-red-600">
            {suppliers.filter(s => parseFloat(s.currentBalance) > 0).length}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <p className="text-xs text-gray-500">Total Payable</p>
          <p className="text-lg font-bold text-red-600">
            {formatCurrency(suppliers.reduce((s, sup) => s + parseFloat(sup.currentBalance), 0))}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <Table
          columns={columns}
          data={suppliers}
          keyField="id"
          loading={isLoading}
          emptyMessage="No suppliers found"
          emptyMessageBn="কোনো সরবরাহকারী নেই"
        />
        {meta.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-100">
            <Pagination
              page={page}
              totalPages={meta.totalPages}
              total={meta.total}
              limit={LIMIT}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>

      {showForm && (
        <SupplierFormModal
          supplier={editSup}
          onClose={() => { setShowForm(false); setEditSup(null); }}
        />
      )}
      {stmtSup && (
        <StatementModal
          supplierId={stmtSup.id}
          supplierName={stmtSup.name}
          onClose={() => setStmtSup(null)}
        />
      )}
    </div>
  );
}
