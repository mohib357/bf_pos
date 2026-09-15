/**
 * Barakah Finance POS — Database Seed v2
 * Seeds: roles, permissions, admin user, accounts chart, branches,
 *        warehouse, categories (hierarchical), brands, units,
 *        sample products with barcodes, numbering sequences, settings
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ─── PERMISSIONS ─────────────────────────────────────────────────────────────
const PERMISSIONS = [
  // Users
  { module: 'users', action: 'create', resource: 'users' },
  { module: 'users', action: 'read', resource: 'users' },
  { module: 'users', action: 'update', resource: 'users' },
  { module: 'users', action: 'delete', resource: 'users' },
  { module: 'users', action: 'manage', resource: 'roles' },
  // Products
  { module: 'products', action: 'create', resource: 'products' },
  { module: 'products', action: 'read', resource: 'products' },
  { module: 'products', action: 'update', resource: 'products' },
  { module: 'products', action: 'delete', resource: 'products' },
  // Categories
  { module: 'categories', action: 'create', resource: 'categories' },
  { module: 'categories', action: 'read', resource: 'categories' },
  { module: 'categories', action: 'update', resource: 'categories' },
  { module: 'categories', action: 'delete', resource: 'categories' },
  // Sales
  { module: 'sales', action: 'create', resource: 'sales' },
  { module: 'sales', action: 'read', resource: 'sales' },
  { module: 'sales', action: 'update', resource: 'sales' },
  { module: 'sales', action: 'void', resource: 'sales' },
  // Purchases
  { module: 'purchases', action: 'create', resource: 'purchases' },
  { module: 'purchases', action: 'read', resource: 'purchases' },
  { module: 'purchases', action: 'update', resource: 'purchases' },
  // Suppliers
  { module: 'suppliers', action: 'create', resource: 'suppliers' },
  { module: 'suppliers', action: 'read', resource: 'suppliers' },
  { module: 'suppliers', action: 'update', resource: 'suppliers' },
  // Customers
  { module: 'customers', action: 'create', resource: 'customers' },
  { module: 'customers', action: 'read', resource: 'customers' },
  { module: 'customers', action: 'update', resource: 'customers' },
  // Inventory
  { module: 'inventory', action: 'read', resource: 'inventory' },
  { module: 'inventory', action: 'adjust', resource: 'inventory' },
  { module: 'inventory', action: 'transfer', resource: 'inventory' },
  // Accounting
  { module: 'accounting', action: 'read', resource: 'accounting' },
  { module: 'accounting', action: 'create', resource: 'journal' },
  { module: 'accounting', action: 'void', resource: 'journal' },
  // Expenses
  { module: 'expenses', action: 'create', resource: 'expenses' },
  { module: 'expenses', action: 'read', resource: 'expenses' },
  { module: 'expenses', action: 'approve', resource: 'expenses' },
  // Reports
  { module: 'reports', action: 'read', resource: 'sales_report' },
  { module: 'reports', action: 'read', resource: 'purchase_report' },
  { module: 'reports', action: 'read', resource: 'inventory_report' },
  { module: 'reports', action: 'read', resource: 'financial_report' },
  { module: 'reports', action: 'export', resource: 'reports' },
  // Investments
  { module: 'investments', action: 'create', resource: 'investments' },
  { module: 'investments', action: 'read', resource: 'investments' },
  // Settings
  { module: 'settings', action: 'read', resource: 'settings' },
  { module: 'settings', action: 'update', resource: 'settings' },
  // Branches
  { module: 'branches', action: 'create', resource: 'branches' },
  { module: 'branches', action: 'read', resource: 'branches' },
  { module: 'branches', action: 'update', resource: 'branches' },
  // Cash Registers
  { module: 'cash', action: 'open', resource: 'register' },
  { module: 'cash', action: 'close', resource: 'register' },
  { module: 'cash', action: 'read', resource: 'register' },
];

// ─── ROLES ────────────────────────────────────────────────────────────────────
const ROLES = [
  { name: 'SUPER_ADMIN', nameBn: 'সুপার অ্যাডমিন', description: 'Full system access', isSystem: true, allPermissions: true },
  { name: 'OWNER',       nameBn: 'মালিক',           description: 'Business owner — full access', isSystem: true, allPermissions: true },
  {
    name: 'MANAGER', nameBn: 'ম্যানেজার', description: 'Branch manager', isSystem: true,
    permissions: [
      'users:read:users',
      'products:create:products', 'products:read:products', 'products:update:products',
      'categories:create:categories', 'categories:read:categories', 'categories:update:categories',
      'sales:create:sales', 'sales:read:sales', 'sales:void:sales',
      'purchases:create:purchases', 'purchases:read:purchases',
      'suppliers:create:suppliers', 'suppliers:read:suppliers', 'suppliers:update:suppliers',
      'customers:create:customers', 'customers:read:customers', 'customers:update:customers',
      'inventory:read:inventory', 'inventory:adjust:inventory',
      'expenses:create:expenses', 'expenses:read:expenses', 'expenses:approve:expenses',
      'reports:read:sales_report', 'reports:read:purchase_report',
      'reports:read:inventory_report', 'reports:read:financial_report',
      'reports:export:reports', 'accounting:read:accounting',
      'settings:read:settings', 'cash:open:register', 'cash:close:register', 'cash:read:register',
    ],
  },
  {
    name: 'CASHIER', nameBn: 'ক্যাশিয়ার', description: 'POS cashier', isSystem: true,
    permissions: [
      'products:read:products', 'sales:create:sales', 'sales:read:sales',
      'customers:create:customers', 'customers:read:customers',
      'cash:open:register', 'cash:close:register', 'cash:read:register',
    ],
  },
  {
    name: 'INVENTORY_STAFF', nameBn: 'ইনভেন্টরি স্টাফ', description: 'Manages stock', isSystem: true,
    permissions: [
      'products:read:products', 'products:create:products', 'products:update:products',
      'purchases:create:purchases', 'purchases:read:purchases',
      'inventory:read:inventory', 'inventory:adjust:inventory', 'inventory:transfer:inventory',
      'suppliers:read:suppliers', 'suppliers:create:suppliers',
      'categories:read:categories',
    ],
  },
  {
    name: 'ACCOUNTANT', nameBn: 'হিসাবরক্ষক', description: 'Financial operations', isSystem: true,
    permissions: [
      'accounting:read:accounting', 'accounting:create:journal', 'accounting:void:journal',
      'expenses:create:expenses', 'expenses:read:expenses', 'expenses:approve:expenses',
      'reports:read:financial_report', 'reports:read:sales_report', 'reports:read:purchase_report',
      'investments:read:investments', 'sales:read:sales', 'purchases:read:purchases',
    ],
  },
  {
    name: 'VIEWER', nameBn: 'ভিউয়ার', description: 'Read-only access', isSystem: true,
    permissions: [
      'products:read:products', 'sales:read:sales', 'purchases:read:purchases',
      'suppliers:read:suppliers', 'customers:read:customers',
      'inventory:read:inventory', 'categories:read:categories',
      'reports:read:sales_report', 'reports:read:inventory_report',
    ],
  },
];

// ─── CHART OF ACCOUNTS ───────────────────────────────────────────────────────
const ACCOUNTS = [
  { code: '1000', name: 'Cash',               nameBn: 'নগদ',              type: 'ASSET',   subType: 'CASH',               isSystem: true  },
  { code: '1010', name: 'Cash in Hand',        nameBn: 'হাতে নগদ',         type: 'ASSET',   subType: 'CASH',               isSystem: false },
  { code: '1020', name: 'Bank Account',        nameBn: 'ব্যাংক একাউন্ট',   type: 'ASSET',   subType: 'BANK',               isSystem: false },
  { code: '1030', name: 'Mobile Banking',      nameBn: 'মোবাইল ব্যাংকিং', type: 'ASSET',   subType: 'BANK',               isSystem: false },
  { code: '1100', name: 'Accounts Receivable', nameBn: 'প্রাপ্য হিসাব',    type: 'ASSET',   subType: 'ACCOUNTS_RECEIVABLE', isSystem: true  },
  { code: '1200', name: 'Inventory',           nameBn: 'মালামাল',           type: 'ASSET',   subType: 'INVENTORY',          isSystem: true  },
  { code: '1300', name: 'Prepaid Expenses',    nameBn: 'অগ্রিম খরচ',       type: 'ASSET',   subType: 'OTHER_ASSET',        isSystem: false },
  { code: '1500', name: 'Fixed Assets',        nameBn: 'স্থায়ী সম্পদ',     type: 'ASSET',   subType: 'FIXED_ASSET',        isSystem: false },
  { code: '2000', name: 'Accounts Payable',    nameBn: 'প্রদেয় হিসাব',    type: 'LIABILITY', subType: 'ACCOUNTS_PAYABLE', isSystem: true  },
  { code: '2100', name: 'Short-term Loans',    nameBn: 'স্বল্পমেয়াদী ঋণ', type: 'LIABILITY', subType: 'SHORT_TERM_LIABILITY', isSystem: false },
  { code: '2200', name: 'Tax Payable',         nameBn: 'প্রদেয় কর',        type: 'LIABILITY', subType: 'SHORT_TERM_LIABILITY', isSystem: false },
  { code: '2500', name: 'Long-term Loans',     nameBn: 'দীর্ঘমেয়াদী ঋণ',  type: 'LIABILITY', subType: 'LONG_TERM_LIABILITY', isSystem: false },
  { code: '3000', name: "Owner's Capital",     nameBn: 'মালিকের মূলধন',    type: 'EQUITY',  subType: 'OWNERS_EQUITY',      isSystem: true  },
  { code: '3100', name: 'Investment Capital',  nameBn: 'বিনিয়োগ মূলধন',   type: 'EQUITY',  subType: 'OWNERS_EQUITY',      isSystem: false },
  { code: '3200', name: 'Retained Earnings',   nameBn: 'সংরক্ষিত আয়',     type: 'EQUITY',  subType: 'RETAINED_EARNINGS',  isSystem: false },
  { code: '4000', name: 'Sales Revenue',       nameBn: 'বিক্রয় আয়',       type: 'REVENUE', subType: 'SALES_REVENUE',      isSystem: true  },
  { code: '4100', name: 'Book Sales',          nameBn: 'বই বিক্রয়',        type: 'REVENUE', subType: 'SALES_REVENUE',      isSystem: false },
  { code: '4200', name: 'Stationery Sales',    nameBn: 'স্টেশনারি বিক্রয়', type: 'REVENUE', subType: 'SALES_REVENUE',      isSystem: false },
  { code: '4900', name: 'Other Income',        nameBn: 'অন্যান্য আয়',      type: 'REVENUE', subType: 'OTHER_REVENUE',      isSystem: false },
  { code: '5000', name: 'Cost of Goods Sold',  nameBn: 'পণ্যের মূল্য',      type: 'EXPENSE', subType: 'COST_OF_GOODS_SOLD', isSystem: true  },
  { code: '5100', name: 'Rent Expense',        nameBn: 'ভাড়া খরচ',         type: 'EXPENSE', subType: 'OPERATING_EXPENSE',  isSystem: false },
  { code: '5200', name: 'Salary Expense',      nameBn: 'বেতন খরচ',          type: 'EXPENSE', subType: 'OPERATING_EXPENSE',  isSystem: false },
  { code: '5300', name: 'Utility Expense',     nameBn: 'ইউটিলিটি খরচ',     type: 'EXPENSE', subType: 'OPERATING_EXPENSE',  isSystem: false },
  { code: '5400', name: 'Transport Expense',   nameBn: 'পরিবহন খরচ',        type: 'EXPENSE', subType: 'OPERATING_EXPENSE',  isSystem: false },
  { code: '5500', name: 'Marketing Expense',   nameBn: 'বিপণন খরচ',         type: 'EXPENSE', subType: 'OPERATING_EXPENSE',  isSystem: false },
  { code: '5900', name: 'Other Expenses',      nameBn: 'অন্যান্য খরচ',      type: 'EXPENSE', subType: 'OTHER_EXPENSE',      isSystem: false },
];

// ─── CATEGORIES (with subcategories) ─────────────────────────────────────────
// parentCode = null → root; parentCode = 'xxx' → child of xxx
const CATEGORIES: Array<{
  code: string; name: string; nameBn: string;
  parentCode?: string; sortOrder?: number;
}> = [
  // ── Root categories ──
  { code: 'BOOKS',          name: 'Books',                  nameBn: 'বই',                     sortOrder: 1 },
  { code: 'STATIONERY',     name: 'Stationery',             nameBn: 'স্টেশনারি',               sortOrder: 2 },
  { code: 'EDU-ACCESSORIES',name: 'Educational Accessories',nameBn: 'শিক্ষামূলক আনুষাঙ্গিক', sortOrder: 3 },
  { code: 'OFFICE-SUPPLIES',name: 'Office Supplies',        nameBn: 'অফিস সামগ্রী',            sortOrder: 4 },
  { code: 'OTHER',          name: 'Other Products',         nameBn: 'অন্যান্য পণ্য',           sortOrder: 5 },

  // ── Books subcategories ──
  { code: 'SCHOOL-BOOKS',   name: 'School Books',    nameBn: 'স্কুলের বই',      parentCode: 'BOOKS', sortOrder: 1 },
  { code: 'MADRASA-BOOKS',  name: 'Madrasa Books',   nameBn: 'মাদ্রাসার বই',    parentCode: 'BOOKS', sortOrder: 2 },
  { code: 'ISLAMIC-BOOKS',  name: 'Islamic Books',   nameBn: 'ইসলামিক বই',      parentCode: 'BOOKS', sortOrder: 3 },
  { code: 'QURAN-HADITH',   name: 'Quran & Hadith',  nameBn: 'কুরআন ও হাদিস',   parentCode: 'BOOKS', sortOrder: 4 },
  { code: 'ARABIC-BOOKS',   name: 'Arabic Books',    nameBn: 'আরবি বই',          parentCode: 'BOOKS', sortOrder: 5 },

  // ── Stationery subcategories ──
  { code: 'PENS-PENCILS',   name: 'Pens & Pencils',  nameBn: 'কলম ও পেন্সিল',  parentCode: 'STATIONERY', sortOrder: 1 },
  { code: 'NOTEBOOKS',      name: 'Notebooks',        nameBn: 'নোটবুক',          parentCode: 'STATIONERY', sortOrder: 2 },
  { code: 'PAPER',          name: 'Paper & A4',       nameBn: 'কাগজ ও A4',        parentCode: 'STATIONERY', sortOrder: 3 },
  { code: 'FILES-FOLDERS',  name: 'Files & Folders',  nameBn: 'ফাইল ও ফোল্ডার', parentCode: 'STATIONERY', sortOrder: 4 },
  { code: 'DRAWING',        name: 'Drawing Supplies', nameBn: 'ড্রইং সামগ্রী',   parentCode: 'STATIONERY', sortOrder: 5 },
];

// ─── BRANDS ──────────────────────────────────────────────────────────────────
const BRANDS = [
  { name: 'Scholar',     nameBn: 'স্কলার',     description: 'Stationery brand' },
  { name: 'Navana',      nameBn: 'নভানা',      description: 'Pen & stationery manufacturer' },
  { name: 'Reynolds',    nameBn: 'রেনল্ডস',    description: 'International pen brand' },
  { name: 'Camlin',      nameBn: 'ক্যামলিন',    description: 'Art & stationery supplies' },
  { name: 'Papyrus',     nameBn: 'প্যাপিরাস',   description: 'Notebook & paper products' },
  { name: 'Laal Neel',   nameBn: 'লাল নীল',     description: 'Bengali book publisher' },
  { name: 'Maktaba',     nameBn: 'মাকতাবা',     description: 'Islamic book publisher' },
  { name: 'NCTB',        nameBn: 'এনসিটিবি',    description: 'National Curriculum & Textbook Board' },
  { name: 'Ananda',      nameBn: 'আনন্দ',       description: 'Book publisher' },
  { name: 'Generic',     nameBn: 'জেনেরিক',     description: 'Unbranded / generic products' },
];

// ─── UNITS ───────────────────────────────────────────────────────────────────
const UNITS = [
  { name: 'Piece',   nameBn: 'পিস',     abbreviation: 'pc',    abbrevBn: 'পি'  },
  { name: 'Dozen',   nameBn: 'ডজন',     abbreviation: 'dz',    abbrevBn: 'ড'   },
  { name: 'Box',     nameBn: 'বাক্স',   abbreviation: 'box',   abbrevBn: 'বা'  },
  { name: 'Pack',    nameBn: 'প্যাক',   abbreviation: 'pk',    abbrevBn: 'প'   },
  { name: 'Ream',    nameBn: 'রিম',     abbreviation: 'rm',    abbrevBn: 'রি'  },
  { name: 'Set',     nameBn: 'সেট',     abbreviation: 'set',   abbrevBn: 'সে'  },
  { name: 'Copy',    nameBn: 'কপি',     abbreviation: 'copy',  abbrevBn: 'কপ'  },
  { name: 'Bundle',  nameBn: 'বান্ডেল', abbreviation: 'bndl',  abbrevBn: 'বান' },
  { name: 'Kilogram',nameBn: 'কিলোগ্রাম',abbreviation: 'kg',  abbrevBn: 'কি'  },
  { name: 'Gram',    nameBn: 'গ্রাম',   abbreviation: 'g',     abbrevBn: 'গ্'  },
  { name: 'Liter',   nameBn: 'লিটার',   abbreviation: 'L',     abbrevBn: 'লি'  },
  { name: 'Meter',   nameBn: 'মিটার',   abbreviation: 'm',     abbrevBn: 'মি'  },
];

// ─── NUMBERING SEQUENCES ──────────────────────────────────────────────────────
const SEQUENCES = [
  { module: 'sale',              prefix: 'INV', separator: '-', padding: 6, currentNo: 0 },
  { module: 'purchase',          prefix: 'PO',  separator: '-', padding: 6, currentNo: 0 },
  { module: 'customer_payment',  prefix: 'REC', separator: '-', padding: 6, currentNo: 0 },
  { module: 'supplier_payment',  prefix: 'PAY', separator: '-', padding: 6, currentNo: 0 },
  { module: 'expense',           prefix: 'EXP', separator: '-', padding: 6, currentNo: 0 },
  { module: 'income',            prefix: 'INC', separator: '-', padding: 6, currentNo: 0 },
  { module: 'journal_entry',     prefix: 'JE',  separator: '-', padding: 6, currentNo: 0 },
  { module: 'stock_adjustment',  prefix: 'ADJ', separator: '-', padding: 6, currentNo: 0 },
  { module: 'stock_count',       prefix: 'SC',  separator: '-', padding: 6, currentNo: 0 },
  { module: 'purchase_return',   prefix: 'PR',  separator: '-', padding: 6, currentNo: 0 },
  { module: 'sale_return',       prefix: 'SR',  separator: '-', padding: 6, currentNo: 0 },
];

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
const SETTINGS = [
  { key: 'business_name',    value: 'Barakah Finance — Library & Stationery', type: 'STRING',  group: 'business', isPublic: true  },
  { key: 'business_name_bn', value: 'বারাকাহ ফাইন্যান্স — লাইব্রেরি ও স্টেশনারি', type: 'STRING', group: 'business', isPublic: true },
  { key: 'business_address', value: 'Dhaka, Bangladesh',  type: 'STRING',  group: 'business', isPublic: true  },
  { key: 'business_phone',   value: '01700000000',         type: 'STRING',  group: 'business', isPublic: true  },
  { key: 'currency',         value: 'BDT',                 type: 'STRING',  group: 'business', isPublic: true  },
  { key: 'currency_symbol',  value: '৳',                   type: 'STRING',  group: 'business', isPublic: true  },
  { key: 'tax_rate',         value: '0',                   type: 'NUMBER',  group: 'tax',      isPublic: true  },
  { key: 'low_stock_alert',  value: 'true',                type: 'BOOLEAN', group: 'inventory',isPublic: false },
  { key: 'default_language', value: 'bn',                  type: 'STRING',  group: 'app',      isPublic: true  },
  { key: 'invoice_footer',   value: 'ধন্যবাদ আমাদের সাথে কেনাকাটা করার জন্য', type: 'STRING', group: 'invoice', isPublic: true },
  { key: 'invoice_footer_en',value: 'Thank you for shopping with us', type: 'STRING', group: 'invoice', isPublic: true },
  { key: 'pos_print_receipt',value: 'true',                type: 'BOOLEAN', group: 'pos',      isPublic: false },
  { key: 'allow_negative_stock', value: 'false',           type: 'BOOLEAN', group: 'inventory',isPublic: false },
];

// ─── EAN-13 helper ────────────────────────────────────────────────────────────
function ean13(seq: number): string {
  const base = `200${String(seq).padStart(9, '0')}`;
  const arr = base.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += i % 2 === 0 ? arr[i] : arr[i] * 3;
  return base + String((10 - (sum % 10)) % 10);
}

// ─── SAMPLE PRODUCTS ──────────────────────────────────────────────────────────
interface SeedProduct {
  sku: string;
  name: string;
  nameBn: string;
  categoryCode: string;
  unit: string;
  brandName?: string;
  costPrice: number;
  sellingPrice: number;
  wholesalePrice?: number;
  mrp?: number;
  minimumStock?: number;
  reorderLevel?: number;
  reorderQty?: number;
  description?: string;
}

const SAMPLE_PRODUCTS: SeedProduct[] = [
  // ── School Books ──
  { sku: 'BOOK-SCH-001', name: 'Class 5 Mathematics',       nameBn: 'পঞ্চম শ্রেণি গণিত',         categoryCode: 'SCHOOL-BOOKS',  unit: 'pc',  brandName: 'NCTB',    costPrice: 80,  sellingPrice: 100, mrp: 110, minimumStock: 5, reorderLevel: 10, reorderQty: 50 },
  { sku: 'BOOK-SCH-002', name: 'Class 6 English Grammar',    nameBn: 'ষষ্ঠ শ্রেণি ইংরেজি ব্যাকরণ',categoryCode: 'SCHOOL-BOOKS',  unit: 'pc',  brandName: 'NCTB',    costPrice: 90,  sellingPrice: 120, mrp: 130, minimumStock: 5, reorderLevel: 10, reorderQty: 50 },
  { sku: 'BOOK-SCH-003', name: 'Class 8 Science',            nameBn: 'অষ্টম শ্রেণি বিজ্ঞান',      categoryCode: 'SCHOOL-BOOKS',  unit: 'pc',  brandName: 'NCTB',    costPrice: 85,  sellingPrice: 110, mrp: 120, minimumStock: 5, reorderLevel: 10, reorderQty: 40 },
  { sku: 'BOOK-SCH-004', name: 'SSC Mathematics',            nameBn: 'এসএসসি গণিত',                categoryCode: 'SCHOOL-BOOKS',  unit: 'pc',  brandName: 'Ananda',  costPrice: 120, sellingPrice: 160, wholesalePrice: 140, mrp: 175, minimumStock: 5, reorderLevel: 8, reorderQty: 30 },

  // ── Madrasa Books ──
  { sku: 'BOOK-MAD-001', name: 'Ilm ul Sarf',               nameBn: 'ইলমুস সরফ',                  categoryCode: 'MADRASA-BOOKS', unit: 'pc',  brandName: 'Maktaba', costPrice: 60,  sellingPrice: 85,  mrp: 90,  minimumStock: 3, reorderLevel: 8, reorderQty: 30 },
  { sku: 'BOOK-MAD-002', name: 'Nahw Mir',                   nameBn: 'নাহু মীর',                   categoryCode: 'MADRASA-BOOKS', unit: 'pc',  brandName: 'Maktaba', costPrice: 55,  sellingPrice: 75,  mrp: 80,  minimumStock: 3, reorderLevel: 8, reorderQty: 30 },
  { sku: 'BOOK-MAD-003', name: 'Mizan ul Sarf',              nameBn: 'মীযানুস সরফ',                categoryCode: 'MADRASA-BOOKS', unit: 'pc',  brandName: 'Maktaba', costPrice: 50,  sellingPrice: 70,  mrp: 75,  minimumStock: 3, reorderLevel: 8, reorderQty: 25 },

  // ── Islamic Books ──
  { sku: 'BOOK-ISL-001', name: 'Riyazus Salihin',            nameBn: 'রিয়াযুস সালেহীন',           categoryCode: 'ISLAMIC-BOOKS', unit: 'pc',  brandName: 'Maktaba', costPrice: 150, sellingPrice: 200, wholesalePrice: 180, mrp: 220, minimumStock: 3, reorderLevel: 6, reorderQty: 20 },
  { sku: 'BOOK-ISL-002', name: 'Fazail e Amaal (Bangla)',    nameBn: 'ফাজায়েলে আমাল (বাংলা)',      categoryCode: 'ISLAMIC-BOOKS', unit: 'pc',  brandName: 'Maktaba', costPrice: 180, sellingPrice: 240, wholesalePrice: 210, mrp: 260, minimumStock: 3, reorderLevel: 6, reorderQty: 20 },

  // ── Quran & Hadith ──
  { sku: 'BOOK-QH-001',  name: 'Al Quran (Large, Tajweed)', nameBn: 'আল কুরআন (বড়, তাজউইদ)',    categoryCode: 'QURAN-HADITH',  unit: 'pc',  brandName: 'Maktaba', costPrice: 200, sellingPrice: 280, wholesalePrice: 250, mrp: 300, minimumStock: 3, reorderLevel: 5, reorderQty: 15 },
  { sku: 'BOOK-QH-002',  name: 'Al Quran (Pocket Size)',    nameBn: 'আল কুরআন (পকেট সাইজ)',      categoryCode: 'QURAN-HADITH',  unit: 'pc',  brandName: 'Maktaba', costPrice: 90,  sellingPrice: 130, wholesalePrice: 115, mrp: 145, minimumStock: 5, reorderLevel: 8, reorderQty: 25 },
  { sku: 'BOOK-QH-003',  name: 'Bukhari Sharif (Full Set)', nameBn: 'বুখারী শরীফ (পূর্ণ সেট)',   categoryCode: 'QURAN-HADITH',  unit: 'set', brandName: 'Maktaba', costPrice: 800, sellingPrice: 1100, wholesalePrice: 950, mrp: 1200, minimumStock: 1, reorderLevel: 2, reorderQty: 5 },

  // ── Arabic Books ──
  { sku: 'BOOK-ARB-001', name: 'Arabic Grammar (Beginners)',nameBn: 'আরবি ব্যাকরণ (প্রাথমিক)',   categoryCode: 'ARABIC-BOOKS',  unit: 'pc',  brandName: 'Maktaba', costPrice: 70,  sellingPrice: 95,  mrp: 100, minimumStock: 3, reorderLevel: 6, reorderQty: 20 },

  // ── Pens & Pencils ──
  { sku: 'STA-PEN-001',  name: 'Ball Pen Blue (Dozen)',     nameBn: 'বল পেন নীল (ডজন)',           categoryCode: 'PENS-PENCILS',  unit: 'dz',  brandName: 'Reynolds', costPrice: 60,  sellingPrice: 80,  wholesalePrice: 72, mrp: 90,  minimumStock: 10, reorderLevel: 20, reorderQty: 100 },
  { sku: 'STA-PEN-002',  name: 'Ball Pen Black (Dozen)',    nameBn: 'বল পেন কালো (ডজন)',           categoryCode: 'PENS-PENCILS',  unit: 'dz',  brandName: 'Reynolds', costPrice: 60,  sellingPrice: 80,  wholesalePrice: 72, mrp: 90,  minimumStock: 10, reorderLevel: 20, reorderQty: 100 },
  { sku: 'STA-PEN-003',  name: 'Gel Pen Blue',              nameBn: 'জেল পেন নীল',                 categoryCode: 'PENS-PENCILS',  unit: 'pc',  brandName: 'Navana',   costPrice: 10,  sellingPrice: 15,  mrp: 18,  minimumStock: 20, reorderLevel: 50, reorderQty: 200 },
  { sku: 'STA-PCL-001',  name: 'Pencil HB (Dozen)',         nameBn: 'পেন্সিল HB (ডজন)',            categoryCode: 'PENS-PENCILS',  unit: 'dz',  brandName: 'Camlin',   costPrice: 40,  sellingPrice: 55,  wholesalePrice: 50, mrp: 60,  minimumStock: 10, reorderLevel: 20, reorderQty: 100 },
  { sku: 'STA-PCL-002',  name: 'Colour Pencil Set 12',      nameBn: 'রঙিন পেন্সিল সেট ১২',        categoryCode: 'PENS-PENCILS',  unit: 'set', brandName: 'Camlin',   costPrice: 55,  sellingPrice: 80,  mrp: 90,  minimumStock: 5,  reorderLevel: 10, reorderQty: 50  },
  { sku: 'STA-MKR-001',  name: 'Whiteboard Marker Black',   nameBn: 'হোয়াইটবোর্ড মার্কার কালো', categoryCode: 'PENS-PENCILS',  unit: 'pc',  brandName: 'Scholar',  costPrice: 20,  sellingPrice: 30,  mrp: 35,  minimumStock: 10, reorderLevel: 20, reorderQty: 80  },

  // ── Notebooks ──
  { sku: 'STA-NB-001',   name: 'Notebook A4 200 pages',     nameBn: 'নোটবুক A4 ২০০ পৃষ্ঠা',       categoryCode: 'NOTEBOOKS',     unit: 'pc',  brandName: 'Papyrus',  costPrice: 55,  sellingPrice: 75,  wholesalePrice: 68, mrp: 80,  minimumStock: 10, reorderLevel: 20, reorderQty: 80  },
  { sku: 'STA-NB-002',   name: 'Exercise Book 100 pages',   nameBn: 'খাতা ১০০ পৃষ্ঠা',             categoryCode: 'NOTEBOOKS',     unit: 'pc',  brandName: 'Papyrus',  costPrice: 30,  sellingPrice: 45,  wholesalePrice: 40, mrp: 50,  minimumStock: 20, reorderLevel: 40, reorderQty: 150 },
  { sku: 'STA-NB-003',   name: 'Spiral Notebook A5',        nameBn: 'স্পাইরাল নোটবুক A5',          categoryCode: 'NOTEBOOKS',     unit: 'pc',  brandName: 'Papyrus',  costPrice: 45,  sellingPrice: 65,  mrp: 70,  minimumStock: 10, reorderLevel: 20, reorderQty: 80  },
  { sku: 'STA-NB-004',   name: 'Drawing Book A4',           nameBn: 'ড্রইং বই A4',                 categoryCode: 'DRAWING',       unit: 'pc',  brandName: 'Camlin',   costPrice: 40,  sellingPrice: 60,  mrp: 65,  minimumStock: 5,  reorderLevel: 10, reorderQty: 40  },

  // ── Paper ──
  { sku: 'STA-PAP-001',  name: 'A4 Paper 80GSM (Ream)',     nameBn: 'A4 কাগজ ৮০জিএসএম (রিম)',     categoryCode: 'PAPER',         unit: 'rm',  brandName: 'Generic',  costPrice: 350, sellingPrice: 450, wholesalePrice: 410, mrp: 480, minimumStock: 5,  reorderLevel: 10, reorderQty: 30  },
  { sku: 'STA-PAP-002',  name: 'A4 Paper 70GSM (Ream)',     nameBn: 'A4 কাগজ ৭০জিএসএম (রিম)',     categoryCode: 'PAPER',         unit: 'rm',  brandName: 'Generic',  costPrice: 300, sellingPrice: 390, wholesalePrice: 360, mrp: 420, minimumStock: 5,  reorderLevel: 10, reorderQty: 30  },

  // ── Files & Folders ──
  { sku: 'STA-FILE-001', name: 'Plastic File Cover',        nameBn: 'প্লাস্টিক ফাইল কভার',        categoryCode: 'FILES-FOLDERS', unit: 'pc',  brandName: 'Scholar',  costPrice: 15,  sellingPrice: 25,  mrp: 30,  minimumStock: 20, reorderLevel: 40, reorderQty: 200 },
  { sku: 'STA-FILE-002', name: 'Box File A4',               nameBn: 'বক্স ফাইল A4',                categoryCode: 'FILES-FOLDERS', unit: 'pc',  brandName: 'Scholar',  costPrice: 80,  sellingPrice: 120, mrp: 130, minimumStock: 5,  reorderLevel: 10, reorderQty: 40  },
  { sku: 'STA-FILE-003', name: 'Ring Binder A4',            nameBn: 'রিং বাইন্ডার A4',              categoryCode: 'FILES-FOLDERS', unit: 'pc',  brandName: 'Scholar',  costPrice: 120, sellingPrice: 170, mrp: 185, minimumStock: 5,  reorderLevel: 8,  reorderQty: 30  },

  // ── Educational Accessories ──
  { sku: 'EDU-RULER-001',name: 'Ruler 30cm',                nameBn: 'স্কেল ৩০ সেমি',               categoryCode: 'EDU-ACCESSORIES',unit: 'pc', brandName: 'Camlin',   costPrice: 10,  sellingPrice: 18,  mrp: 20,  minimumStock: 20, reorderLevel: 40, reorderQty: 200 },
  { sku: 'EDU-COMP-001', name: 'Compass Set',               nameBn: 'কম্পাস সেট',                   categoryCode: 'EDU-ACCESSORIES',unit: 'set',brandName: 'Camlin',   costPrice: 40,  sellingPrice: 65,  mrp: 70,  minimumStock: 5,  reorderLevel: 10, reorderQty: 40  },
  { sku: 'EDU-CALC-001', name: 'Scientific Calculator',     nameBn: 'সায়েন্টিফিক ক্যালকুলেটর',   categoryCode: 'EDU-ACCESSORIES',unit: 'pc', brandName: 'Generic',  costPrice: 180, sellingPrice: 250, wholesalePrice: 225, mrp: 270, minimumStock: 3,  reorderLevel: 5,  reorderQty: 20  },

  // ── Office Supplies ──
  { sku: 'OFF-TAPE-001', name: 'Cello Tape 1 inch',         nameBn: 'সেলো টেপ ১ ইঞ্চি',           categoryCode: 'OFFICE-SUPPLIES',unit: 'pc', brandName: 'Scholar',  costPrice: 18,  sellingPrice: 28,  mrp: 32,  minimumStock: 20, reorderLevel: 40, reorderQty: 150 },
  { sku: 'OFF-STPL-001', name: 'Stapler (Heavy Duty)',       nameBn: 'স্টেপলার (হেভি ডিউটি)',      categoryCode: 'OFFICE-SUPPLIES',unit: 'pc', brandName: 'Scholar',  costPrice: 120, sellingPrice: 175, mrp: 190, minimumStock: 3,  reorderLevel: 5,  reorderQty: 20  },
  { sku: 'OFF-SCSR-001', name: 'Scissors 8 inch',           nameBn: 'কাঁচি ৮ ইঞ্চি',               categoryCode: 'OFFICE-SUPPLIES',unit: 'pc', brandName: 'Generic',  costPrice: 35,  sellingPrice: 55,  mrp: 60,  minimumStock: 5,  reorderLevel: 10, reorderQty: 40  },
];

// ─── Seed sample products ─────────────────────────────────────────────────────
async function seedProducts(
  categoryMap: Record<string, string>,
  unitMap: Record<string, string>,
  brandMap: Record<string, string>,
) {
  let barcodeSeq = 1;

  for (const p of SAMPLE_PRODUCTS) {
    const categoryId = categoryMap[p.categoryCode];
    const unitId = unitMap[p.unit];
    const brandId = p.brandName ? brandMap[p.brandName.toLowerCase()] : undefined;

    if (!categoryId) {
      console.warn(`  ⚠ Category not found: ${p.categoryCode} (skipping ${p.sku})`);
      continue;
    }

    // Generate deterministic barcode from sequence
    const barcode = ean13(barcodeSeq++);

    const existing = await prisma.product.findUnique({ where: { sku: p.sku } });
    if (existing) {
      // Update prices in case they changed — but never touch historical records
      await prisma.product.update({
        where: { sku: p.sku },
        data: {
          costPrice: p.costPrice,
          sellingPrice: p.sellingPrice,
          wholesalePrice: p.wholesalePrice,
          mrp: p.mrp,
          minimumStock: p.minimumStock ?? 0,
          reorderLevel: p.reorderLevel ?? 5,
          reorderQty: p.reorderQty ?? 20,
          brandId: brandId || null,
          unitId: unitId || null,
        },
      });
      continue;
    }

    await prisma.product.create({
      data: {
        sku: p.sku,
        barcode,
        name: p.name,
        nameBn: p.nameBn,
        description: p.description,
        categoryId,
        unitId: unitId || null,
        brandId: brandId || null,
        costPrice: p.costPrice,
        sellingPrice: p.sellingPrice,
        wholesalePrice: p.wholesalePrice,
        mrp: p.mrp,
        minimumStock: p.minimumStock ?? 0,
        reorderLevel: p.reorderLevel ?? 5,
        reorderQty: p.reorderQty ?? 20,
        status: 'ACTIVE',
      },
    });

    // Seed initial price history
    const created = await prisma.product.findUnique({ where: { sku: p.sku } });
    if (created) {
      const exists = await prisma.productPriceHistory.findFirst({ where: { productId: created.id } });
      if (!exists) {
        await prisma.productPriceHistory.create({
          data: {
            productId: created.id,
            costPrice: p.costPrice,
            sellingPrice: p.sellingPrice,
            wholesalePrice: p.wholesalePrice,
            mrp: p.mrp,
            reason: 'Initial price (seed)',
          },
        });
      }
    }
  }
}

// ─── DEMO PURCHASES SEED ─────────────────────────────────────────────────────
async function seedDemoPurchases(
  branchId: string,
  suppliers: any[],
  unitMap: Record<string, string>,
  adminUserId: string,
) {
  // Already seeded guard
  const existing = await prisma.purchase.findFirst();
  if (existing) {
    console.log('  ⏭ Demo purchases already exist, skipping.');
    return;
  }

  // Ensure purchase_return sequence exists
  await prisma.numberingSequence.upsert({
    where: { module: 'purchase_return' },
    update: {},
    create: { module: 'purchase_return', prefix: 'PR', separator: '-', padding: 6, currentNo: 0 },
  });

  const warehouse = await prisma.warehouse.findFirst({ where: { branchId, isDefault: true } });
  if (!warehouse) { console.warn('  ⚠ No warehouse found, skipping demo purchases'); return; }

  const [sup1, sup2, sup3] = suppliers;

  // Look up products
  const prod1 = await prisma.product.findUnique({ where: { sku: 'BOOK-SCH-001' } });
  const prod2 = await prisma.product.findUnique({ where: { sku: 'BOOK-ISL-001' } });
  const prod3 = await prisma.product.findUnique({ where: { sku: 'STA-PEN-001' } });
  const prod4 = await prisma.product.findUnique({ where: { sku: 'STA-NB-002' } });
  const prod5 = await prisma.product.findUnique({ where: { sku: 'BOOK-QH-001' } });

  const pcUnit = unitMap['pc'];
  const dzUnit = unitMap['dz'];

  async function nextPONumber() {
    return prisma.$transaction(async (tx) => {
      const seq = await (tx as any).numberingSequence.findUnique({ where: { module: 'purchase' } });
      const next = seq.currentNo + 1;
      await (tx as any).numberingSequence.update({ where: { module: 'purchase' }, data: { currentNo: next } });
      return `PO-${String(next).padStart(6, '0')}`;
    });
  }
  async function nextPRNumber() {
    return prisma.$transaction(async (tx) => {
      const seq = await (tx as any).numberingSequence.findUnique({ where: { module: 'purchase_return' } });
      const next = seq.currentNo + 1;
      await (tx as any).numberingSequence.update({ where: { module: 'purchase_return' }, data: { currentNo: next } });
      return `PR-${String(next).padStart(6, '0')}`;
    });
  }
  async function nextPAYNumber() {
    return prisma.$transaction(async (tx) => {
      const seq = await (tx as any).numberingSequence.findUnique({ where: { module: 'supplier_payment' } });
      const next = seq.currentNo + 1;
      await (tx as any).numberingSequence.update({ where: { module: 'supplier_payment' }, data: { currentNo: next } });
      return `PAY-${String(next).padStart(6, '0')}`;
    });
  }
  async function nextJENumber() {
    return prisma.$transaction(async (tx) => {
      const seq = await (tx as any).numberingSequence.findUnique({ where: { module: 'journal_entry' } });
      const next = seq.currentNo + 1;
      await (tx as any).numberingSequence.update({ where: { module: 'journal_entry' }, data: { currentNo: next } });
      return `JE-${String(next).padStart(6, '0')}`;
    });
  }

  const invAcc  = await prisma.account.findFirst({ where: { subType: 'INVENTORY', isSystem: true } });
  const cashAcc = await prisma.account.findFirst({ where: { subType: 'CASH', isSystem: true } });
  const apAcc   = await prisma.account.findFirst({ where: { subType: 'ACCOUNTS_PAYABLE', isSystem: true } });

  // ── Purchase 1: Fully paid (Cash) ────────────────────────────────────────
  if (prod1 && prod2) {
    const invoiceNumber = await nextPONumber();
    const p1 = await prisma.purchase.create({
      data: {
        branchId, supplierId: sup1.id, invoiceNumber,
        referenceNo: 'BOI-REF-001',
        purchaseDate: new Date(Date.now() - 7 * 86400000), // 7 days ago
        status: 'RECEIVED', paymentStatus: 'PAID',
        subtotal: '8000.00', discountAmount: '0.00', taxAmount: '0.00',
        shippingCost: '200.00', otherCost: '0.00',
        totalAmount: '8200.00', paidAmount: '8200.00', dueAmount: '0.00',
        notes: 'School books stock-up',
        createdBy: adminUserId,
        items: {
          create: [
            {
              productId: prod1.id, unitId: pcUnit,
              quantity: '50', receivedQty: '50', unitCost: '80.0000',
              discountRate: '0.00', discountAmount: '0.0000',
              taxRate: '0.00', taxAmount: '0.0000', totalAmount: '4000.0000',
            },
            {
              productId: prod2.id, unitId: pcUnit,
              quantity: '50', receivedQty: '50', unitCost: '80.0000',
              discountRate: '0.00', discountAmount: '0.0000',
              taxRate: '0.00', taxAmount: '0.0000', totalAmount: '4000.0000',
            },
          ],
        },
      },
    });

    // Stock movements
    for (const [prodId, qty] of [[prod1.id, 50], [prod2.id, 50]] as [string, number][]) {
      const ps = await prisma.productStock.findUnique({
        where: { productId_warehouseId: { productId: prodId, warehouseId: warehouse.id } },
      });
      if (!ps) {
        await prisma.productStock.create({ data: { productId: prodId, warehouseId: warehouse.id, quantity: 0 } });
      }
      await prisma.stockMovement.create({
        data: {
          productId: prodId, warehouseId: warehouse.id,
          type: 'PURCHASE', quantity: qty.toString(),
          unitCost: '80.0000', totalCost: (qty * 80).toString(),
          balanceBefore: '0.0000', balanceAfter: qty.toString(),
          purchaseId: p1.id, referenceType: 'purchase', referenceId: p1.id,
          notes: `Purchase ${invoiceNumber}`, createdBy: adminUserId,
        },
      });
      await prisma.productStock.upsert({
        where: { productId_warehouseId: { productId: prodId, warehouseId: warehouse.id } },
        update: { quantity: { increment: qty } },
        create: { productId: prodId, warehouseId: warehouse.id, quantity: qty },
      });
    }

    // Payment record
    const payNum = await nextPAYNumber();
    await prisma.supplierPayment.create({
      data: {
        supplierId: sup1.id, purchaseId: p1.id,
        paymentNumber: payNum, paymentDate: new Date(Date.now() - 7 * 86400000),
        amount: '8200.00', method: 'CASH', createdBy: adminUserId,
      },
    });

    // Journal: Dr Inventory / Cr Cash
    if (invAcc && cashAcc) {
      const jeNum = await nextJENumber();
      await prisma.journalEntry.create({
        data: {
          entryNumber: jeNum,
          entryDate: new Date(Date.now() - 7 * 86400000),
          type: 'PURCHASE', status: 'POSTED',
          description: `Purchase - ${invoiceNumber}`,
          totalDebit: '8200.00', totalCredit: '8200.00',
          purchaseId: p1.id, createdBy: adminUserId,
          lines: {
            create: [
              { debitAccountId: invAcc.id, amount: '8200.00', description: `Inventory - ${invoiceNumber}` },
              { creditAccountId: cashAcc.id, amount: '8200.00', description: `Cash paid - ${invoiceNumber}` },
            ],
          },
        },
      });
      await prisma.account.update({ where: { id: invAcc.id }, data: { currentBalance: { increment: 8200 } } });
      await prisma.account.update({ where: { id: cashAcc.id }, data: { currentBalance: { decrement: 8200 } } });
    }
  }

  // ── Purchase 2: Partially paid (bKash + Cash) — has DUE ──────────────────
  if (prod3 && prod4) {
    const invoiceNumber = await nextPONumber();
    const p2 = await prisma.purchase.create({
      data: {
        branchId, supplierId: sup3.id, invoiceNumber,
        purchaseDate: new Date(Date.now() - 3 * 86400000),
        dueDate: new Date(Date.now() + 10 * 86400000),
        status: 'RECEIVED', paymentStatus: 'PARTIAL',
        subtotal: '4400.00', discountAmount: '0.00', taxAmount: '0.00',
        shippingCost: '0.00', otherCost: '0.00',
        totalAmount: '4400.00', paidAmount: '2000.00', dueAmount: '2400.00',
        notes: 'Stationery restock',
        createdBy: adminUserId,
        items: {
          create: [
            {
              productId: prod3.id, unitId: dzUnit,
              quantity: '20', receivedQty: '20', unitCost: '60.0000',
              discountRate: '0.00', discountAmount: '0.0000',
              taxRate: '0.00', taxAmount: '0.0000', totalAmount: '1200.0000',
            },
            {
              productId: prod4.id, unitId: pcUnit,
              quantity: '50', receivedQty: '50', unitCost: '30.0000',
              discountRate: '0.00', discountAmount: '0.0000',
              taxRate: '0.00', taxAmount: '0.0000', totalAmount: '1500.0000',
            },
            {
              productId: prod3.id, unitId: dzUnit,
              quantity: '20', receivedQty: '20', unitCost: '60.0000',
              discountRate: '0.00', discountAmount: '0.0000',
              taxRate: '0.00', taxAmount: '0.0000', totalAmount: '1200.0000',
            },
            {
              productId: prod4.id, unitId: pcUnit,
              quantity: '25', receivedQty: '25', unitCost: '20.0000',
              discountRate: '0.00', discountAmount: '0.0000',
              taxRate: '0.00', taxAmount: '0.0000', totalAmount: '500.0000',
            },
          ],
        },
      },
    });

    // Stock movements
    for (const [prodId, qty, cost] of [[prod3.id, 40, 60], [prod4.id, 75, 28]] as [string, number, number][]) {
      await prisma.stockMovement.create({
        data: {
          productId: prodId, warehouseId: warehouse.id,
          type: 'PURCHASE', quantity: qty.toString(),
          unitCost: cost.toString(), totalCost: (qty * cost).toString(),
          balanceBefore: '0.0000', balanceAfter: qty.toString(),
          purchaseId: p2.id, referenceType: 'purchase', referenceId: p2.id,
          createdBy: adminUserId,
        },
      });
      await prisma.productStock.upsert({
        where: { productId_warehouseId: { productId: prodId, warehouseId: warehouse.id } },
        update: { quantity: { increment: qty } },
        create: { productId: prodId, warehouseId: warehouse.id, quantity: qty },
      });
    }

    // Payments: Cash 1000 + bKash 1000
    const payNum1 = await nextPAYNumber();
    await prisma.supplierPayment.create({
      data: {
        supplierId: sup3.id, purchaseId: p2.id,
        paymentNumber: payNum1, paymentDate: new Date(Date.now() - 3 * 86400000),
        amount: '1000.00', method: 'CASH', createdBy: adminUserId,
      },
    });
    const payNum2 = await nextPAYNumber();
    await prisma.supplierPayment.create({
      data: {
        supplierId: sup3.id, purchaseId: p2.id,
        paymentNumber: payNum2, paymentDate: new Date(Date.now() - 3 * 86400000),
        amount: '1000.00', method: 'MOBILE_BANKING', referenceNo: 'bKash-01711111111',
        notes: 'bKash payment', createdBy: adminUserId,
      },
    });

    // Update supplier balance (due)
    await prisma.supplier.update({ where: { id: sup3.id }, data: { currentBalance: { increment: 2400 } } });

    // Journal: Dr Inventory / Cr Cash 2000 / Cr AP 2400
    if (invAcc && cashAcc && apAcc) {
      const jeNum = await nextJENumber();
      await prisma.journalEntry.create({
        data: {
          entryNumber: jeNum, entryDate: new Date(Date.now() - 3 * 86400000),
          type: 'PURCHASE', status: 'POSTED',
          description: `Purchase - ${invoiceNumber}`,
          totalDebit: '4400.00', totalCredit: '4400.00',
          purchaseId: p2.id, createdBy: adminUserId,
          lines: {
            create: [
              { debitAccountId: invAcc.id, amount: '4400.00', description: `Inventory - ${invoiceNumber}` },
              { creditAccountId: cashAcc.id, amount: '2000.00', description: `Cash paid - ${invoiceNumber}` },
              { creditAccountId: apAcc.id, amount: '2400.00', description: `AP due - ${invoiceNumber}` },
            ],
          },
        },
      });
      await prisma.account.update({ where: { id: invAcc.id }, data: { currentBalance: { increment: 4400 } } });
      await prisma.account.update({ where: { id: cashAcc.id }, data: { currentBalance: { decrement: 2000 } } });
      await prisma.account.update({ where: { id: apAcc.id }, data: { currentBalance: { increment: 2400 } } });
    }

    // ── Purchase Return on Purchase 2 (10 notebook exercise books) ──────────
    if (prod4) {
      const p2Items = await prisma.purchaseItem.findMany({ where: { purchaseId: p2.id, productId: prod4.id } });
      if (p2Items.length > 0) {
        const retItem = p2Items[0];
        const returnNumber = await nextPRNumber();
        const retTotal = 10 * 30;

        const pr = await prisma.purchaseReturn.create({
          data: {
            purchaseId: p2.id, supplierId: sup3.id,
            returnNumber, returnDate: new Date(Date.now() - 1 * 86400000),
            reason: 'Damaged notebooks — 10 units',
            subtotal: retTotal.toFixed(2), taxAmount: '0.00', totalAmount: retTotal.toFixed(2),
            refundMethod: 'CREDIT', status: 'CONFIRMED', createdBy: adminUserId,
            items: {
              create: [{
                purchaseItemId: retItem.id, productId: prod4.id, unitId: pcUnit,
                quantity: '10', unitCost: '30.0000',
                taxRate: '0.00', taxAmount: '0.0000',
                totalAmount: retTotal.toFixed(4),
                reason: 'Damaged on delivery',
              }],
            },
          },
        });

        // Update returnedQty on purchase item
        await prisma.purchaseItem.update({
          where: { id: retItem.id },
          data: { returnedQty: { increment: 10 } },
        });

        // Decrease stock
        await prisma.stockMovement.create({
          data: {
            productId: prod4.id, warehouseId: warehouse.id,
            type: 'PURCHASE_RETURN', quantity: '10',
            unitCost: '30.0000', totalCost: retTotal.toString(),
            balanceBefore: '75.0000', balanceAfter: '65.0000',
            purchaseId: p2.id, referenceType: 'purchase_return', referenceId: pr.id,
            notes: `Purchase return ${returnNumber}`, createdBy: adminUserId,
          },
        });
        await prisma.productStock.update({
          where: { productId_warehouseId: { productId: prod4.id, warehouseId: warehouse.id } },
          data: { quantity: { decrement: 10 } },
        });

        // Reduce supplier payable
        await prisma.supplier.update({ where: { id: sup3.id }, data: { currentBalance: { decrement: retTotal } } });

        // Journal: Dr AP / Cr Inventory (CREDIT refund method)
        if (invAcc && apAcc) {
          const jeNum = await nextJENumber();
          await prisma.journalEntry.create({
            data: {
              entryNumber: jeNum, entryDate: new Date(Date.now() - 1 * 86400000),
              type: 'RETURN', status: 'POSTED',
              description: `Purchase return - ${returnNumber}`,
              totalDebit: retTotal.toFixed(2), totalCredit: retTotal.toFixed(2),
              purchaseId: p2.id, purchaseReturnId: pr.id, createdBy: adminUserId,
              lines: {
                create: [
                  { debitAccountId: apAcc.id, amount: retTotal.toFixed(2), description: `Reduce AP - ${returnNumber}` },
                  { creditAccountId: invAcc.id, amount: retTotal.toFixed(2), description: `Reduce inventory - ${returnNumber}` },
                ],
              },
            },
          });
          await prisma.account.update({ where: { id: apAcc.id }, data: { currentBalance: { decrement: retTotal } } });
          await prisma.account.update({ where: { id: invAcc.id }, data: { currentBalance: { decrement: retTotal } } });
        }
      }
    }
  }

  // ── Purchase 3: Draft (not yet received) ─────────────────────────────────
  if (prod5) {
    const invoiceNumber = await nextPONumber();
    await prisma.purchase.create({
      data: {
        branchId, supplierId: sup2.id, invoiceNumber,
        purchaseDate: new Date(),
        dueDate: new Date(Date.now() + 7 * 86400000),
        status: 'DRAFT', paymentStatus: 'PENDING',
        subtotal: '3000.00', discountAmount: '0.00', taxAmount: '0.00',
        shippingCost: '0.00', otherCost: '0.00',
        totalAmount: '3000.00', paidAmount: '0.00', dueAmount: '3000.00',
        notes: 'Quran restock order — pending delivery',
        createdBy: adminUserId,
        items: {
          create: [{
            productId: prod5.id, unitId: pcUnit,
            quantity: '15', receivedQty: '0', unitCost: '200.0000',
            discountRate: '0.00', discountAmount: '0.0000',
            taxRate: '0.00', taxAmount: '0.0000', totalAmount: '3000.0000',
          }],
        },
      },
    });
  }

  console.log('  ✅ Demo purchases, payments and returns seeded.');
}

// ─── OPENING CAPITAL ─────────────────────────────────────────────────────────
async function seedOpeningCapital() {
  // Idempotent guard
  const existing = await prisma.journalEntry.findFirst({ where: { type: 'OPENING_BALANCE' } });
  if (existing) { console.log('  ⏭ Opening capital already seeded.'); return; }

  // ── Amounts from env (with defaults) ──
  const amountCash  = Number(process.env.OPENING_CAPITAL_CASH  ?? 50000);
  const amountBank  = Number(process.env.OPENING_CAPITAL_BANK  ?? 20000);
  const amountBkash = Number(process.env.OPENING_CAPITAL_BKASH ?? 10000);
  const amountNagad = Number(process.env.OPENING_CAPITAL_NAGAD ?? 5000);

  const cash  = await prisma.account.findUnique({ where: { code: '1010' } });
  const bank  = await prisma.account.findUnique({ where: { code: '1020' } });
  const bkash = await prisma.account.findUnique({ where: { code: '1021' } });
  const nagad = await prisma.account.findUnique({ where: { code: '1022' } });
  const cap   = await prisma.account.findUnique({ where: { code: '3000' } });

  if (!cash || !bank || !cap) throw new Error('Accounts 1010/1020/3000 not found');

  const lines = [
    { acc: cash,  amount: amountCash,  label: 'Cash in Hand'  },
    { acc: bank,  amount: amountBank,  label: 'Bank Account'  },
    ...(bkash && amountBkash > 0 ? [{ acc: bkash, amount: amountBkash, label: 'bKash Account' }] : []),
    ...(nagad && amountNagad > 0 ? [{ acc: nagad, amount: amountNagad, label: 'Nagad Account' }] : []),
  ].filter(l => l.amount > 0);

  const total = lines.reduce((s, l) => s + l.amount, 0);

  const seq    = await prisma.numberingSequence.findUnique({ where: { module: 'journal_entry' } });
  const nextNo = (seq?.currentNo ?? 0) + 1;
  const jeNum  = `JE-${String(nextNo).padStart(6, '0')}`;

  await prisma.$transaction(async (tx) => {
    await (tx as any).journalEntry.create({
      data: {
        entryNumber: jeNum,
        entryDate:   new Date('2026-09-01'),
        type: 'OPENING_BALANCE', status: 'POSTED',
        description: 'Opening capital — business commencement',
        totalDebit:  total.toFixed(2), totalCredit: total.toFixed(2),
        lines: {
          create: [
            ...lines.map(l => ({
              debitAccountId: l.acc!.id,
              amount: l.amount.toFixed(2),
              description: `Opening balance — ${l.label}`,
            })),
            { creditAccountId: cap.id, amount: total.toFixed(2), description: 'Opening capital injection' },
          ],
        },
      },
    });
    for (const l of lines) {
      await (tx as any).account.update({ where: { id: l.acc!.id }, data: { currentBalance: { increment: l.amount } } });
    }
    await (tx as any).account.update({ where: { id: cap.id }, data: { currentBalance: { increment: total } } });
    await (tx as any).numberingSequence.update({ where: { module: 'journal_entry' }, data: { currentNo: nextNo } });
  });

  console.log(`  ✅ Opening capital ${jeNum}: Dr Cash/Bank ৳${total.toLocaleString()} / Cr Capital`);
  console.log(`     Cash=${amountCash}, Bank=${amountBank}, bKash=${amountBkash}, Nagad=${amountNagad}`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🌱 Starting database seed v2...');

  // 1. Permissions
  console.log('  → Permissions...');
  await prisma.permission.createMany({ data: PERMISSIONS, skipDuplicates: true });
  const allPerms = await prisma.permission.findMany();
  const permMap = Object.fromEntries(allPerms.map((p) => [`${p.module}:${p.action}:${p.resource}`, p.id]));

  // 2. Roles
  console.log('  → Roles...');
  for (const roleData of ROLES) {
    const role = await prisma.role.upsert({
      where: { name: roleData.name },
      update: {},
      create: { name: roleData.name, nameBn: roleData.nameBn, description: roleData.description, isSystem: roleData.isSystem },
    });
    const permIds = (roleData as any).allPermissions
      ? Object.values(permMap)
      : ((roleData as any).permissions || []).map((p: string) => permMap[p]).filter(Boolean);
    for (const permissionId of permIds) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }
  }

  // 3. Main Branch & Warehouse
  console.log('  → Branch & Warehouse...');
  const branch = await prisma.branch.upsert({
    where: { code: 'MAIN' },
    update: {},
    create: { code: 'MAIN', name: 'Main Branch', nameBn: 'প্রধান শাখা', address: 'Dhaka, Bangladesh', phone: '01700000000', isMain: true, status: 'ACTIVE' },
  });
  await prisma.warehouse.upsert({
    where: { code: 'WH-MAIN' },
    update: {},
    create: { branchId: branch.id, code: 'WH-MAIN', name: 'Main Warehouse', nameBn: 'প্রধান গুদাম', isDefault: true, isActive: true },
  });

  // 4. Super Admin User
  console.log('  → Super Admin user...');
  const adminUsername = process.env.SEED_ADMIN_USERNAME || 'admin';
  const adminEmail    = process.env.SEED_ADMIN_EMAIL    || 'admin@barakahfinance.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@123456';
  const adminPhone    = process.env.SEED_ADMIN_PHONE    || '01700000000';
  const passwordHash  = await bcrypt.hash(adminPassword, 12);
  const superAdminRole = await prisma.role.findUnique({ where: { name: 'SUPER_ADMIN' } });

  const adminUser = await prisma.user.upsert({
    where: { username: adminUsername },
    update: {},
    create: {
      username: adminUsername, email: adminEmail, phone: adminPhone,
      passwordHash, firstName: 'Super', lastName: 'Admin',
      firstNameBn: 'সুপার', lastNameBn: 'অ্যাডমিন',
      status: 'ACTIVE', branchId: branch.id,
    },
  });
  if (superAdminRole) {
    await prisma.userRole.upsert({
      where: { userId_roleId_branchId: { userId: adminUser.id, roleId: superAdminRole.id, branchId: branch.id } },
      update: {},
      create: { userId: adminUser.id, roleId: superAdminRole.id, branchId: branch.id },
    });
  }

  // 5. Chart of Accounts
  console.log('  → Chart of Accounts...');
  for (const acc of ACCOUNTS) {
    await prisma.account.upsert({ where: { code: acc.code }, update: {}, create: acc as any });
  }

  // 6. Categories (hierarchical — roots first, then children)
  console.log('  → Categories (hierarchical)...');
  const categoryMap: Record<string, string> = {};

  // Pass 1: root categories (no parentCode)
  for (const cat of CATEGORIES.filter((c) => !c.parentCode)) {
    const c = await prisma.category.upsert({
      where: { code: cat.code },
      update: { name: cat.name, nameBn: cat.nameBn, sortOrder: cat.sortOrder ?? 0 },
      create: { code: cat.code, name: cat.name, nameBn: cat.nameBn, sortOrder: cat.sortOrder ?? 0, isActive: true },
    });
    categoryMap[cat.code] = c.id;
  }

  // Pass 2: children
  for (const cat of CATEGORIES.filter((c) => c.parentCode)) {
    const parentId = categoryMap[cat.parentCode!];
    if (!parentId) { console.warn(`  ⚠ Parent not found for ${cat.code}`); continue; }
    const c = await prisma.category.upsert({
      where: { code: cat.code },
      update: { name: cat.name, nameBn: cat.nameBn, sortOrder: cat.sortOrder ?? 0, parentId },
      create: { code: cat.code, name: cat.name, nameBn: cat.nameBn, parentId, sortOrder: cat.sortOrder ?? 0, isActive: true },
    });
    categoryMap[cat.code] = c.id;
  }

  // 7. Brands
  console.log('  → Brands...');
  const brandMap: Record<string, string> = {};
  for (const brand of BRANDS) {
    const b = await prisma.brand.upsert({
      where: { name: brand.name },
      update: {},
      create: { name: brand.name, nameBn: brand.nameBn, description: brand.description, isActive: true },
    });
    brandMap[brand.name.toLowerCase()] = b.id;
  }

  // 8. Units
  console.log('  → Units...');
  const unitMap: Record<string, string> = {};
  for (const unit of UNITS) {
    const u = await prisma.unit.upsert({
      where: { abbreviation: unit.abbreviation },
      update: {},
      create: { ...unit, isActive: true },
    });
    unitMap[unit.abbreviation] = u.id;
  }

  // 9. Numbering Sequences
  console.log('  → Numbering sequences...');
  for (const seq of SEQUENCES) {
    await prisma.numberingSequence.upsert({ where: { module: seq.module }, update: {}, create: seq });
  }

  // 10. Settings
  console.log('  → Settings...');
  for (const s of SETTINGS) {
    await prisma.setting.upsert({ where: { key: s.key }, update: {}, create: s as any });
  }

  // 11. Expense Categories
  console.log('  → Expense categories...');
  const expCats = [
    { name: 'Rent', nameBn: 'ভাড়া' },
    { name: 'Salary & Wages', nameBn: 'বেতন ও মজুরি' },
    { name: 'Electricity', nameBn: 'বিদ্যুৎ বিল' },
    { name: 'Internet & Phone', nameBn: 'ইন্টারনেট ও ফোন' },
    { name: 'Transport', nameBn: 'পরিবহন' },
    { name: 'Marketing', nameBn: 'বিপণন' },
    { name: 'Maintenance', nameBn: 'রক্ষণাবেক্ষণ' },
    { name: 'Other', nameBn: 'অন্যান্য' },
  ];
  for (const ec of expCats) {
    await prisma.expenseCategory.create({ data: ec }).catch(() => {});
  }

  // 12. Sample Products
  console.log(`  → Sample products (${SAMPLE_PRODUCTS.length} items)...`);
  await seedProducts(categoryMap, unitMap, brandMap);

  // 13. Demo Suppliers & Customers
  console.log('  → Demo suppliers & customers...');
  const sup1 = await prisma.supplier.upsert({
    where: { code: 'SUP-00001' },
    update: {},
    create: {
      code: 'SUP-00001', name: 'Boi Ghar Publishers', nameBn: 'বই ঘর পাবলিশার্স',
      company: 'Boi Ghar Ltd.', phone: '01711111111', email: 'boi@boighar.com',
      address: '12 Purana Paltan, Dhaka', city: 'Dhaka',
      creditLimit: 100000, creditDays: 30, openingBalance: 0, currentBalance: 0,
      notes: 'Main book supplier', isActive: true,
    },
  });
  const sup2 = await prisma.supplier.upsert({
    where: { code: 'SUP-00002' },
    update: {},
    create: {
      code: 'SUP-00002', name: 'Maktaba Al Islamia', nameBn: 'মাকতাবা আল ইসলামিয়া',
      company: 'Maktaba Islamia Publishers', phone: '01722222222',
      address: '5 Lalbagh Road, Dhaka', city: 'Dhaka',
      creditLimit: 50000, creditDays: 15, openingBalance: 0, currentBalance: 0,
      notes: 'Islamic book supplier', isActive: true,
    },
  });
  const sup3 = await prisma.supplier.upsert({
    where: { code: 'SUP-00003' },
    update: {},
    create: {
      code: 'SUP-00003', name: 'Scholar Stationery Depot', nameBn: 'স্কলার স্টেশনারি ডিপো',
      company: 'Scholar Industries Ltd.', phone: '01733333333',
      address: '88 Banani C/A, Dhaka', city: 'Dhaka',
      creditLimit: 80000, creditDays: 20, openingBalance: 5000, currentBalance: 5000,
      notes: 'Stationery & office supplies', isActive: true,
    },
  });
  await prisma.customer.upsert({
    where: { code: 'CUS-00001' },
    update: {},
    create: { code: 'CUS-00001', name: 'Walk-in Customer', nameBn: 'সাধারণ গ্রাহক', phone: '00000000000', currentBalance: 0 },
  });
  await prisma.customer.upsert({
    where: { code: 'CUS-00002' },
    update: {},
    create: { code: 'CUS-00002', name: 'Madrasa Al Amin', nameBn: 'মাদ্রাসা আল আমিন', phone: '01744444444', city: 'Dhaka', creditLimit: 20000, creditDays: 30, currentBalance: 0 },
  });

  // 14. Demo Purchases, Payments & Returns
  console.log('  → Demo purchases...');
  await seedDemoPurchases(branch.id, [sup1, sup2, sup3], unitMap, adminUser.id);

  // 15. Opening Capital — inject business starting funds
  console.log('  → Opening capital journal entry...');
  await seedOpeningCapital();

  console.log(`
✅ Seed v2 complete!
   Admin   : ${adminUsername} / ${adminPassword}
   Products: ${SAMPLE_PRODUCTS.length} seeded
   Brands  : ${BRANDS.length} seeded
   Cats    : ${CATEGORIES.length} (${CATEGORIES.filter(c => !c.parentCode).length} root + ${CATEGORIES.filter(c => c.parentCode).length} sub)
   Units   : ${UNITS.length} seeded
   Suppliers: 3 demo suppliers seeded
   Capital : ৳85,000 opening capital injected
  `);
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
