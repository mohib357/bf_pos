'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { PageHeader, SearchBar } from '@/components/ui/PageHeader';
import { Table, Pagination } from '@/components/ui/Table';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatCurrency, formatDate } from '@/lib/utils';
import apiClient from '@/lib/api';
import {
  usePurchases, usePurchaseDetail, usePurchaseStats,
  useSuppliers, useCreatePurchase, useReceivePurchase,
  useAddPayment,
  PurchaseListItem, PurchaseDetail, PurchaseItem, Supplier,
} from '@/hooks/usePurchases';

// ─── Schemas ──────────────────────────────────────────────────────────────────
const paymentSchema = z.object({
  method:      z.enum(['CASH','BANK_TRANSFER','MOBILE_BANKING','CARD','CHEQUE','CREDIT']),
  amount:      z.coerce.number().min(0.01, 'Amount required'),
  referenceNo: z.string().optional(),
  bankName:    z.string().optional(),
  notes:       z.string().optional(),
});

// ─── Status badges ────────────────────────────────────────────────────────────
function PurchaseStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    DRAFT:     'bg-gray-100 text-gray-600 border-gray-200',
    ORDERED:   'bg-blue-50 text-blue-700 border-blue-200',
    RECEIVED:  'bg-green-50 text-green-700 border-green-200',
    PARTIAL:   'bg-yellow-50 text-yellow-700 border-yellow-200',
    CANCELLED: 'bg-red-50 text-red-600 border-red-200',
    RETURNED:  'bg-orange-50 text-orange-700 border-orange-200',
  };
  const labels: Record<string, string> = {
    DRAFT:'Draft/খসড়া', ORDERED:'Ordered/অর্ডার', RECEIVED:'Received/গৃহীত',
    PARTIAL:'Partial/আংশিক', CANCELLED:'Cancelled/বাতিল', RETURNED:'Returned/ফেরত',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${map[status] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>
      {labels[status] ?? status}
    </span>
  );
}

function PayStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING:'bg-orange-50 text-orange-600', PARTIAL:'bg-yellow-50 text-yellow-700',
    PAID:'bg-green-50 text-green-700', OVERDUE:'bg-red-50 text-red-700',
    CANCELLED:'bg-gray-100 text-gray-500',
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full ${map[status] ?? ''}`}>{status}</span>;
}

// ─── Line item type & helper ──────────────────────────────────────────────────
interface LineItem {
  productId: string; productName: string; sku: string;
  unitId: string; quantity: number; unitCost: number;
  discountRate: number; taxRate: number; totalAmount: number;
}

function calcLine(qty: number, cost: number, disc: number, tax: number): number {
  const gross = qty * cost;
  const afterDisc = gross - gross * (disc / 100);
  return afterDisc + afterDisc * (tax / 100);
}

// ─── Create Purchase Modal ────────────────────────────────────────────────────
function CreatePurchaseModal({ onClose, branchId }: { onClose: () => void; branchId: string }) {
  const { data: suppData } = useSuppliers({ limit: 200 });
  const suppliers: Supplier[] = suppData?.data ?? [];
  const createMutation = useCreatePurchase();

  const [supplierId, setSupplierId]   = useState('');
  const [lines, setLines]             = useState<LineItem[]>([]);
  const [barcodeVal, setBarcodeVal]   = useState('');
  const [prodSearch, setProdSearch]   = useState('');
  const [searchRes, setSearchRes]     = useState<any[]>([]);
  const [payments, setPayments]       = useState([{ method: 'CASH', amount: 0, referenceNo: '' }]);
  const [receiveNow, setReceiveNow]   = useState(true);
  const [notes, setNotes]             = useState('');
  const [shipping, setShipping]       = useState(0);
  const [supplierErr, setSupplierErr] = useState('');
  const [itemsErr, setItemsErr]       = useState('');
  const barcodeRef = useRef<HTMLInputElement>(null);

  useEffect(() => { barcodeRef.current?.focus(); }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'F3') { e.preventDefault(); barcodeRef.current?.focus(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const scanBarcode = useCallback(async (bc: string) => {
    if (!bc.trim()) return;
    try {
      const r = await apiClient.get(`/purchases/barcode/${bc.trim()}`);
      const { found, product } = r.data.data;
      if (found) {
        addProduct(product);
        setBarcodeVal('');
        toast.success(`Found: ${product.name}`);
      } else {
        toast.error(`Barcode not found: ${bc}`);
      }
    } catch { toast.error('Barcode lookup failed'); }
  }, []); // eslint-disable-line

  useEffect(() => {
    if (!prodSearch.trim()) { setSearchRes([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await apiClient.get('/products/search', { params: { q: prodSearch } });
        setSearchRes(r.data.data ?? []);
      } catch { setSearchRes([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [prodSearch]);

  function addProduct(p: any) {
    const idx = lines.findIndex(l => l.productId === p.id);
    if (idx >= 0) {
      const u = [...lines];
      u[idx].quantity += 1;
      u[idx].totalAmount = calcLine(u[idx].quantity, u[idx].unitCost, u[idx].discountRate, u[idx].taxRate);
      setLines(u);
    } else {
      const cost = parseFloat(String(p.costPrice ?? p.suggestedCost ?? 0));
      setLines(prev => [...prev, {
        productId: p.id, productName: p.name, sku: p.sku,
        unitId: p.unit?.id ?? '', quantity: 1, unitCost: cost,
        discountRate: 0, taxRate: 0, totalAmount: calcLine(1, cost, 0, 0),
      }]);
    }
    setItemsErr('');
  }

  function updateLine(i: number, field: keyof LineItem, val: number | string) {
    const u = [...lines];
    (u[i] as any)[field] = val;
    u[i].totalAmount = calcLine(Number(u[i].quantity), Number(u[i].unitCost), Number(u[i].discountRate), Number(u[i].taxRate));
    setLines(u);
  }

  const subtotal  = lines.reduce((s, l) => s + l.totalAmount, 0);
  const total     = subtotal + shipping;
  const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const due       = Math.max(0, total - totalPaid);

  function updatePay(i: number, f: string, v: any) {
    const u = [...payments];
    (u[i] as any)[f] = v;
    setPayments(u);
  }

  function handleSave() {
    let ok = true;
    if (!supplierId) { setSupplierErr('Please select a supplier / সরবরাহকারী বাছাই করুন'); ok = false; }
    else setSupplierErr('');
    if (lines.length === 0) { setItemsErr('Add at least one item / কমপক্ষে একটি পণ্য যোগ করুন'); ok = false; }
    else setItemsErr('');
    if (!ok) return;

    const validPays = payments.filter(p => p.amount > 0);
    createMutation.mutate({
      supplierId, branchId, receiveImmediately: receiveNow,
      shippingCost: shipping, notes,
      items: lines.map(l => ({
        productId: l.productId, unitId: l.unitId || undefined,
        quantity: l.quantity, unitCost: l.unitCost,
        discountRate: l.discountRate, taxRate: l.taxRate,
      })),
      payments: validPays.length > 0 ? validPays : undefined,
    }, { onSuccess: onClose });
  }

  return (
    <Modal open onClose={onClose} title="New Purchase / নতুন ক্রয়" size="xl">
      <div className="space-y-5 max-h-[80vh] overflow-y-auto pr-1">

        {/* Supplier */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Supplier * <span className="text-red-500">সরবরাহকারী</span>
            </label>
            <select
              data-testid="supplier-select"
              value={supplierId}
              onChange={e => { setSupplierId(e.target.value); setSupplierErr(''); }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Select Supplier —</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
              ))}
            </select>
            {supplierErr && <p className="text-xs text-red-600 mt-1">{supplierErr}</p>}
          </div>
          <label className="flex items-end gap-2 pb-2 cursor-pointer">
            <input type="checkbox" checked={receiveNow}
              onChange={e => setReceiveNow(e.target.checked)}
              className="rounded text-blue-600" />
            <span className="text-sm text-gray-700">Receive immediately / এখনই গ্রহণ</span>
          </label>
        </div>

        {/* Barcode scanner */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs font-medium text-blue-700 mb-2">📷 Barcode Scanner (F3 to focus)</p>
          <div className="flex gap-2">
            <input
              ref={barcodeRef}
              value={barcodeVal}
              onChange={e => setBarcodeVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); scanBarcode(barcodeVal); } }}
              placeholder="Scan or type barcode, press Enter…"
              data-testid="barcode-input"
              autoComplete="off"
              className="flex-1 rounded-lg border border-blue-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Button size="sm" variant="outline" onClick={() => scanBarcode(barcodeVal)}>Scan</Button>
          </div>
        </div>

        {/* Product search */}
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Search Product / পণ্য খুঁজুন
          </label>
          <input
            value={prodSearch}
            onChange={e => setProdSearch(e.target.value)}
            placeholder="Type product name or SKU…"
            data-testid="product-search"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searchRes.length > 0 && (
            <div
              className="absolute z-20 top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto"
              data-testid="search-results"
            >
              {searchRes.map(p => (
                <button key={p.id}
                  onClick={() => { addProduct(p); setProdSearch(''); setSearchRes([]); }}
                  className="w-full text-left px-4 py-2 hover:bg-blue-50 text-sm border-b border-gray-50 last:border-0"
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="text-gray-400 ml-2 text-xs">{p.sku}</span>
                  <span className="text-blue-600 ml-2 text-xs">৳{p.costPrice}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Line items */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">
            Items / আইটেম ({lines.length})
          </h4>
          {itemsErr && <p className="text-xs text-red-600 mb-2">{itemsErr}</p>}
          {lines.length === 0 ? (
            <div className="border-2 border-dashed border-gray-200 rounded-lg py-8 text-center text-gray-400 text-sm">
              Scan a barcode or search for a product to add items
            </div>
          ) : (
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full text-sm" data-testid="purchase-items-table">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Product</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-600 w-20">Qty</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-600 w-28">Cost ৳</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-600 w-20">Disc%</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600 w-28">Total ৳</th>
                    <th className="px-3 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((ln, i) => (
                    <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <div className="font-medium text-xs text-gray-900">{ln.productName}</div>
                        <div className="text-gray-400 text-xs">{ln.sku}</div>
                      </td>
                      <td className="px-2 py-1">
                        <input type="number" min="0.001" step="any" value={ln.quantity}
                          onChange={e => updateLine(i, 'quantity', parseFloat(e.target.value) || 0)}
                          className="w-full text-center border border-gray-200 rounded px-1 py-1 text-sm focus:ring-1 focus:ring-blue-400 focus:outline-none"
                          data-testid={`qty-input-${i}`} />
                      </td>
                      <td className="px-2 py-1">
                        <input type="number" min="0" step="0.01" value={ln.unitCost}
                          onChange={e => updateLine(i, 'unitCost', parseFloat(e.target.value) || 0)}
                          className="w-full text-center border border-gray-200 rounded px-1 py-1 text-sm focus:ring-1 focus:ring-blue-400 focus:outline-none" />
                      </td>
                      <td className="px-2 py-1">
                        <input type="number" min="0" max="100" step="0.01" value={ln.discountRate}
                          onChange={e => updateLine(i, 'discountRate', parseFloat(e.target.value) || 0)}
                          className="w-full text-center border border-gray-200 rounded px-1 py-1 text-sm focus:ring-1 focus:ring-blue-400 focus:outline-none" />
                      </td>
                      <td className="px-3 py-2 text-right font-medium">{formatCurrency(ln.totalAmount)}</td>
                      <td className="px-1 py-2 text-center">
                        <button onClick={() => setLines(prev => prev.filter((_, j) => j !== i))}
                          className="text-red-400 hover:text-red-600 font-bold text-lg leading-none">×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Totals */}
        <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Subtotal</span>
            <span className="font-medium">{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Shipping ৳</span>
            <input type="number" min="0" value={shipping}
              onChange={e => setShipping(parseFloat(e.target.value) || 0)}
              className="w-28 text-right border border-gray-200 rounded px-2 py-1 text-sm" />
          </div>
          <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-2">
            <span>Total / মোট</span>
            <span className="text-blue-700">{formatCurrency(total)}</span>
          </div>
        </div>

        {/* Payments */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-sm font-semibold text-gray-700">Payment / পেমেন্ট</h4>
            <Button size="sm" variant="ghost"
              onClick={() => setPayments(prev => [...prev, { method: 'CASH', amount: 0, referenceNo: '' }])}>
              + Add Method
            </Button>
          </div>
          <div className="space-y-2">
            {payments.map((pay, i) => (
              <div key={i} className="flex gap-2 items-center" data-testid={`payment-row-${i}`}>
                <select
                  value={pay.method}
                  onChange={e => updatePay(i, 'method', e.target.value)}
                  data-testid="payment-method-select"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm flex-1 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="CASH">Cash / নগদ</option>
                  <option value="BANK_TRANSFER">Bank / ব্যাংক</option>
                  <option value="MOBILE_BANKING">bKash / Nagad</option>
                  <option value="CARD">Card / কার্ড</option>
                  <option value="CHEQUE">Cheque / চেক</option>
                  <option value="CREDIT">Credit / ধার</option>
                </select>
                <input
                  type="number" min="0" step="0.01" placeholder="Amount"
                  value={pay.amount || ''}
                  onChange={e => updatePay(i, 'amount', parseFloat(e.target.value) || 0)}
                  data-testid="payment-amount-input"
                  className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <input
                  type="text" placeholder="Ref# (optional)" value={pay.referenceNo}
                  onChange={e => updatePay(i, 'referenceNo', e.target.value)}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                {i > 0 && (
                  <button onClick={() => setPayments(prev => prev.filter((_, j) => j !== i))}
                    className="text-red-400 hover:text-red-600 text-xl leading-none font-bold">×</button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-6 text-sm">
            <span className="text-gray-500">Paid: <strong className="text-green-600">{formatCurrency(totalPaid)}</strong></span>
            <span className="text-gray-500">Due: <strong className={due > 0 ? 'text-red-600' : 'text-gray-400'}>{formatCurrency(due)}</strong></span>
          </div>
        </div>

        <Input label="Notes / নোট" value={notes} onChange={e => setNotes(e.target.value)} />

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} loading={createMutation.isPending} data-testid="save-purchase-btn">
            {receiveNow ? 'Receive & Save / গ্রহণ করুন' : 'Save Draft / খসড়া সংরক্ষণ'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Add Payment Modal ────────────────────────────────────────────────────────
function AddPaymentModal({ purchase, onClose }: { purchase: PurchaseDetail; onClose: () => void }) {
  const addPayment = useAddPayment();
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof paymentSchema>>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { method: 'CASH', amount: parseFloat(purchase.dueAmount), referenceNo: '', bankName: '', notes: '' },
  });
  const onSubmit = (data: any) =>
    addPayment.mutate({ id: purchase.id, data }, { onSuccess: onClose });

  return (
    <Modal open onClose={onClose} title={`Add Payment — ${purchase.invoiceNumber}`}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="bg-gray-50 rounded-lg p-4 flex justify-between">
          <span className="text-sm text-gray-600">Due / বকেয়া</span>
          <span className="font-bold text-red-600 text-lg">{formatCurrency(purchase.dueAmount)}</span>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
          <select {...register('method')}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
            <option value="CASH">Cash / নগদ</option>
            <option value="BANK_TRANSFER">Bank Transfer / ব্যাংক</option>
            <option value="MOBILE_BANKING">bKash / Nagad</option>
            <option value="CARD">Card / কার্ড</option>
            <option value="CHEQUE">Cheque / চেক</option>
          </select>
        </div>
        <Input label="Amount ৳" {...register('amount')} type="number" step="0.01"
          error={errors.amount?.message as string} />
        <Input label="Reference No" {...register('referenceNo')} />
        <Input label="Notes" {...register('notes')} />
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={addPayment.isPending}>Record Payment</Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Purchase Detail Modal ────────────────────────────────────────────────────
function PurchaseDetailModal({ id, onClose, onPay }: {
  id: string; onClose: () => void; onPay: (p: PurchaseDetail) => void;
}) {
  const { data: purchase, isLoading } = usePurchaseDetail(id);
  const receive = useReceivePurchase();

  if (isLoading || !purchase) {
    return (
      <Modal open onClose={onClose} title="Purchase Detail">
        <div className="py-8 text-center text-gray-400">Loading…</div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title={purchase.invoiceNumber} size="xl">
      <div className="space-y-5 max-h-[80vh] overflow-y-auto">
        <div className="grid grid-cols-3 gap-4 bg-gray-50 rounded-lg p-4">
          <div>
            <p className="text-xs text-gray-500">Supplier</p>
            <p className="font-medium">{purchase.supplier.name}</p>
            <p className="text-xs text-gray-400">{purchase.supplier.phone}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Date</p>
            <p className="font-medium">{formatDate(purchase.purchaseDate)}</p>
            {purchase.dueDate && <p className="text-xs text-orange-500">Due: {formatDate(purchase.dueDate)}</p>}
          </div>
          <div className="text-right space-y-1">
            <PurchaseStatusBadge status={purchase.status} />
            <br />
            <PayStatusBadge status={purchase.paymentStatus} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label:'Total', val: purchase.totalAmount, color:'text-blue-700', bg:'bg-blue-50' },
            { label:'Paid',  val: purchase.paidAmount,  color:'text-green-600', bg:'bg-green-50' },
            { label:'Due',   val: purchase.dueAmount,   color:'text-red-600', bg:'bg-red-50' },
          ].map(r => (
            <div key={r.label} className={`text-center ${r.bg} rounded-lg p-3`}>
              <p className="text-xs text-gray-500">{r.label}</p>
              <p className={`text-xl font-bold ${r.color}`}>{formatCurrency(r.val)}</p>
            </div>
          ))}
        </div>

        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Items ({purchase.items.length})</h4>
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Product','Qty','Unit Cost','Total'].map(h => (
                    <th key={h} className={`px-3 py-2 font-medium text-gray-600 ${h !== 'Product' ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {purchase.items.map((item: PurchaseItem) => (
                  <tr key={item.id} className="border-t border-gray-100">
                    <td className="px-3 py-2">
                      <div className="font-medium text-xs">{item.product.name}</div>
                      <div className="text-gray-400 text-xs">{item.product.sku}</div>
                    </td>
                    <td className="px-3 py-2 text-right">{item.quantity}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(item.unitCost)}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatCurrency(item.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {purchase.payments.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Payments</h4>
            <div className="space-y-1">
              {purchase.payments.map(pay => (
                <div key={pay.id} className="flex justify-between text-sm bg-gray-50 rounded px-3 py-2">
                  <span className="text-gray-600">{pay.method}{pay.referenceNo && ` — ${pay.referenceNo}`}</span>
                  <span className="font-medium text-green-600">{formatCurrency(pay.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-2 border-t border-gray-100">
          {purchase.status === 'DRAFT' && (
            <Button size="sm"
              onClick={() => receive.mutate({ id: purchase.id, data: {} }, { onSuccess: onClose })}
              loading={receive.isPending}>
              Receive Stock / স্টক গ্রহণ
            </Button>
          )}
          {purchase.status === 'RECEIVED' && parseFloat(purchase.dueAmount) > 0 && (
            <Button size="sm" variant="outline" onClick={() => onPay(purchase)}>
              Add Payment / পেমেন্ট যোগ
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PurchasesPage() {
  const LIMIT = 20;
  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState('');
  const [status, setStatus]     = useState('');
  const [showCreate, setCreate] = useState(false);
  const [selectedId, setSelected] = useState<string | null>(null);
  const [payPurchase, setPayPurchase] = useState<PurchaseDetail | null>(null);
  const [branchId, setBranchId] = useState('');

  const { data, isLoading } = usePurchases({ page, limit: LIMIT, search, status: status || undefined });
  const { data: stats }     = usePurchaseStats();
  const purchases: PurchaseListItem[] = data?.data ?? [];
  const meta = data?.meta ?? { total: 0, totalPages: 1 };

  // Resolve branchId once
  useEffect(() => {
    if (!branchId) {
      apiClient.get('/purchases?limit=1')
        .then(r => { if (r.data.data?.[0]) setBranchId(r.data.data[0].branchId ?? ''); })
        .catch(() => {});
    }
  }, [branchId]);

  const columns = [
    {
      key: 'invoiceNumber', header: 'Invoice',
      render: (p: PurchaseListItem) => (
        <button onClick={() => setSelected(p.id)}
          className="font-mono text-xs text-blue-600 hover:underline font-semibold">
          {p.invoiceNumber}
        </button>
      ),
    },
    {
      key: 'purchaseDate', header: 'Date',
      render: (p: PurchaseListItem) => formatDate(p.purchaseDate),
    },
    {
      key: 'supplier', header: 'Supplier / সরবরাহকারী',
      render: (p: PurchaseListItem) => (
        <div>
          <div className="text-sm font-medium text-gray-900">{p.supplier.name}</div>
          {p.supplier.phone && <div className="text-xs text-gray-400">{p.supplier.phone}</div>}
        </div>
      ),
    },
    {
      key: 'status', header: 'Status',
      render: (p: PurchaseListItem) => (
        <div className="space-y-1">
          <PurchaseStatusBadge status={p.status} />
          <br />
          <PayStatusBadge status={p.paymentStatus} />
        </div>
      ),
    },
    {
      key: 'totalAmount', header: 'Total / মোট',
      align: 'right' as const,
      render: (p: PurchaseListItem) => (
        <div className="text-right">
          <div className="font-semibold">{formatCurrency(p.totalAmount)}</div>
          {parseFloat(p.dueAmount) > 0 && (
            <div className="text-xs text-red-500">Due: {formatCurrency(p.dueAmount)}</div>
          )}
        </div>
      ),
    },
    {
      key: 'items', header: 'Items',
      render: (p: PurchaseListItem) => (
        <span className="text-xs text-gray-500">{p._count.items} item{p._count.items !== 1 ? 's' : ''}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchases"
        titleBn="ক্রয়"
        description={`${meta.total} purchase records`}
        actions={
          <Button onClick={() => setCreate(true)} data-testid="new-purchase-btn">
            + New Purchase / নতুন ক্রয়
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <SearchBar value={search} onChange={setSearch} placeholder="Search invoice, supplier…" />
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
        >
          <option value="">All Status</option>
          <option value="DRAFT">Draft / খসড়া</option>
          <option value="RECEIVED">Received / গৃহীত</option>
          <option value="RETURNED">Returned / ফেরত</option>
          <option value="CANCELLED">Cancelled / বাতিল</option>
        </select>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label:'Total', labelBn:'মোট',        val: stats.total,              color:'text-gray-900' },
            { label:'Received', labelBn:'গৃহীত',    val: stats.received,           color:'text-green-600' },
            { label:'Draft', labelBn:'খসড়া',       val: stats.draft,              color:'text-gray-400' },
            { label:'With Due', labelBn:'বকেয়া',   val: stats.due,                color:'text-red-600' },
            { label:'Month Total', labelBn:'এই মাস', val: formatCurrency(stats.thisMonthTotal), color:'text-blue-700' },
            { label:'Month Due', labelBn:'বকেয়া',   val: formatCurrency(stats.thisMonthDue),   color:'text-orange-600' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <p className="text-xs text-gray-500">{s.label} / {s.labelBn}</p>
              <p className={`text-xl font-bold ${s.color}`}>{s.val}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <Table
          columns={columns}
          data={purchases}
          keyField="id"
          loading={isLoading}
          emptyMessage="No purchases found"
          emptyMessageBn="কোনো ক্রয় নেই"
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

      {showCreate && (
        <CreatePurchaseModal onClose={() => setCreate(false)} branchId={branchId} />
      )}
      {selectedId && (
        <PurchaseDetailModal
          id={selectedId}
          onClose={() => setSelected(null)}
          onPay={p => { setSelected(null); setPayPurchase(p); }}
        />
      )}
      {payPurchase && (
        <AddPaymentModal purchase={payPurchase} onClose={() => setPayPurchase(null)} />
      )}
    </div>
  );
}
