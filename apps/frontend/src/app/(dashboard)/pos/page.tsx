'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { formatCurrency } from '@/lib/utils';
import {
  CartItem, BarcodeResult, Customer,
  useCreateSale, useCustomers, useCreateQuickCustomer,
} from '@/hooks/useSales';
import { useAuthStore } from '@/store/auth.store';

// ─── Cart helpers ─────────────────────────────────────────────────────────────

function calcLineTotal(item: CartItem): number {
  const gross = item.quantity * item.unitPrice;
  const discAmt = item.discountAmount > 0
    ? item.discountAmount * item.quantity
    : gross * (item.discountRate / 100);
  const afterDisc = gross - discAmt;
  const tax = afterDisc * (item.taxRate / 100);
  return Math.round((afterDisc + tax) * 100) / 100;
}

// ─── Payment methods ──────────────────────────────────────────────────────────

const PAYMENT_METHODS = [
  { key: 'CASH',          label: 'নগদ',   labelEn: 'Cash',          color: 'bg-green-600 hover:bg-green-700' },
  { key: 'CARD',          label: 'কার্ড',  labelEn: 'Card',          color: 'bg-blue-600 hover:bg-blue-700' },
  { key: 'BKASH',         label: 'বিকাশ', labelEn: 'bKash',         color: 'bg-pink-600 hover:bg-pink-700' },
  { key: 'NAGAD',         label: 'নগদ',   labelEn: 'Nagad',         color: 'bg-orange-600 hover:bg-orange-700' },
  { key: 'BANK_TRANSFER', label: 'ব্যাংক', labelEn: 'Bank',          color: 'bg-indigo-600 hover:bg-indigo-700' },
  { key: 'DUE',           label: 'বাকি',  labelEn: 'Due/Credit',    color: 'bg-red-600 hover:bg-red-700' },
];

// ─── POS Page ─────────────────────────────────────────────────────────────────

