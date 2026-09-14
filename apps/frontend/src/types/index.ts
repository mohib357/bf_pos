// ─── API Response shape ────────────────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  messagebn?: string;
  data: T;
  meta?: PaginationMeta;
  errors?: ValidationError[];
  timestamp: string;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface ValidationError {
  field: string;
  message: string;
}

// ─── Auth ──────────────────────────────────────────────────────────────────
export interface AuthUser {
  id: string;
  username: string;
  email?: string;
  firstName: string;
  lastName?: string;
  firstNameBn?: string;
  lastNameBn?: string;
  branchId?: string;
  isSuperAdmin: boolean;
  roles: string[];
  permissions: string[];
  mustChangePwd: boolean;
}

// ─── Product ───────────────────────────────────────────────────────────────
export interface Product {
  id: string;
  sku: string;
  barcode?: string;
  name: string;
  nameBn?: string;
  costPrice: string;
  sellingPrice: string;
  taxRate: string;
  reorderLevel: string;
  status: 'ACTIVE' | 'INACTIVE' | 'DISCONTINUED';
  category?: { id: string; name: string; nameBn?: string };
  unit?: { id: string; name: string; abbreviation: string };
  productStocks?: { quantity: string; warehouseId: string }[];
}

// ─── Dashboard Stats ───────────────────────────────────────────────────────
export interface DashboardStats {
  todaySales: number;
  todayTransactions: number;
  totalProducts: number;
  lowStockCount: number;
  totalDue: number;
  monthSales: number;
  monthGrowth: number;
}
