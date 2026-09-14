'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api';
import { ApiResponse } from '@/types';
import toast from 'react-hot-toast';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProductListItem {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  nameBn: string | null;
  costPrice: string;
  sellingPrice: string;
  wholesalePrice: string | null;
  mrp: string | null;
  minimumStock: string;
  reorderLevel: string;
  status: 'ACTIVE' | 'INACTIVE' | 'DISCONTINUED';
  totalStock: number;
  stockValue: number;
  sellingValue: number;
  stockStatus: 'in' | 'low' | 'out';
  category: { id: string; name: string; nameBn: string | null } | null;
  brand: { id: string; name: string } | null;
  unit: { id: string; name: string; abbreviation: string } | null;
}

export interface ProductDetail extends ProductListItem {
  description: string | null;
  descriptionBn: string | null;
  taxRate: string;
  discountRate: string;
  reorderQty: string;
  image: string | null;
  images: string[];
  variants: any[];
  barcodes: { id: string; barcode: string; type: string }[];
  productStocks: { quantity: string; warehouseId: string; warehouse: { name: string } }[];
  priceHistory: PriceHistoryEntry[];
}

export interface PriceHistoryEntry {
  id: string;
  costPrice: string;
  sellingPrice: string;
  wholesalePrice: string | null;
  mrp: string | null;
  reason: string | null;
  changedBy: string | null;
  createdAt: string;
}

export interface ProductWithHistory extends ProductDetail {
  purchaseHistory: any[];
  salesHistory: any[];
  stockMovements: any[];
  supplierHistory: any[];
}

export interface Category {
  id: string;
  code: string;
  name: string;
  nameBn: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  parent: { id: string; name: string } | null;
  children: Category[];
  _count: { products: number };
}

export interface Brand {
  id: string;
  name: string;
  nameBn: string | null;
  description: string | null;
  isActive: boolean;
  _count: { products: number };
}

export interface Unit {
  id: string;
  name: string;
  nameBn: string | null;
  abbreviation: string;
  abbrevBn: string | null;
  isActive: boolean;
}

export interface ProductStats {
  total: number;
  active: number;
  inactive: number;
  discontinued: number;
  lowStock: number;
  outOfStock: number;
}

export interface ProductQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: string;
  brandId?: string;
  status?: string;
  stockStatus?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ─── Products ────────────────────────────────────────────────────────────────

export function useProducts(params: ProductQueryParams) {
  return useQuery({
    queryKey: ['products', params],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ProductListItem[]>>('/products', {
        params: { ...params, limit: params.limit ?? 20 },
      });
      return res.data;
    },
    staleTime: 30_000,
  });
}

export function useProductDetail(id: string | null) {
  return useQuery({
    queryKey: ['products', id],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ProductDetail>>(`/products/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useProductHistory(id: string | null) {
  return useQuery({
    queryKey: ['products', id, 'history'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ProductWithHistory>>(`/products/${id}/history`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useProductStats() {
  return useQuery({
    queryKey: ['products', 'stats'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ProductStats>>('/products/stats');
      return res.data.data;
    },
    staleTime: 60_000,
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await apiClient.post<ApiResponse<ProductDetail>>('/products', data);
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Product created / পণ্য তৈরি হয়েছে');
      qc.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to create product');
    },
  });
}

export function useUpdateProduct(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await apiClient.patch<ApiResponse<ProductDetail>>(`/products/${id}`, data);
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Product updated / পণ্য আপডেট হয়েছে');
      qc.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to update product');
    },
  });
}

export function useDeleteProduct(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/products/${id}`);
    },
    onSuccess: () => {
      toast.success('Product deleted / পণ্য মুছে ফেলা হয়েছে');
      qc.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to delete product');
    },
  });
}

export function useBulkStatusUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { ids: string[]; status: string }) => {
      const res = await apiClient.patch('/products/bulk-status', data);
      return res.data;
    },
    onSuccess: (data: any) => {
      toast.success(data.data?.message || 'Bulk update done');
      qc.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Bulk update failed');
    },
  });
}

export function useGenerateSku(categoryCode?: string) {
  return useQuery({
    queryKey: ['sku-generate', categoryCode],
    queryFn: async () => {
      const res = await apiClient.post<ApiResponse<{ sku: string }>>('/products/generate-sku',
        { categoryCode });
      return res.data.data?.sku;
    },
    enabled: false, // manual trigger
  });
}

export function useGenerateBarcode() {
  return useQuery({
    queryKey: ['barcode-generate'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<{ barcode: string }>>('/products/generate-barcode');
      return res.data.data?.barcode;
    },
    enabled: false,
  });
}

// ─── Categories ──────────────────────────────────────────────────────────────

export function useCategoryTree() {
  return useQuery({
    queryKey: ['categories', 'tree'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<Category[]>>('/categories/tree');
      return res.data.data ?? [];
    },
    staleTime: 5 * 60_000,
  });
}

export function useCategories(params: { search?: string; isActive?: boolean } = {}) {
  return useQuery({
    queryKey: ['categories', params],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<Category[]>>('/categories', {
        params: { ...params, limit: 100, flat: true },
      });
      return res.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await apiClient.post('/categories', data);
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Category created / ক্যাটাগরি তৈরি হয়েছে');
      qc.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed'),
  });
}

export function useUpdateCategory(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await apiClient.patch(`/categories/${id}`, data);
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Category updated / ক্যাটাগরি আপডেট হয়েছে');
      qc.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed'),
  });
}

export function useDeleteCategory(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => { await apiClient.delete(`/categories/${id}`); },
    onSuccess: () => {
      toast.success('Category deleted / ক্যাটাগরি মুছে ফেলা হয়েছে');
      qc.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed'),
  });
}

// ─── Brands ──────────────────────────────────────────────────────────────────

export function useBrands(params: { search?: string; isActive?: boolean } = {}) {
  return useQuery({
    queryKey: ['brands', params],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<Brand[]>>('/brands/all');
      return res.data.data ?? [];
    },
    staleTime: 5 * 60_000,
  });
}

export function useCreateBrand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await apiClient.post('/brands', data);
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Brand created / ব্র্যান্ড তৈরি হয়েছে');
      qc.invalidateQueries({ queryKey: ['brands'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed'),
  });
}

// ─── Units ───────────────────────────────────────────────────────────────────

export function useUnits() {
  return useQuery({
    queryKey: ['units'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<Unit[]>>('/units/all');
      return res.data.data ?? [];
    },
    staleTime: 10 * 60_000,
  });
}

// ─── Barcode lookup ──────────────────────────────────────────────────────────

export function useBarcodeSearch() {
  return useMutation({
    mutationFn: async (barcode: string) => {
      const res = await apiClient.get<ApiResponse<ProductDetail>>(`/barcodes/lookup/${barcode}`);
      return res.data.data;
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Barcode not found / বারকোড পাওয়া যায়নি');
    },
  });
}

export function useLabelData() {
  return useMutation({
    mutationFn: async (payload: { productId: string; copies: number; options?: any }) => {
      const res = await apiClient.post('/barcodes/labels/single', payload);
      return res.data.data;
    },
  });
}

export function useBulkLabels() {
  return useMutation({
    mutationFn: async (payload: { items: { productId: string; copies?: number }[]; options?: any }) => {
      const res = await apiClient.post('/barcodes/labels/bulk', payload);
      return res.data.data;
    },
  });
}