export default function PosPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const createSale = useCreateSale();
  const createCustomer = useCreateQuickCustomer();

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [saleDiscount, setSaleDiscount] = useState(0);
  const [notes, setNotes] = useState('');

  // Search/barcode
  const [barcode, setBarcode] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');

  // Modals
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [showQuickCustomer, setShowQuickCustomer] = useState(false);

  // Payment
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paidAmount, setPaidAmount] = useState('');
  const [paidAmounts, setPaidAmounts] = useState<Record<string, number>>({ CASH: 0 });

  // Customer search
  const [customerSearch, setCustomerSearch] = useState('');
  const [quickName, setQuickName] = useState('');
  const [quickPhone, setQuickPhone] = useState('');

  // Refs
  const barcodeRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const paidRef = useRef<HTMLInputElement>(null);

  const branchId = user?.branchId ?? '';

  // ── Auto-focus barcode on mount ──────────────────────────────────────────
  useEffect(() => {
    barcodeRef.current?.focus();
  }, []);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'F4') { e.preventDefault(); setShowCustomerModal(true); }
      if (e.key === 'F6') { e.preventDefault(); setShowDiscountModal(true); }
      if (e.key === 'F8') { e.preventDefault(); if (cart.length > 0) setShowPaymentModal(true); }
      if (e.key === 'F9') { e.preventDefault(); if (cart.length > 0) completeSaleQuick(); }
      if (e.key === 'Escape') {
        setShowPaymentModal(false);
        setShowCustomerModal(false);
        setShowDiscountModal(false);
        setShowQuickCustomer(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cart, paidAmounts]);

  // ── Totals ──────────────────────────────────────────────────────────────
  const subtotal = cart.reduce((s, item) => s + calcLineTotal(item), 0);
  const totalDiscount = saleDiscount;
  const grandTotal = Math.max(0, subtotal - totalDiscount);
  const totalPaid = Object.values(paidAmounts).reduce((s, a) => s + a, 0);
  const change = Math.max(0, totalPaid - grandTotal);
  const due = Math.max(0, grandTotal - totalPaid);

  // ── Barcode scan ─────────────────────────────────────────────────────────
  const handleBarcodeEnter = useCallback(async () => {
    if (!barcode.trim()) return;
    const t0 = performance.now();
    try {
      const r = await apiClient.get(`/sales/barcode/${barcode.trim()}`);
      const result: BarcodeResult = r.data.data;
      if (!result.found || !result.product) {
        toast.error(`Barcode not found: ${barcode} / বারকোড পাওয়া যায়নি`);
      } else {
        addProductToCart(result.product, 1);
        const elapsed = Math.round(performance.now() - t0);
        console.log(`Barcode scan: ${elapsed}ms`);
        if (elapsed > 100) toast(`Scan took ${elapsed}ms`, { icon: '⚠️' });
      }
    } catch {
      toast.error('Lookup failed / অনুসন্ধান ব্যর্থ হয়েছে');
    }
    setBarcode('');
    barcodeRef.current?.focus();
  }, [barcode]);

  // ── Product search (debounced) ────────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const r = await apiClient.get('/products', {
          params: { search: searchQuery, status: 'ACTIVE', limit: 12, categoryId: categoryFilter || undefined },
        });
        setSearchResults(r.data.data ?? []);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, categoryFilter]);

  // ── Add product to cart ────────────────────────────────────────────────────
  function addProductToCart(product: any, qty = 1) {
    setCart(prev => {
      const existing = prev.findIndex(i => i.productId === product.id);
      if (existing >= 0) {
        const updated = [...prev];
        const item = { ...updated[existing] };
        item.quantity = Math.min(item.quantity + qty, item.stock);
        item.lineTotal = calcLineTotal(item);
        updated[existing] = item;
        toast.success(`+${qty} ${product.nameBn ?? product.name}`);
        return updated;
      }
      const newItem: CartItem = {
        productId: product.id,
        productName: product.name,
        productNameBn: product.nameBn,
        sku: product.sku,
        barcode: product.barcode,
        unitId: product.unit?.id ?? null,
        unitAbbr: product.unit?.abbreviation ?? null,
        quantity: qty,
        unitPrice: parseFloat(product.sellingPrice),
        discountRate: parseFloat(product.discountRate ?? '0'),
        discountAmount: 0,
        taxRate: parseFloat(product.taxRate ?? '0'),
        taxAmount: 0,
        lineTotal: parseFloat(product.sellingPrice) * qty,
        stock: product.totalStock ?? 99,
      };
      newItem.lineTotal = calcLineTotal(newItem);
      toast.success(`Added: ${product.nameBn ?? product.name}`);
      return [...prev, newItem];
    });
    setSearchQuery('');
    setSearchResults([]);
    barcodeRef.current?.focus();
  }

  function updateQty(productId: string, qty: number) {
    if (qty <= 0) { removeFromCart(productId); return; }
    setCart(prev => prev.map(item => {
      if (item.productId !== productId) return item;
      const updated = { ...item, quantity: Math.min(qty, item.stock) };
      return { ...updated, lineTotal: calcLineTotal(updated) };
    }));
  }

  function removeFromCart(productId: string) {
    setCart(prev => prev.filter(i => i.productId !== productId));
  }

  function updateItemDiscount(productId: string, discRate: number) {
    setCart(prev => prev.map(item => {
      if (item.productId !== productId) return item;
      const updated = { ...item, discountRate: discRate };
      return { ...updated, lineTotal: calcLineTotal(updated) };
    }));
  }

  // ── Quick cash sale (F9) ──────────────────────────────────────────────────
  function completeSaleQuick() {
    setPaidAmounts({ CASH: grandTotal });
    setPaymentMethod('CASH');
    setShowPaymentModal(true);
  }

  // ── Complete sale ─────────────────────────────────────────────────────────
  async function completeSale() {
    if (cart.length === 0) { toast.error('Cart is empty'); return; }

    const payments = Object.entries(paidAmounts)
      .filter(([, amt]) => amt > 0)
      .map(([method, amount]) => ({ method, amount }));

    if (payments.length === 0) {
      toast.error('Add payment amount / পেমেন্ট পরিমাণ দিন');
      return;
    }

    try {
      const sale = await createSale.mutateAsync({
        branchId,
        customerId: selectedCustomer?.id,
        discountAmount: saleDiscount > 0 ? saleDiscount : undefined,
        notes: notes || undefined,
        items: cart.map(item => ({
          productId: item.productId,
          unitId: item.unitId ?? undefined,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountRate: item.discountRate,
          taxRate: item.taxRate,
        })),
        payments,
      });

      setShowPaymentModal(false);
      resetCart();
      router.push(`/sales/receipt/${sale.id}`);
    } catch {
      // Error handled by mutation
    }
  }

  function resetCart() {
    setCart([]);
    setSelectedCustomer(null);
    setSaleDiscount(0);
    setPaidAmounts({ CASH: 0 });
    setNotes('');
    barcodeRef.current?.focus();
  }

  // ── Customer search ──────────────────────────────────────────────────────
  const { data: custData } = useCustomers({ search: customerSearch, limit: 10 });
  const customers: Customer[] = custData?.data ?? [];

  async function createQuickCustomer() {
    if (!quickName.trim()) { toast.error('Name required'); return; }
    const cust = await createCustomer.mutateAsync({ name: quickName, phone: quickPhone || undefined });
    setSelectedCustomer(cust);
    setShowQuickCustomer(false);
    setShowCustomerModal(false);
    setQuickName('');
    setQuickPhone('');
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full bg-gray-100 overflow-hidden" data-testid="pos-page">

      {/* ── LEFT: Product Panel (60%) ── */}
      <div className="flex flex-col w-[60%] bg-white border-r border-gray-200 overflow-hidden">

        {/* Header bar */}
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              {/* Barcode input — auto-focus */}
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
                <input
                  ref={barcodeRef}
                  data-testid="barcode-input"
                  type="text"
                  value={barcode}
                  onChange={e => setBarcode(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleBarcodeEnter(); }}
                  placeholder="Scan barcode or press Enter / বারকোড স্ক্যান করুন"
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border-2 border-green-400 focus:outline-none focus:border-green-600 bg-white font-mono"
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="flex-1">
              <input
                ref={searchRef}
                data-testid="search-input"
                type="search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search products (F2) / পণ্য খুঁজুন"
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>
        </div>

        {/* Search results */}
        {searchResults.length > 0 && (
          <div className="border-b border-gray-200 bg-white z-10">
            <div className="grid grid-cols-3 gap-2 p-3 max-h-64 overflow-y-auto">
              {searchResults.map((p: any) => (
                <button
                  key={p.id}
                  onClick={() => addProductToCart(p, 1)}
                  className="text-left p-2 rounded-lg border border-gray-200 hover:border-green-500 hover:bg-green-50 transition-colors"
                >
                  <div className="text-xs font-semibold text-gray-800 line-clamp-1">{p.nameBn ?? p.name}</div>
                  <div className="text-xs text-gray-500 line-clamp-1">{p.name}</div>
                  <div className="text-sm font-bold text-green-700 mt-1">{formatCurrency(p.sellingPrice)}</div>
                  <div className="text-xs text-gray-400">Stock: {p.productStocks?.reduce((s: number, st: any) => s + parseFloat(st.quantity), 0) ?? 0}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Empty state / instructions */}
        {cart.length === 0 && searchResults.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-4">
            <svg className="w-16 h-16 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-500">Scan barcode or search to add items</p>
              <p className="text-sm text-gray-400">বারকোড স্ক্যান করুন বা পণ্য খুঁজুন</p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-gray-400 text-left">
                <span><kbd className="bg-gray-100 border border-gray-300 px-1.5 py-0.5 rounded text-xs">F2</kbd> Search</span>
                <span><kbd className="bg-gray-100 border border-gray-300 px-1.5 py-0.5 rounded text-xs">F4</kbd> Customer</span>
                <span><kbd className="bg-gray-100 border border-gray-300 px-1.5 py-0.5 rounded text-xs">F8</kbd> Payment</span>
                <span><kbd className="bg-gray-100 border border-gray-300 px-1.5 py-0.5 rounded text-xs">F9</kbd> Cash sale</span>
                <span><kbd className="bg-gray-100 border border-gray-300 px-1.5 py-0.5 rounded text-xs">F6</kbd> Discount</span>
                <span><kbd className="bg-gray-100 border border-gray-300 px-1.5 py-0.5 rounded text-xs">Esc</kbd> Close modal</span>
              </div>
            </div>
          </div>
        )}

        {/* Cart items table */}
        {cart.length > 0 && (
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">পণ্য / Product</th>
                  <th className="text-center px-2 py-2 text-xs font-semibold text-gray-500 uppercase w-24">পরিমাণ</th>
                  <th className="text-right px-2 py-2 text-xs font-semibold text-gray-500 uppercase w-24">মূল্য</th>
                  <th className="text-right px-2 py-2 text-xs font-semibold text-gray-500 uppercase w-24">মোট</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cart.map(item => (
                  <tr key={item.productId} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900 text-sm">{item.productNameBn ?? item.productName}</div>
                      <div className="text-xs text-gray-500">{item.productName} · {item.sku}</div>
                      {item.discountRate > 0 && (
                        <div className="text-xs text-green-600">-{item.discountRate}% বাট্টা</div>
                      )}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => updateQty(item.productId, item.quantity - 1)}
                          className="w-6 h-6 rounded border border-gray-300 hover:bg-gray-100 text-sm font-bold"
                        >−</button>
                        <input
                          type="number"
                          value={item.quantity}
                          min={1}
                          max={item.stock}
                          onChange={e => updateQty(item.productId, parseInt(e.target.value) || 1)}
                          className="w-12 text-center border border-gray-300 rounded text-sm py-0.5"
                        />
                        <button
                          onClick={() => updateQty(item.productId, item.quantity + 1)}
                          className="w-6 h-6 rounded border border-gray-300 hover:bg-gray-100 text-sm font-bold"
                        >+</button>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right text-sm font-medium">
                      {formatCurrency(item.unitPrice)}
                    </td>
                    <td className="px-2 py-2 text-right font-semibold text-green-700">
                      {formatCurrency(item.lineTotal)}
                    </td>
                    <td className="px-1 py-2">
                      <button
                        onClick={() => removeFromCart(item.productId)}
                        className="text-red-400 hover:text-red-600 p-1"
                        aria-label="Remove"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── RIGHT: Order Panel (40%) ── */}
      <div className="flex flex-col w-[40%] bg-white overflow-hidden">

        {/* Customer */}
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <button
            onClick={() => setShowCustomerModal(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-300 hover:border-green-500 hover:bg-green-50 transition-colors text-left"
            aria-label="Select customer (F4)"
          >
            <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            {selectedCustomer ? (
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-800 truncate">{selectedCustomer.name}</div>
                <div className="text-xs text-gray-500">Due: {formatCurrency(selectedCustomer.currentBalance)}</div>
              </div>
            ) : (
              <span className="text-sm text-gray-500">Select Customer (F4) / গ্রাহক নির্বাচন</span>
            )}
            {selectedCustomer && (
              <button onClick={e => { e.stopPropagation(); setSelectedCustomer(null); }}
                className="text-gray-400 hover:text-red-500 ml-auto shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </button>
        </div>

        {/* Order summary */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">

          {cart.length === 0 && (
            <div className="text-center text-gray-400 mt-8">
              <p className="text-sm">কার্ট ফাঁকা আছে</p>
              <p className="text-xs">Cart is empty</p>
            </div>
          )}

          {/* Totals */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-2 mt-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>সাবটোটাল / Subtotal</span>
              <span className="font-medium">{formatCurrency(subtotal)}</span>
            </div>
            {saleDiscount > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>বাট্টা / Discount</span>
                <span>-{formatCurrency(saleDiscount)}</span>
              </div>
            )}
            <div className="border-t border-gray-200 pt-2 flex justify-between text-base font-bold text-gray-900">
              <span>গ্র্যান্ড টোটাল</span>
              <span className="text-green-700 text-lg">{formatCurrency(grandTotal)}</span>
            </div>
          </div>

          {/* Discount button */}
          <button
            onClick={() => setShowDiscountModal(true)}
            className="w-full py-2 text-sm border border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-green-500 hover:text-green-700 transition-colors"
          >
            + বাট্টা যোগ করুন / Add Discount (F6)
          </button>

          {/* Notes */}
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="নোট / Notes (optional)"
            rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        {/* Payment buttons */}
        <div className="px-4 py-3 border-t border-gray-200 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_METHODS.slice(0, 6).map(pm => (
              <button
                key={pm.key}
                onClick={() => {
                  setPaidAmounts({ [pm.key]: grandTotal });
                  setPaymentMethod(pm.key);
                  setShowPaymentModal(true);
                }}
                disabled={cart.length === 0}
                className={`py-3 text-xs font-semibold text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${pm.color}`}
              >
                {pm.label}
                <span className="block text-xs font-normal opacity-80">{pm.labelEn}</span>
              </button>
            ))}
          </div>

          <Button
            variant="primary"
            size="lg"
            onClick={() => setShowPaymentModal(true)}
            disabled={cart.length === 0 || createSale.isPending}
            loading={createSale.isPending}
            className="w-full text-base"
          >
            বিক্রয় সম্পন্ন করুন (F9)
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={resetCart}
            disabled={cart.length === 0}
            className="w-full text-gray-500"
          >
            কার্ট মুছুন / Clear Cart
          </Button>
        </div>
      </div>

      {/* ── PAYMENT MODAL ── */}
      <Modal
        open={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        title="পেমেন্ট / Payment"
        titleBn="বিক্রয় নিশ্চিত করুন"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowPaymentModal(false)}>বাতিল / Cancel</Button>
            <Button
              variant="primary"
              size="lg"
              onClick={completeSale}
              loading={createSale.isPending}
              disabled={createSale.isPending}
            >
              ✓ বিক্রয় সম্পন্ন করুন / Complete Sale
            </Button>
          </>
        }
      >
        {/* Grand total display */}
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 text-center">
          <div className="text-xs text-gray-500 mb-1">গ্র্যান্ড টোটাল / Grand Total</div>
          <div className="text-3xl font-bold text-green-700">{formatCurrency(grandTotal)}</div>
        </div>

        {/* Payment method selection */}
        <div className="mb-4">
          <label className="text-sm font-medium text-gray-700 mb-2 block">পেমেন্ট পদ্ধতি / Payment Method</label>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {PAYMENT_METHODS.map(pm => (
              <button
                key={pm.key}
                onClick={() => setPaymentMethod(pm.key)}
                className={`py-2 text-xs font-semibold rounded-lg border-2 transition-colors ${
                  paymentMethod === pm.key
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {pm.label} / {pm.labelEn}
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                ref={paidRef}
                label={`পেমেন্ট পরিমাণ (${paymentMethod})`}
                type="number"
                step="0.01"
                min="0"
                value={paidAmounts[paymentMethod] || ''}
                onChange={e => setPaidAmounts(prev => ({ ...prev, [paymentMethod]: parseFloat(e.target.value) || 0 }))}
                onFocus={e => e.target.select()}
                placeholder="0.00"
              />
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => setPaidAmounts(prev => ({ ...prev, [paymentMethod]: grandTotal - Object.entries(prev).filter(([k]) => k !== paymentMethod).reduce((s, [,v]) => s + v, 0) }))}
                className="whitespace-nowrap"
              >
                Full Amount
              </Button>
            </div>
          </div>
        </div>

        {/* Active payments summary */}
        {Object.entries(paidAmounts).filter(([, v]) => v > 0).length > 0 && (
          <div className="bg-gray-50 rounded-xl p-3 mb-4 space-y-1">
            {Object.entries(paidAmounts).filter(([, v]) => v > 0).map(([method, amount]) => (
              <div key={method} className="flex justify-between text-sm">
                <span className="text-gray-600">{method}</span>
                <span className="font-semibold">{formatCurrency(amount)}</span>
              </div>
            ))}
            <div className="border-t border-gray-200 pt-1 flex justify-between text-sm font-bold">
              <span>মোট পরিশোধিত</span>
              <span>{formatCurrency(totalPaid)}</span>
            </div>
          </div>
        )}

        {/* Change / Due */}
        <div className="grid grid-cols-2 gap-3">
          <div className={`rounded-xl p-3 text-center ${change > 0 ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 border border-gray-200'}`}>
            <div className="text-xs text-gray-500">ফেরত / Change</div>
            <div className={`text-xl font-bold ${change > 0 ? 'text-blue-700' : 'text-gray-400'}`}>{formatCurrency(change)}</div>
          </div>
          <div className={`rounded-xl p-3 text-center ${due > 0 ? 'bg-red-50 border border-red-200' : 'bg-gray-50 border border-gray-200'}`}>
            <div className="text-xs text-gray-500">বাকি / Due</div>
            <div className={`text-xl font-bold ${due > 0 ? 'text-red-600' : 'text-gray-400'}`}>{formatCurrency(due)}</div>
          </div>
        </div>
      </Modal>

      {/* ── CUSTOMER MODAL ── */}
      <Modal
        open={showCustomerModal}
        onClose={() => setShowCustomerModal(false)}
        title="গ্রাহক নির্বাচন / Select Customer"
        size="md"
      >
        <div className="space-y-3">
          <Input
            placeholder="নাম বা ফোন দিয়ে খুঁজুন / Search by name or phone"
            value={customerSearch}
            onChange={e => setCustomerSearch(e.target.value)}
            autoFocus
          />
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {customers.map(c => (
              <button
                key={c.id}
                onClick={() => { setSelectedCustomer(c); setShowCustomerModal(false); setCustomerSearch(''); }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-green-50 hover:text-green-700 border border-transparent hover:border-green-200 transition-colors"
              >
                <div className="text-sm font-medium">{c.name}</div>
                <div className="text-xs text-gray-500">{c.phone} · Due: {formatCurrency(c.currentBalance)}</div>
              </button>
            ))}
            {customers.length === 0 && customerSearch.length > 1 && (
              <p className="text-sm text-gray-400 text-center py-4">No customer found</p>
            )}
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setShowQuickCustomer(true)}
          >
            + নতুন গ্রাহক তৈরি করুন / Create New Customer
          </Button>

          {showQuickCustomer && (
            <div className="border border-gray-200 rounded-xl p-3 space-y-3 bg-gray-50 mt-2">
              <p className="text-sm font-medium text-gray-700">Quick Create Customer</p>
              <Input label="Name" value={quickName} onChange={e => setQuickName(e.target.value)} />
              <Input label="Phone" value={quickPhone} onChange={e => setQuickPhone(e.target.value)} />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowQuickCustomer(false)}>Cancel</Button>
                <Button variant="primary" size="sm" onClick={createQuickCustomer} loading={createCustomer.isPending}>Create</Button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ── DISCOUNT MODAL ── */}
      <Modal
        open={showDiscountModal}
        onClose={() => setShowDiscountModal(false)}
        title="বাট্টা / Sale Discount (F6)"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowDiscountModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => setShowDiscountModal(false)}>Apply</Button>
          </>
        }
      >
        <Input
          label="Discount Amount (৳)"
          labelBn="বাট্টার পরিমাণ"
          type="number"
          min="0"
          max={subtotal}
          step="0.01"
          value={saleDiscount || ''}
          onChange={e => setSaleDiscount(parseFloat(e.target.value) || 0)}
          autoFocus
          hint={`Max: ${formatCurrency(subtotal)}`}
        />
      </Modal>
    </div>
  );
}
