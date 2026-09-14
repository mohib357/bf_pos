'use client';
import { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { PageHeader, SearchBar } from '@/components/ui/PageHeader';
import { Table, Pagination } from '@/components/ui/Table';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { useAuthStore } from '@/store/auth.store';
import { formatCurrency } from '@/lib/utils';
import apiClient from '@/lib/api';
import {
  useProducts, useProductDetail, useProductHistory, useProductStats,
  useCreateProduct, useUpdateProduct, useDeleteProduct, useBulkStatusUpdate,
  useCategoryTree, useBrands, useUnits, useBarcodeSearch,
  ProductListItem, ProductDetail,
} from '@/hooks/useProducts';

// ─── Schemas ─────────────────────────────────────────────────────────────────
const productSchema = z.object({
  name: z.string().min(1, 'Product name is required / পণ্যের নাম দিন'),
  nameBn: z.string().optional(),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  categoryId: z.string().optional(),
  brandId: z.string().optional(),
  unitId: z.string().optional(),
  costPrice: z.coerce.number().min(0).optional(),
  sellingPrice: z.coerce.number().min(0).optional(),
  wholesalePrice: z.coerce.number().min(0).optional(),
  mrp: z.coerce.number().min(0).optional(),
  minimumStock: z.coerce.number().min(0).optional(),
  reorderLevel: z.coerce.number().min(0).optional(),
  reorderQty: z.coerce.number().min(0).optional(),
  description: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'DISCONTINUED']).optional(),
  priceChangeReason: z.string().optional(),
});
type ProductForm = z.infer<typeof productSchema>;

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: 'bg-green-50 text-green-700 border-green-200',
    INACTIVE: 'bg-gray-50 text-gray-600 border-gray-200',
    DISCONTINUED: 'bg-red-50 text-red-600 border-red-200',
  };
  const labels: Record<string, string> = {
    ACTIVE: 'Active / সক্রিয়',
    INACTIVE: 'Inactive / নিষ্ক্রিয়',
    DISCONTINUED: 'Discontinued / বন্ধ',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${map[status] ?? 'bg-gray-50 text-gray-500'}`}>
      {labels[status] ?? status}
    </span>
  );
}

function StockBadge({ stockStatus, stock }: { stockStatus: string; stock: number }) {
  const map: Record<string, string> = {
    in: 'bg-blue-50 text-blue-700',
    low: 'bg-yellow-50 text-yellow-700',
    out: 'bg-red-50 text-red-700',
  };
  const label: Record<string, string> = { in: 'In Stock', low: 'Low Stock / কম', out: 'Out / শেষ' };
  return (
    <div className="text-right">
      <div className="text-sm font-medium text-gray-900">{stock}</div>
      <span className={`text-xs px-1.5 py-0.5 rounded ${map[stockStatus] ?? ''}`}>
        {label[stockStatus] ?? stockStatus}
      </span>
    </div>
  );
}

// ─── Flat category list helper ─────────────────────────────────────────────────
function flattenCategories(cats: any[], depth = 0): { value: string; label: string }[] {
  const result: { value: string; label: string }[] = [];
  for (const cat of cats) {
    const prefix = depth > 0 ? '  '.repeat(depth) + '↳ ' : '';
    result.push({ value: cat.id, label: `${prefix}${cat.name}${cat.nameBn ? ` / ${cat.nameBn}` : ''}` });
    if (cat.children?.length) {
      result.push(...flattenCategories(cat.children, depth + 1));
    }
  }
  return result;
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function ProductsPage() {
  const { hasPermission } = useAuthStore();
  const canCreate = hasPermission('products:create:products');
  const canEdit = hasPermission('products:update:products');
  const canDelete = hasPermission('products:delete:products');

  // Filters
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [stockFilter, setStockFilter] = useState('');

  // Selection for bulk actions
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Modals
  const [createOpen, setCreateOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<ProductListItem | null>(null);
  const [detailProduct, setDetailProduct] = useState<string | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<ProductListItem | null>(null);
  const [barcodeSearch, setBarcodeSearch] = useState('');
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [labelProduct, setLabelProduct] = useState<ProductListItem | null>(null);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState('ACTIVE');

  // Data
  const { data, isLoading } = useProducts({
    page, limit: 20,
    search: debouncedSearch,
    categoryId: categoryFilter || undefined,
    brandId: brandFilter || undefined,
    status: statusFilter || undefined,
    stockStatus: stockFilter || undefined,
  });
  const { data: stats } = useProductStats();
  const { data: categoryTree = [] } = useCategoryTree();
  const { data: brands = [] } = useBrands();
  const { data: units = [] } = useUnits();
  const { data: productDetail } = useProductDetail(editProduct?.id ?? null);
  const { data: detailData, isLoading: detailLoading } = useProductHistory(detailProduct);

  const products: ProductListItem[] = data?.data ?? [];
  const meta = data?.meta;

  // Mutations
  const createMut = useCreateProduct();
  const updateMut = useUpdateProduct(editProduct?.id ?? '');
  const deleteMut = useDeleteProduct(deleteProduct?.id ?? '');
  const bulkMut = useBulkStatusUpdate();
  const barcodeSearchMut = useBarcodeSearch();

  // Forms
  const createForm = useForm<ProductForm>({ resolver: zodResolver(productSchema) });
  const editForm = useForm<ProductForm>({ resolver: zodResolver(productSchema) });

  const categoryOptions = flattenCategories(categoryTree);
  const brandOptions = brands.map((b: any) => ({ value: b.id, label: `${b.name}${b.nameBn ? ` / ${b.nameBn}` : ''}` }));
  const unitOptions = units.map((u: any) => ({ value: u.id, label: `${u.name} (${u.abbreviation})` }));

  // Search debounce
  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    clearTimeout((window as any).__searchTimer);
    (window as any).__searchTimer = setTimeout(() => { setDebouncedSearch(v); setPage(1); }, 400);
  }, []);

  // SKU/barcode auto-gen
  const handleAutoSku = async () => {
    try {
      const catId = createForm.getValues('categoryId');
      const catCode = categoryTree.find((c: any) => c.id === catId)?.code;
      const res = await apiClient.post('/products/generate-sku', { categoryCode: catCode });
      createForm.setValue('sku', res.data.data.sku);
    } catch { toast.error('SKU generation failed'); }
  };

  const handleAutoBarcode = async (form: typeof createForm | typeof editForm) => {
    try {
      const res = await apiClient.get('/products/generate-barcode');
      form.setValue('barcode', res.data.data.barcode);
    } catch { toast.error('Barcode generation failed'); }
  };

  const handleCreate = async (data: ProductForm) => {
    await createMut.mutateAsync(data);
    setCreateOpen(false);
    createForm.reset();
  };

  const handleEdit = async (data: ProductForm) => {
    if (!editProduct) return;
    await updateMut.mutateAsync(data);
    setEditProduct(null);
    editForm.reset();
  };

  const openEdit = (product: ProductListItem) => {
    setEditProduct(product);
    editForm.reset({
      name: product.name,
      nameBn: product.nameBn ?? '',
      sku: product.sku,
      barcode: product.barcode ?? '',
      categoryId: product.category?.id ?? '',
      brandId: product.brand?.id ?? '',
      unitId: product.unit?.id ?? '',
      costPrice: parseFloat(product.costPrice),
      sellingPrice: parseFloat(product.sellingPrice),
      wholesalePrice: product.wholesalePrice ? parseFloat(product.wholesalePrice) : undefined,
      mrp: product.mrp ? parseFloat(product.mrp) : undefined,
      minimumStock: parseFloat(product.minimumStock),
      reorderLevel: parseFloat(product.reorderLevel),
      status: product.status,
    });
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === products.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(products.map(p => p.id)));
    }
  };

  const handleBulkStatus = async () => {
    if (selected.size === 0) return;
    await bulkMut.mutateAsync({ ids: Array.from(selected), status: bulkStatus });
    setSelected(new Set());
    setBulkStatusOpen(false);
  };

  const handleBarcodeSearch = async () => {
    if (!barcodeSearch.trim()) return;
    const result = await barcodeSearchMut.mutateAsync(barcodeSearch.trim());
    if (result) {
      setBarcodeSearch('');
      setBarcodeOpen(false);
      setDetailProduct((result as any).id);
    }
  };

  const handlePrintLabels = async (product: ProductListItem, copies = 1) => {
    try {
      const resp = await apiClient.post('/barcodes/labels/print',
        { items: [{ productId: product.id, copies }], options: { showBusinessName: true, showProductName: true, showPrice: true, showSku: true, showBarcode: true } },
        { responseType: 'text' }
      );
      const win = window.open('', '_blank');
      if (win) { win.document.write(resp.data); win.document.close(); }
    } catch { toast.error('Label print failed'); }
  };

  const handleExport = async (format: 'xlsx' | 'csv') => {
    try {
      const resp = await apiClient.get(`/products/export?format=${format}`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([resp.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `products-export.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Export failed'); }
  };

  // ─── Table columns ──────────────────────────────────────────────────────────
  const columns = [
    {
      key: 'select',
      header: '',
      render: (row: ProductListItem) => (
        <input
          type="checkbox"
          checked={selected.has(row.id)}
          onChange={() => toggleSelect(row.id)}
          onClick={(e) => e.stopPropagation()}
          className="w-4 h-4 rounded text-green-600 border-gray-300"
        />
      ),
      className: 'w-10',
    },
    {
      key: 'product',
      header: 'Product', headerBn: 'পণ্য',
      render: (row: ProductListItem) => (
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {row.name[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate max-w-[200px]">{row.name}</p>
            {row.nameBn && <p className="text-xs text-gray-500 font-bn truncate">{row.nameBn}</p>}
          </div>
        </div>
      ),
    },
    {
      key: 'sku',
      header: 'SKU / Barcode',
      render: (row: ProductListItem) => (
        <div>
          <p className="text-xs font-mono font-medium text-gray-700">{row.sku}</p>
          {row.barcode && <p className="text-xs text-gray-400 font-mono">{row.barcode}</p>}
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category', headerBn: 'ক্যাটাগরি',
      render: (row: ProductListItem) => (
        <div>
          <p className="text-xs text-gray-700">{row.category?.name ?? '—'}</p>
          {row.brand && <p className="text-xs text-gray-400">{row.brand.name}</p>}
        </div>
      ),
    },
    {
      key: 'price',
      header: 'Price', headerBn: 'মূল্য',
      align: 'right' as const,
      render: (row: ProductListItem) => (
        <div className="text-right">
          <p className="text-sm font-semibold text-gray-900">{formatCurrency(parseFloat(row.sellingPrice))}</p>
          <p className="text-xs text-gray-400">cost: {formatCurrency(parseFloat(row.costPrice))}</p>
        </div>
      ),
    },
    {
      key: 'stock',
      header: 'Stock', headerBn: 'স্টক',
      align: 'right' as const,
      render: (row: ProductListItem) => (
        <StockBadge stockStatus={row.stockStatus} stock={row.totalStock} />
      ),
    },
    {
      key: 'unit',
      header: 'Unit', headerBn: 'একক',
      render: (row: ProductListItem) => (
        <span className="text-xs text-gray-600">{row.unit?.abbreviation ?? '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status', headerBn: 'স্ট্যাটাস',
      render: (row: ProductListItem) => <StatusBadge status={row.status} />,
    },
    {
      key: 'actions',
      header: 'Actions', headerBn: 'কার্যক্রম',
      align: 'right' as const,
      render: (row: ProductListItem) => (
        <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
          {/* View detail */}
          <button
            onClick={() => setDetailProduct(row.id)}
            className="p-1.5 rounded hover:bg-blue-50 text-blue-500" title="View Detail / বিস্তারিত"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0zm6 0c-3.866 4.667-8 7-12 7S3 16.667 3 12 7.134 5 12 5s8.134 2.333 12 7z" />
            </svg>
          </button>
          {/* Print label */}
          <button
            onClick={() => setLabelProduct(row)}
            className="p-1.5 rounded hover:bg-yellow-50 text-yellow-600" title="Print Label / লেবেল"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
          </button>
          {canEdit && (
            <button
              onClick={() => openEdit(row)}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title="Edit / সম্পাদনা"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => setDeleteProduct(row)}
              className="p-1.5 rounded hover:bg-red-50 text-red-500" title="Delete / মুছুন"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      ),
    },
  ];

  // ─── Product form fields (reused in create + edit) ──────────────────────────
  const ProductFormFields = ({ form, isEdit = false }: { form: typeof createForm; isEdit?: boolean }) => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Input {...form.register('name')} label="Product Name (EN)" labelBn="পণ্যের নাম (ইংরেজি)" placeholder="e.g. Al Quran Large" error={form.formState.errors.name?.message} />
        <Input {...form.register('nameBn')} label="Product Name (BN)" labelBn="পণ্যের নাম (বাংলা)" placeholder="e.g. আল কুরআন বড়" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="flex gap-1">
            <div className="flex-1">
              <Input {...form.register('sku')} label="SKU" labelBn="এসকেইউ" placeholder="Auto-generated if blank" />
            </div>
            {!isEdit && (
              <button type="button" onClick={handleAutoSku}
                className="mt-6 px-2 h-9 text-xs bg-gray-100 hover:bg-gray-200 rounded border border-gray-200 whitespace-nowrap shrink-0">
                Auto
              </button>
            )}
          </div>
        </div>
        <div>
          <div className="flex gap-1">
            <div className="flex-1">
              <Input {...form.register('barcode')} label="Barcode" labelBn="বারকোড" placeholder="Auto EAN-13 if blank" />
            </div>
            <button type="button" onClick={() => handleAutoBarcode(form)}
              className="mt-6 px-2 h-9 text-xs bg-gray-100 hover:bg-gray-200 rounded border border-gray-200 whitespace-nowrap shrink-0">
              Auto
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Select {...form.register('categoryId')} label="Category" labelBn="ক্যাটাগরি" options={categoryOptions} placeholder="Select category" />
        <Select {...form.register('brandId')} label="Brand" labelBn="ব্র্যান্ড" options={brandOptions} placeholder="Select brand" />
        <Select {...form.register('unitId')} label="Unit" labelBn="একক" options={unitOptions} placeholder="Select unit" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Input {...form.register('costPrice')} type="number" step="0.01" label="Cost Price ৳" labelBn="ক্রয় মূল্য" placeholder="0.00" />
        <Input {...form.register('sellingPrice')} type="number" step="0.01" label="Selling Price ৳" labelBn="বিক্রয় মূল্য" placeholder="0.00" />
        <Input {...form.register('wholesalePrice')} type="number" step="0.01" label="Wholesale ৳" labelBn="পাইকারি মূল্য" placeholder="0.00" />
        <Input {...form.register('mrp')} type="number" step="0.01" label="MRP ৳" labelBn="সর্বোচ্চ মূল্য" placeholder="0.00" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Input {...form.register('minimumStock')} type="number" step="1" label="Min Stock" labelBn="ন্যূনতম স্টক" placeholder="0" />
        <Input {...form.register('reorderLevel')} type="number" step="1" label="Reorder Level" labelBn="পুনরায় অর্ডার স্তর" placeholder="0" />
        <Input {...form.register('reorderQty')} type="number" step="1" label="Reorder Qty" labelBn="পুনরায় অর্ডার পরিমাণ" placeholder="0" />
      </div>

      {isEdit && (
        <div className="grid grid-cols-2 gap-3">
          <Select {...form.register('status')} label="Status" labelBn="স্ট্যাটাস"
            options={[
              { value: 'ACTIVE', label: 'Active / সক্রিয়' },
              { value: 'INACTIVE', label: 'Inactive / নিষ্ক্রিয়' },
              { value: 'DISCONTINUED', label: 'Discontinued / বন্ধ' },
            ]}
          />
          <Input {...form.register('priceChangeReason')} label="Price Change Reason" labelBn="মূল্য পরিবর্তনের কারণ" placeholder="Optional — for price history" />
        </div>
      )}

      <Input {...form.register('description')} label="Description" labelBn="বিবরণ" placeholder="Optional product description" />
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Products"
        titleBn="পণ্য ব্যবস্থাপনা"
        description="Manage products, categories, barcodes and pricing."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Products' }]}
        actions={
          <div className="flex items-center gap-2">
            {/* Barcode lookup */}
            <button onClick={() => setBarcodeOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.524c.491 0 .82-.51.588-.953A8.003 8.003 0 004.58 11.047C4.348 11.49 4.677 12 5.168 12H8m4 0v4" />
              </svg>
              Scan
            </button>
            {/* Export */}
            <div className="relative group">
              <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export ▾
              </button>
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg hidden group-hover:block z-10 w-32">
                <button onClick={() => handleExport('xlsx')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">Excel (.xlsx)</button>
                <button onClick={() => handleExport('csv')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">CSV</button>
              </div>
            </div>
            {/* Import */}
            <a href="/products/import"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Import
            </a>
            {canCreate && (
              <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Product / পণ্য যোগ
              </Button>
            )}
          </div>
        }
      />

      <div className="p-6 flex-1 overflow-auto space-y-4">
        {/* Stats row */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Total', labelBn: 'মোট', value: stats.total, color: 'text-gray-700' },
              { label: 'Active', labelBn: 'সক্রিয়', value: stats.active, color: 'text-green-700' },
              { label: 'Inactive', labelBn: 'নিষ্ক্রিয়', value: stats.inactive, color: 'text-gray-500' },
              { label: 'Discontinued', labelBn: 'বন্ধ', value: stats.discontinued, color: 'text-red-500' },
              { label: 'Low Stock', labelBn: 'কম স্টক', value: stats.lowStock, color: 'text-yellow-600' },
              { label: 'Out of Stock', labelBn: 'স্টক শেষ', value: stats.outOfStock, color: 'text-red-600' },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-lg border border-gray-200 px-3 py-2 text-center">
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
                <p className="text-xs text-gray-400 font-bn">{s.labelBn}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <SearchBar
            value={search}
            onChange={handleSearchChange}
            placeholder="Search name, SKU, barcode... / পণ্য খুঁজুন"
            className="w-72"
          />
          <select
            value={categoryFilter}
            onChange={e => { setCategoryFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">All Categories / সব ক্যাটাগরি</option>
            {categoryOptions.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <select
            value={brandFilter}
            onChange={e => { setBrandFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">All Brands</option>
            {brands.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">All Status</option>
            <option value="ACTIVE">Active / সক্রিয়</option>
            <option value="INACTIVE">Inactive / নিষ্ক্রিয়</option>
            <option value="DISCONTINUED">Discontinued</option>
          </select>
          <select
            value={stockFilter}
            onChange={e => { setStockFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">All Stock Status</option>
            <option value="in">In Stock</option>
            <option value="low">Low Stock / কম</option>
            <option value="out">Out of Stock / শেষ</option>
          </select>
          <div className="ml-auto text-xs text-gray-500">
            {meta?.total ?? 0} products
          </div>
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
            <span className="text-sm font-medium text-green-800">{selected.size} selected</span>
            <button onClick={() => setBulkStatusOpen(true)}
              className="text-sm text-green-700 underline hover:no-underline">
              Change Status
            </button>
            <button onClick={() => {
              const ids = Array.from(selected);
              apiClient.post('/barcodes/labels/print', {
                items: ids.map(id => ({ productId: id, copies: 1 })),
                options: { showBusinessName: true, showProductName: true, showPrice: true, showSku: true, showBarcode: true }
              }, { responseType: 'text' }).then(r => {
                const win = window.open('', '_blank');
                if (win) { win.document.write(r.data); win.document.close(); }
              });
            }} className="text-sm text-green-700 underline hover:no-underline">
              Print Labels
            </button>
            <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-gray-500 hover:text-gray-700">
              Clear
            </button>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Select all row */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-100 bg-gray-50">
            <input
              type="checkbox"
              checked={selected.size === products.length && products.length > 0}
              onChange={toggleAll}
              className="w-4 h-4 rounded text-green-600 border-gray-300"
            />
            <span className="text-xs text-gray-500">Select all on this page</span>
          </div>
          <Table
            columns={columns}
            data={products}
            keyField="id"
            loading={isLoading}
            emptyMessage="No products found"
            emptyMessageBn="কোনো পণ্য পাওয়া যায়নি"
            onRowClick={(row) => setDetailProduct(row.id)}
          />
          {meta && meta.totalPages > 1 && (
            <Pagination
              page={meta.page}
              totalPages={meta.totalPages}
              total={meta.total}
              limit={meta.limit}
              onPageChange={setPage}
            />
          )}
        </div>
      </div>

      {/* ── Create Product Modal ─── */}
      <Modal
        open={createOpen}
        onClose={() => { setCreateOpen(false); createForm.reset(); }}
        title="Add New Product"
        titleBn="নতুন পণ্য যোগ করুন"
        size="xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={createMut.isPending} onClick={createForm.handleSubmit(handleCreate)}>
              Create Product / পণ্য তৈরি করুন
            </Button>
          </>
        }
      >
        <ProductFormFields form={createForm} />
      </Modal>

      {/* ── Edit Product Modal ─── */}
      <Modal
        open={!!editProduct}
        onClose={() => { setEditProduct(null); editForm.reset(); }}
        title="Edit Product"
        titleBn="পণ্য সম্পাদনা করুন"
        size="xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditProduct(null)}>Cancel</Button>
            <Button variant="primary" loading={updateMut.isPending} onClick={editForm.handleSubmit(handleEdit)}>
              Save Changes / পরিবর্তন সংরক্ষণ
            </Button>
          </>
        }
      >
        <ProductFormFields form={editForm} isEdit={true} />
      </Modal>

      {/* ── Product Detail / History Drawer ─── */}
      <Modal
        open={!!detailProduct}
        onClose={() => setDetailProduct(null)}
        title="Product Detail"
        titleBn="পণ্যের বিস্তারিত"
        size="xl"
      >
        {detailLoading && <div className="py-12 text-center text-gray-400 animate-pulse">Loading…</div>}
        {detailData && (
          <div className="space-y-5">
            {/* Product info */}
            <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-xl p-4">
              <div>
                <p className="text-base font-semibold text-gray-900">{detailData.name}</p>
                {detailData.nameBn && <p className="text-sm text-gray-500 font-bn">{detailData.nameBn}</p>}
                <p className="text-xs text-gray-400 mt-1">SKU: {detailData.sku}</p>
                {detailData.barcode && <p className="text-xs text-gray-400">Barcode: {detailData.barcode}</p>}
              </div>
              <div className="text-right space-y-1">
                <p className="text-xs text-gray-500">Selling: <strong className="text-gray-900">{formatCurrency(parseFloat(detailData.sellingPrice))}</strong></p>
                <p className="text-xs text-gray-500">Cost: <strong>{formatCurrency(parseFloat(detailData.costPrice))}</strong></p>
                {detailData.wholesalePrice && <p className="text-xs text-gray-500">Wholesale: <strong>{formatCurrency(parseFloat(detailData.wholesalePrice))}</strong></p>}
                <p className="text-xs mt-2"><StatusBadge status={detailData.status} /></p>
              </div>
            </div>

            {/* Stock summary */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Stock / স্টক</h3>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-blue-700">{detailData.totalStock}</p>
                  <p className="text-xs text-blue-500">Total Stock</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-green-700">{formatCurrency(detailData.stockValue)}</p>
                  <p className="text-xs text-green-500">Stock Value (cost)</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-purple-700">{formatCurrency(detailData.sellingValue)}</p>
                  <p className="text-xs text-purple-500">Selling Value</p>
                </div>
              </div>
            </div>

            {/* Price history */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Price History / মূল্যের ইতিহাস</h3>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-500">Date</th>
                      <th className="px-3 py-2 text-right text-gray-500">Cost</th>
                      <th className="px-3 py-2 text-right text-gray-500">Selling</th>
                      <th className="px-3 py-2 text-left text-gray-500">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(detailData.priceHistory ?? []).slice(0, 10).map((ph: any) => (
                      <tr key={ph.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-500">{new Date(ph.createdAt).toLocaleDateString('en-GB')}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(parseFloat(ph.costPrice))}</td>
                        <td className="px-3 py-2 text-right font-medium text-green-700">{formatCurrency(parseFloat(ph.sellingPrice))}</td>
                        <td className="px-3 py-2 text-gray-400">{ph.reason ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Stock movements */}
            {detailData.stockMovements?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Stock Movements / স্টক চলাচল</h3>
                <div className="border border-gray-200 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-500">Type</th>
                        <th className="px-3 py-2 text-right text-gray-500">Qty</th>
                        <th className="px-3 py-2 text-right text-gray-500">Balance</th>
                        <th className="px-3 py-2 text-left text-gray-500">Warehouse</th>
                        <th className="px-3 py-2 text-left text-gray-500">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {detailData.stockMovements.slice(0, 20).map((sm: any) => (
                        <tr key={sm.id}>
                          <td className="px-3 py-2"><span className={`px-1.5 py-0.5 rounded text-xs ${sm.type.includes('IN') || sm.type === 'PURCHASE' || sm.type === 'OPENING_STOCK' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{sm.type}</span></td>
                          <td className="px-3 py-2 text-right font-mono">{parseFloat(sm.quantity).toFixed(0)}</td>
                          <td className="px-3 py-2 text-right font-mono text-gray-600">{parseFloat(sm.balanceAfter).toFixed(0)}</td>
                          <td className="px-3 py-2 text-gray-500">{sm.warehouse?.name ?? '—'}</td>
                          <td className="px-3 py-2 text-gray-400">{new Date(sm.createdAt).toLocaleDateString('en-GB')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2 border-t border-gray-100">
              {canEdit && (
                <Button variant="outline" size="sm" onClick={() => {
                  setDetailProduct(null);
                  const prod = products.find(p => p.id === detailProduct);
                  if (prod) openEdit(prod);
                }}>
                  Edit Product
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => {
                const prod = products.find(p => p.id === detailProduct);
                if (prod) handlePrintLabels(prod, 1);
              }}>
                Print Label
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Barcode Lookup Modal ─── */}
      <Modal
        open={barcodeOpen}
        onClose={() => { setBarcodeOpen(false); setBarcodeSearch(''); }}
        title="Barcode / SKU Lookup"
        titleBn="বারকোড / SKU অনুসন্ধান"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setBarcodeOpen(false)}>Close</Button>
            <Button variant="primary" loading={barcodeSearchMut.isPending} onClick={handleBarcodeSearch}>
              Search / খুঁজুন
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            value={barcodeSearch}
            onChange={e => setBarcodeSearch(e.target.value)}
            label="Scan or type barcode / SKU"
            labelBn="বারকোড বা SKU লিখুন"
            placeholder="2000000000121 or BOOK-QH-003"
            onKeyDown={e => e.key === 'Enter' && handleBarcodeSearch()}
            autoFocus
          />
          <p className="text-xs text-gray-400">Tip: Use a barcode scanner or type the barcode/SKU manually.</p>
        </div>
      </Modal>

      {/* ── Label Print Modal ─── */}
      {labelProduct && (
        <Modal
          open={true}
          onClose={() => setLabelProduct(null)}
          title="Print Barcode Label"
          titleBn="বারকোড লেবেল প্রিন্ট করুন"
          size="sm"
          footer={
            <>
              <Button variant="outline" onClick={() => setLabelProduct(null)}>Cancel</Button>
              <Button variant="primary" onClick={() => {
                const copies = parseInt((document.getElementById('label-copies') as HTMLInputElement)?.value ?? '1');
                handlePrintLabels(labelProduct, copies);
                setLabelProduct(null);
              }}>
                Print / প্রিন্ট করুন
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
              <p className="font-medium">{labelProduct.name}</p>
              {labelProduct.nameBn && <p className="font-bn text-gray-600">{labelProduct.nameBn}</p>}
              <p className="text-xs text-gray-400">SKU: {labelProduct.sku}</p>
              <p className="text-xs text-gray-400">Barcode: {labelProduct.barcode ?? 'N/A'}</p>
              <p className="text-xs font-medium text-green-700">Price: {formatCurrency(parseFloat(labelProduct.sellingPrice))}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Copies / কপি সংখ্যা</label>
              <input id="label-copies" type="number" defaultValue={1} min={1} max={100}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
          </div>
        </Modal>
      )}

      {/* ── Bulk Status Modal ─── */}
      <Modal
        open={bulkStatusOpen}
        onClose={() => setBulkStatusOpen(false)}
        title={`Change Status for ${selected.size} products`}
        titleBn={`${selected.size} টি পণ্যের স্ট্যাটাস পরিবর্তন`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setBulkStatusOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={bulkMut.isPending} onClick={handleBulkStatus}>
              Apply / প্রয়োগ করুন
            </Button>
          </>
        }
      >
        <Select
          value={bulkStatus}
          onChange={e => setBulkStatus(e.target.value)}
          label="New Status" labelBn="নতুন স্ট্যাটাস"
          options={[
            { value: 'ACTIVE', label: 'Active / সক্রিয়' },
            { value: 'INACTIVE', label: 'Inactive / নিষ্ক্রিয়' },
            { value: 'DISCONTINUED', label: 'Discontinued / বন্ধ' },
          ]}
        />
      </Modal>

      {/* ── Delete Confirm ─── */}
      <ConfirmDialog
        open={!!deleteProduct}
        onClose={() => setDeleteProduct(null)}
        onConfirm={async () => { await deleteMut.mutateAsync(); setDeleteProduct(null); }}
        title="Delete Product / পণ্য মুছুন"
        message={`Delete "${deleteProduct?.name}"? This will soft-delete the product. Historical transactions remain intact. / এই পণ্যটি মুছে ফেলা হবে। পুরানো লেনদেন অপরিবর্তিত থাকবে।`}
        confirmLabel="Delete / মুছুন"
        loading={deleteMut.isPending}
      />
    </div>
  );
}
