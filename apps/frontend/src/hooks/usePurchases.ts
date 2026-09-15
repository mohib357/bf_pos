'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PurchaseListItem {
  id: string;
  invoiceNumber: string;
  purchaseDate: string;
  dueDate: string | null;
  status: 'DRAFT' | 'ORDERED' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED' | 'RETURNED';
  paymentStatus: 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  totalAmount: string;
  paidAmount: string;
  dueAmount: string;
  supplier: { id: string; name: string; phone: string | null };
  branch: { id: string; name: string };
  _count: { items: number; payments: number };
}

export interface PurchaseDetail extends PurchaseListItem {
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  shippingCost: string;
  otherCost: string;
  referenceNo: string | null;
  notes: string | null;
  items: PurchaseItem[];
  payments: SupplierPayment[];
  purchaseReturns: PurchaseReturn[];
  journalEntries: any[];
}

export interface PurchaseItem {
  id: string;
  productId: string;
  quantity: string;
  receivedQty: string;
  returnedQty: string;
  unitCost: string;
  discountRate: string;
  discountAmount: string;
  taxRate: string;
  taxAmount: string;
  totalAmount: string;
  product: { id: string; name: string; nameBn: string | null; sku: string; barcode: string | null };
  unit: { id: string; name: string; abbreviation: string } | null;
}

export interface SupplierPayment {
  id: string;
  paymentNumber: string;
  paymentDate: string;
  amount: string;
  method: string;
  referenceNo: string | null;
  notes: string | null;
}

export interface PurchaseReturn {
  id: string;
  returnNumber: string;
  returnDate: string;
  totalAmount: string;
  status: string;
  reason: string | null;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  nameBn: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  currentBalance: string;
  openingBalance: string;
  creditLimit: string;
  isActive: boolean;
}

export interface PurchaseStats {
  total: number;
  received: number;
  draft: number;
  due: number;
  thisMonthTotal: string;
  thisMonthDue: string;
}

export interface BarcodeResult {
  found: boolean;
  barcode: string;
  product?: {
    id: string; name: string; nameBn: string | null;
    sku: string; barcode: string | null; costPrice: string;
    sellingPrice: string; totalStock: number;
    category: { name: string } | null;
    unit: { name: string; abbreviation: string } | null;
  };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function usePurchases(params: Record<string, any> = {}) {
  return useQuery({
    queryKey: ['purchases', params],
    queryFn: async () => {
      const r = await apiClient.get('/purchases', { params });
      return r.data;
    },
    staleTime: 30_000,
  });
}

export function usePurchaseDetail(id: string) {
  return useQuery({
    queryKey: ['purchases', id],
    queryFn: async () => {
      const r = await apiClient.get(`/purchases/${id}`);
      return r.data.data as PurchaseDetail;
    },
    enabled: !!id,
  });
}

export function usePurchaseStats() {
  return useQuery({
    queryKey: ['purchases', 'stats'],
    queryFn: async () => {
      const r = await apiClient.get('/purchases/stats');
      return r.data.data as PurchaseStats;
    },
    staleTime: 60_000,
  });
}

export function useSuppliers(params: Record<string, any> = {}) {
  return useQuery({
    queryKey: ['suppliers', params],
    queryFn: async () => {
      const r = await apiClient.get('/suppliers', { params });
      return r.data;
    },
    staleTime: 30_000,
  });
}

export function useSupplierDetail(id: string) {
  return useQuery({
    queryKey: ['suppliers', id],
    queryFn: async () => {
      const r = await apiClient.get(`/suppliers/${id}`);
      return r.data.data as Supplier;
    },
    enabled: !!id,
  });
}

export function useSupplierStatement(id: string, params?: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ['suppliers', id, 'statement', params],
    queryFn: async () => {
      const r = await apiClient.get(`/suppliers/${id}/statement`, { params });
      return r.data.data;
    },
    enabled: !!id,
  });
}

export function useBarcodeForPurchase(barcode: string) {
  return useQuery({
    queryKey: ['purchases', 'barcode', barcode],
    queryFn: async () => {
      const r = await apiClient.get(`/purchases/barcode/${barcode}`);
      return r.data.data as BarcodeResult;
    },
    enabled: !!barcode && barcode.length >= 8,
    staleTime: 5_000,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreatePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const r = await apiClient.post('/purchases', data);
      return r.data.data;
    },
    onSuccess: (purchase) => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success(`Purchase ${purchase.invoiceNumber} created / ক্রয় তৈরি হয়েছে`);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || 'Failed to create purchase';
      toast.error(msg);
    },
  });
}

export function useReceivePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const r = await apiClient.post(`/purchases/${id}/receive`, data);
      return r.data.data;
    },
    onSuccess: (purchase) => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success(`Purchase received — stock updated / পণ্য গৃহীত হয়েছে`);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Receive failed');
    },
  });
}

export function useAddPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const r = await apiClient.post(`/purchases/${id}/payment`, data);
      return r.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success('Payment recorded / পেমেন্ট রেকর্ড হয়েছে');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Payment failed');
    },
  });
}

export function useCreatePurchaseReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const r = await apiClient.post(`/purchases/${data.purchaseId}/return`, data);
      return r.data.data;
    },
    onSuccess: (ret) => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success(`Return ${ret.returnNumber} created / ফেরত তৈরি হয়েছে`);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Return failed');
    },
  });
}

export function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const r = await apiClient.post('/suppliers', data);
      return r.data.data;
    },
    onSuccess: (sup) => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success(`Supplier ${sup.name} created / সরবরাহকারী তৈরি হয়েছে`);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to create supplier');
    },
  });
}

export function useUpdateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const r = await apiClient.patch(`/suppliers/${id}`, data);
      return r.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success('Supplier updated / আপডেট হয়েছে');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Update failed');
    },
  });
}
