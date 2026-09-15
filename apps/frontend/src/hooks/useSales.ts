'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SaleItem {
  id: string;
  productId: string;
  unitId: string | null;
  quantity: string;
  returnedQty: string;
  unitPrice: string;
  unitCost: string;
  discountRate: string;
  discountAmount: string;
  taxRate: string;
  taxAmount: string;
  totalAmount: string;
  notes: string | null;
  product: { id: string; name: string; nameBn: string | null; sku: string; barcode: string | null };
  unit: { id: string; name: string; abbreviation: string } | null;
}

export interface SalePayment {
  id: string;
  paymentNumber: string;
  paymentDate: string;
  amount: string;
  method: string;
  referenceNo: string | null;
}

export interface SaleListItem {
  id: string;
  invoiceNumber: string;
  saleDate: string;
  status: 'DRAFT' | 'COMPLETED' | 'CANCELLED' | 'RETURNED' | 'PARTIAL';
  paymentStatus: 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE';
  totalAmount: string;
  paidAmount: string;
  dueAmount: string;
  isVoided: boolean;
  customer: { id: string; name: string; nameBn: string | null; phone: string | null } | null;
  branch: { id: string; name: string };
  creator: { id: string; username: string; firstName: string } | null;
  payments: { method: string; amount: string }[];
  _count: { items: number };
}

export interface SaleDetail extends SaleListItem {
  subtotal: string;
  discountRate: string;
  discountAmount: string;
  taxAmount: string;
  changeAmount: string;
  cashRegisterId: string | null;
  notes: string | null;
  voidReason: string | null;
  voidedAt: string | null;
  items: SaleItem[];
  saleReturns: SaleReturn[];
  journalEntries: any[];
}

export interface SaleReturn {
  id: string;
  returnNumber: string;
  returnDate: string;
  totalAmount: string;
  status: string;
  reason: string | null;
  refundMethod: string;
  items: any[];
}

export interface SaleStats {
  totalCount: number;
  completedSales: number;
  draftSales: number;
  todayCount: number;
  todayTotal: string;
  todayPaid: string;
  todayDue: string;
  paymentBreakdown: {
    cash: string;
    card: string;
    bkash: string;
    nagad: string;
    bank: string;
  };
}

export interface BarcodeResult {
  found: boolean;
  barcode: string;
  product?: {
    id: string;
    name: string;
    nameBn: string | null;
    sku: string;
    barcode: string | null;
    sellingPrice: string;
    costPrice: string;
    taxRate: string;
    discountRate: string;
    totalStock: number;
    category: { name: string; nameBn: string | null } | null;
    unit: { id: string; name: string; abbreviation: string; abbrevBn: string | null } | null;
  };
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  nameBn: string | null;
  phone: string | null;
  currentBalance: string;
  creditLimit: string;
}

// ─── Cart Item (frontend only) ────────────────────────────────────────────────

export interface CartItem {
  productId: string;
  productName: string;
  productNameBn: string | null;
  sku: string;
  barcode: string | null;
  unitId: string | null;
  unitAbbr: string | null;
  quantity: number;
  unitPrice: number;
  discountRate: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  stock: number;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useSales(params: Record<string, any> = {}) {
  return useQuery({
    queryKey: ['sales', params],
    queryFn: async () => {
      const r = await apiClient.get('/sales', { params });
      return r.data;
    },
    staleTime: 30_000,
  });
}

export function useSaleDetail(id: string) {
  return useQuery({
    queryKey: ['sales', id],
    queryFn: async () => {
      const r = await apiClient.get(`/sales/${id}`);
      return r.data.data as SaleDetail;
    },
    enabled: !!id,
  });
}

export function useSaleStats() {
  return useQuery({
    queryKey: ['sales', 'stats'],
    queryFn: async () => {
      const r = await apiClient.get('/sales/stats');
      return r.data.data as SaleStats;
    },
    staleTime: 60_000,
  });
}

export function useBarcodeForSale(barcode: string) {
  return useQuery({
    queryKey: ['sales', 'barcode', barcode],
    queryFn: async () => {
      const r = await apiClient.get(`/sales/barcode/${barcode}`);
      return r.data.data as BarcodeResult;
    },
    enabled: !!barcode && barcode.length >= 4,
    staleTime: 5_000,
  });
}

export function useCustomers(params: Record<string, any> = {}) {
  return useQuery({
    queryKey: ['customers', params],
    queryFn: async () => {
      const r = await apiClient.get('/customers', { params });
      return r.data;
    },
    staleTime: 30_000,
  });
}

export function useCashRegister(branchId: string, userId: string) {
  return useQuery({
    queryKey: ['cash-register', 'current', branchId, userId],
    queryFn: async () => {
      const r = await apiClient.get('/cash-register/current', { params: { branchId } });
      return r.data.data;
    },
    enabled: !!branchId,
    staleTime: 60_000,
  });
}

export function useCashRegisterHistory(params: Record<string, any> = {}) {
  return useQuery({
    queryKey: ['cash-register', 'history', params],
    queryFn: async () => {
      const r = await apiClient.get('/cash-register/history', { params });
      return r.data;
    },
    staleTime: 30_000,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const r = await apiClient.post('/sales', data);
      return r.data.data;
    },
    onSuccess: (sale) => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['cash-register'] });
      toast.success(`Sale ${sale.invoiceNumber} completed / বিক্রয় সম্পন্ন হয়েছে`);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.response?.data?.error || 'Sale failed';
      toast.error(msg);
    },
  });
}

export function useVoidSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const r = await apiClient.post(`/sales/${id}/void`, { reason });
      return r.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      toast.success('Sale voided / বিক্রয় বাতিল হয়েছে');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Void failed');
    },
  });
}

export function useCreateSaleReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const r = await apiClient.post(`/sales/${data.saleId}/return`, data);
      return r.data.data;
    },
    onSuccess: (ret) => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      toast.success(`Return ${ret.returnNumber} created / বিক্রয় ফেরত তৈরি হয়েছে`);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Return failed');
    },
  });
}

export function useAddSalePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const r = await apiClient.post(`/sales/${id}/payment`, data);
      return r.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Payment recorded / পেমেন্ট রেকর্ড হয়েছে');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Payment failed');
    },
  });
}

export function useCreateQuickCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; phone?: string }) => {
      const r = await apiClient.post('/customers/quick', data);
      return r.data.data as Customer;
    },
    onSuccess: (cust) => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success(`Customer ${cust.name} created`);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to create customer');
    },
  });
}

export function useOpenCashRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { branchId: string; name: string; openingBalance: number; notes?: string }) => {
      const r = await apiClient.post('/cash-register/open', data);
      return r.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash-register'] });
      toast.success('Cash register opened / রেজিস্টার খোলা হয়েছে');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to open register');
    },
  });
}

export function useCloseCashRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, actualCash, notes }: { id: string; actualCash: number; notes?: string }) => {
      const r = await apiClient.post(`/cash-register/${id}/close`, { actualCash, notes });
      return r.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash-register'] });
      toast.success('Cash register closed / রেজিস্টার বন্ধ হয়েছে');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to close register');
    },
  });
}
