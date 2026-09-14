/**
 * Barakah Finance POS — Database Seed
 * Seeds: roles, permissions, admin user, accounts chart, branches,
 *        warehouse, categories, units, sample products, numbering sequences, settings
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ─── PERMISSIONS ────────────────────────────────────────────────────
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

// ─── ROLES ────────────────────────────────────────────────────────────
const ROLES = [
  {
    name: 'SUPER_ADMIN',
    nameBn: 'সুপার অ্যাডমিন',
    description: 'Full system access',
    isSystem: true,
    allPermissions: true,
  },
  {
    name: 'OWNER',
    nameBn: 'মালিক',
    description: 'Business owner — full access',
    isSystem: true,
    allPermissions: true,
  },
  {
    name: 'MANAGER',
    nameBn: 'ম্যানেজার',
    description: 'Branch manager',
    isSystem: true,
    permissions: [
      'users:read:users', 'products:create:products', 'products:read:products',
      'products:update:products', 'categories:create:categories', 'categories:read:categories',
      'categories:update:categories', 'sales:create:sales', 'sales:read:sales',
      'sales:void:sales', 'purchases:create:purchases', 'purchases:read:purchases',
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
    name: 'CASHIER',
    nameBn: 'ক্যাশিয়ার',
    description: 'POS cashier',
    isSystem: true,
    permissions: [
      'products:read:products', 'sales:create:sales', 'sales:read:sales',
      'customers:create:customers', 'customers:read:customers',
      'cash:open:register', 'cash:close:register', 'cash:read:register',
    ],
  },
  {
    name: 'INVENTORY_STAFF',
    nameBn: 'ইনভেন্টরি স্টাফ',
    description: 'Manages stock',
    isSystem: true,
    permissions: [
      'products:read:products', 'products:create:products', 'products:update:products',
      'purchases:create:purchases', 'purchases:read:purchases',
      'inventory:read:inventory', 'inventory:adjust:inventory', 'inventory:transfer:inventory',
      'suppliers:read:suppliers', 'suppliers:create:suppliers',
    ],
  },
  {
    name: 'ACCOUNTANT',
    nameBn: 'হিসাবরক্ষক',
    description: 'Financial operations',
    isSystem: true,
    permissions: [
      'accounting:read:accounting', 'accounting:create:journal', 'accounting:void:journal',
      'expenses:create:expenses', 'expenses:read:expenses', 'expenses:approve:expenses',
      'reports:read:financial_report', 'reports:read:sales_report',
      'reports:read:purchase_report', 'investments:read:investments',
      'sales:read:sales', 'purchases:read:purchases',
    ],
  },
  {
    name: 'VIEWER',
    nameBn: 'ভিউয়ার',
    description: 'Read-only access',
    isSystem: true,
    permissions: [
      'products:read:products', 'sales:read:sales', 'purchases:read:purchases',
      'suppliers:read:suppliers', 'customers:read:customers', 'inventory:read:inventory',
      'reports:read:sales_report', 'reports:read:inventory_report',
    ],
  },
];

// ─── CHART OF ACCOUNTS ────────────────────────────────────────────────
const ACCOUNTS = [
  // Assets
  { code: '1000', name: 'Cash', nameBn: 'নগদ', type: 'ASSET', subType: 'CASH', isSystem: true },
  { code: '1010', name: 'Cash in Hand', nameBn: 'হাতে নগদ', type: 'ASSET', subType: 'CASH', isSystem: false },
  { code: '1020', name: 'Bank Account', nameBn: 'ব্যাংক একাউন্ট', type: 'ASSET', subType: 'BANK', isSystem: false },
  { code: '1030', name: 'Mobile Banking', nameBn: 'মোবাইল ব্যাংকিং', type: 'ASSET', subType: 'BANK', isSystem: false },
  { code: '1100', name: 'Accounts Receivable', nameBn: 'প্রাপ্য হিসাব', type: 'ASSET', subType: 'ACCOUNTS_RECEIVABLE', isSystem: true },
  { code: '1200', name: 'Inventory', nameBn: 'মালামাল', type: 'ASSET', subType: 'INVENTORY', isSystem: true },
  { code: '1300', name: 'Prepaid Expenses', nameBn: 'অগ্রিম খরচ', type: 'ASSET', subType: 'OTHER_ASSET', isSystem: false },
  { code: '1500', name: 'Fixed Assets', nameBn: 'স্থায়ী সম্পদ', type: 'ASSET', subType: 'FIXED_ASSET', isSystem: false },
  // Liabilities
  { code: '2000', name: 'Accounts Payable', nameBn: 'প্রদেয় হিসাব', type: 'LIABILITY', subType: 'ACCOUNTS_PAYABLE', isSystem: true },
  { code: '2100', name: 'Short-term Loans', nameBn: 'স্বল্পমেয়াদী ঋণ', type: 'LIABILITY', subType: 'SHORT_TERM_LIABILITY', isSystem: false },
  { code: '2200', name: 'Tax Payable', nameBn: 'প্রদেয় কর', type: 'LIABILITY', subType: 'SHORT_TERM_LIABILITY', isSystem: false },
  { code: '2500', name: 'Long-term Loans', nameBn: 'দীর্ঘমেয়াদী ঋণ', type: 'LIABILITY', subType: 'LONG_TERM_LIABILITY', isSystem: false },
  // Equity
  { code: '3000', name: "Owner's Capital", nameBn: 'মালিকের মূলধন', type: 'EQUITY', subType: 'OWNERS_EQUITY', isSystem: true },
  { code: '3100', name: 'Investment Capital', nameBn: 'বিনিয়োগ মূলধন', type: 'EQUITY', subType: 'OWNERS_EQUITY', isSystem: false },
  { code: '3200', name: 'Retained Earnings', nameBn: 'সংরক্ষিত আয়', type: 'EQUITY', subType: 'RETAINED_EARNINGS', isSystem: false },
  // Revenue
  { code: '4000', name: 'Sales Revenue', nameBn: 'বিক্রয় আয়', type: 'REVENUE', subType: 'SALES_REVENUE', isSystem: true },
  { code: '4100', name: 'Book Sales', nameBn: 'বই বিক্রয়', type: 'REVENUE', subType: 'SALES_REVENUE', isSystem: false },
  { code: '4200', name: 'Stationery Sales', nameBn: 'স্টেশনারি বিক্রয়', type: 'REVENUE', subType: 'SALES_REVENUE', isSystem: false },
  { code: '4900', name: 'Other Income', nameBn: 'অন্যান্য আয়', type: 'REVENUE', subType: 'OTHER_REVENUE', isSystem: false },
  // Expenses
  { code: '5000', name: 'Cost of Goods Sold', nameBn: 'পণ্যের মূল্য', type: 'EXPENSE', subType: 'COST_OF_GOODS_SOLD', isSystem: true },
  { code: '5100', name: 'Rent Expense', nameBn: 'ভাড়া খরচ', type: 'EXPENSE', subType: 'OPERATING_EXPENSE', isSystem: false },
  { code: '5200', name: 'Salary Expense', nameBn: 'বেতন খরচ', type: 'EXPENSE', subType: 'OPERATING_EXPENSE', isSystem: false },
  { code: '5300', name: 'Utility Expense', nameBn: 'ইউটিলিটি খরচ', type: 'EXPENSE', subType: 'OPERATING_EXPENSE', isSystem: false },
  { code: '5400', name: 'Transport Expense', nameBn: 'পরিবহন খরচ', type: 'EXPENSE', subType: 'OPERATING_EXPENSE', isSystem: false },
  { code: '5500', name: 'Marketing Expense', nameBn: 'বিপণন খরচ', type: 'EXPENSE', subType: 'OPERATING_EXPENSE', isSystem: false },
  { code: '5900', name: 'Other Expenses', nameBn: 'অন্যান্য খরচ', type: 'EXPENSE', subType: 'OTHER_EXPENSE', isSystem: false },
];

// ─── CATEGORIES ───────────────────────────────────────────────────────
const CATEGORIES = [
  { code: 'SCHOOL-BOOKS', name: 'School Books', nameBn: 'স্কুলের বই' },
  { code: 'MADRASA-BOOKS', name: 'Madrasa Books', nameBn: 'মাদ্রাসার বই' },
  { code: 'ISLAMIC-BOOKS', name: 'Islamic Books', nameBn: 'ইসলামিক বই' },
  { code: 'QURAN-HADITH', name: 'Quran & Hadith', nameBn: 'কুরআন ও হাদিস' },
  { code: 'STATIONERY', name: 'Stationery', nameBn: 'স্টেশনারি' },
  { code: 'NOTEBOOKS', name: 'Notebooks', nameBn: 'নোটবুক' },
  { code: 'PENS-PENCILS', name: 'Pens & Pencils', nameBn: 'কলম ও পেন্সিল' },
  { code: 'FILES-FOLDERS', name: 'Files & Folders', nameBn: 'ফাইল ও ফোল্ডার' },
  { code: 'EDU-ACCESSORIES', name: 'Educational Accessories', nameBn: 'শিক্ষামূলক আনুষাঙ্গিক' },
  { code: 'OFFICE-SUPPLIES', name: 'Office Supplies', nameBn: 'অফিস সামগ্রী' },
  { code: 'OTHER', name: 'Other Products', nameBn: 'অন্যান্য পণ্য' },
];

// ─── UNITS ────────────────────────────────────────────────────────────
const UNITS = [
  { name: 'Piece', nameBn: 'পিস', abbreviation: 'pc', abbrevBn: 'পি' },
  { name: 'Dozen', nameBn: 'ডজন', abbreviation: 'dz', abbrevBn: 'ড' },
  { name: 'Box', nameBn: 'বাক্স', abbreviation: 'box', abbrevBn: 'বা' },
  { name: 'Pack', nameBn: 'প্যাক', abbreviation: 'pk', abbrevBn: 'প' },
  { name: 'Ream', nameBn: 'রিম', abbreviation: 'rm', abbrevBn: 'রি' },
  { name: 'Set', nameBn: 'সেট', abbreviation: 'set', abbrevBn: 'সে' },
  { name: 'Copy', nameBn: 'কপি', abbreviation: 'copy', abbrevBn: 'কপ' },
  { name: 'Bundle', nameBn: 'বান্ডেল', abbreviation: 'bndl', abbrevBn: 'বান' },
];

// ─── NUMBERING SEQUENCES ──────────────────────────────────────────────
const SEQUENCES = [
  { module: 'sale', prefix: 'INV', separator: '-', padding: 6, currentNo: 0 },
  { module: 'purchase', prefix: 'PO', separator: '-', padding: 6, currentNo: 0 },
  { module: 'customer_payment', prefix: 'REC', separator: '-', padding: 6, currentNo: 0 },
  { module: 'supplier_payment', prefix: 'PAY', separator: '-', padding: 6, currentNo: 0 },
  { module: 'expense', prefix: 'EXP', separator: '-', padding: 6, currentNo: 0 },
  { module: 'income', prefix: 'INC', separator: '-', padding: 6, currentNo: 0 },
  { module: 'journal_entry', prefix: 'JE', separator: '-', padding: 6, currentNo: 0 },
  { module: 'stock_adjustment', prefix: 'ADJ', separator: '-', padding: 6, currentNo: 0 },
  { module: 'stock_count', prefix: 'SC', separator: '-', padding: 6, currentNo: 0 },
];

// ─── SETTINGS ─────────────────────────────────────────────────────────
const SETTINGS = [
  { key: 'business_name', value: 'Barakah Finance — Library & Stationery', type: 'STRING', group: 'business', isPublic: true },
  { key: 'business_name_bn', value: 'বারাকাহ ফাইন্যান্স — লাইব্রেরি ও স্টেশনারি', type: 'STRING', group: 'business', isPublic: true },
  { key: 'business_address', value: 'Dhaka, Bangladesh', type: 'STRING', group: 'business', isPublic: true },
  { key: 'business_phone', value: '01700000000', type: 'STRING', group: 'business', isPublic: true },
  { key: 'currency', value: 'BDT', type: 'STRING', group: 'business', isPublic: true },
  { key: 'currency_symbol', value: '৳', type: 'STRING', group: 'business', isPublic: true },
  { key: 'tax_rate', value: '0', type: 'NUMBER', group: 'tax', isPublic: true },
  { key: 'low_stock_alert', value: 'true', type: 'BOOLEAN', group: 'inventory', isPublic: false },
  { key: 'default_language', value: 'bn', type: 'STRING', group: 'app', isPublic: true },
  { key: 'invoice_footer', value: 'ধন্যবাদ আমাদের সাথে কেনাকাটা করার জন্য', type: 'STRING', group: 'invoice', isPublic: true },
  { key: 'invoice_footer_en', value: 'Thank you for shopping with us', type: 'STRING', group: 'invoice', isPublic: true },
  { key: 'pos_print_receipt', value: 'true', type: 'BOOLEAN', group: 'pos', isPublic: false },
  { key: 'allow_negative_stock', value: 'false', type: 'BOOLEAN', group: 'inventory', isPublic: false, description: 'Allow stock to go below zero' },
];

// ─── SAMPLE PRODUCTS ──────────────────────────────────────────────────
async function seedSampleProducts(prisma: PrismaClient, categoryMap: any, unitMap: any) {
  const products = [
    { sku: 'BOOK-SCH-001', name: 'Class 5 Mathematics', nameBn: 'পঞ্চম শ্রেণি গণিত', category: 'SCHOOL-BOOKS', unit: 'pc', costPrice: 80, sellingPrice: 100 },
    { sku: 'BOOK-SCH-002', name: 'Class 6 English Grammar', nameBn: 'ষষ্ঠ শ্রেণি ইংরেজি ব্যাকরণ', category: 'SCHOOL-BOOKS', unit: 'pc', costPrice: 90, sellingPrice: 120 },
    { sku: 'BOOK-ISL-001', name: 'Al Quran (Large)', nameBn: 'আল কুরআন (বড়)', category: 'QURAN-HADITH', unit: 'pc', costPrice: 200, sellingPrice: 280 },
    { sku: 'BOOK-ISL-002', name: 'Riyazus Salihin', nameBn: 'রিয়াযুস সালেহীন', category: 'ISLAMIC-BOOKS', unit: 'pc', costPrice: 150, sellingPrice: 200 },
    { sku: 'BOOK-MAD-001', name: 'Ilm ul Sarf', nameBn: 'ইলমুস সরফ', category: 'MADRASA-BOOKS', unit: 'pc', costPrice: 60, sellingPrice: 85 },
    { sku: 'STA-PEN-001', name: 'Ball Pen Blue', nameBn: 'বল পেন নীল', category: 'PENS-PENCILS', unit: 'dz', costPrice: 60, sellingPrice: 80 },
    { sku: 'STA-PEN-002', name: 'Pencil HB', nameBn: 'পেন্সিল HB', category: 'PENS-PENCILS', unit: 'dz', costPrice: 40, sellingPrice: 55 },
    { sku: 'STA-NB-001', name: 'Notebook A4 200 pages', nameBn: 'নোটবুক A4 ২০০ পৃষ্ঠা', category: 'NOTEBOOKS', unit: 'pc', costPrice: 55, sellingPrice: 75 },
    { sku: 'STA-NB-002', name: 'Exercise Book 100 pages', nameBn: 'খাতা ১০০ পৃষ্ঠা', category: 'NOTEBOOKS', unit: 'pc', costPrice: 30, sellingPrice: 45 },
    { sku: 'STA-FILE-001', name: 'Plastic File Cover', nameBn: 'প্লাস্টিক ফাইল কভার', category: 'FILES-FOLDERS', unit: 'pc', costPrice: 15, sellingPrice: 25 },
    { sku: 'STA-RULER-001', name: 'Ruler 30cm', nameBn: 'স্কেল ৩০ সেমি', category: 'EDU-ACCESSORIES', unit: 'pc', costPrice: 10, sellingPrice: 18 },
    { sku: 'OFFICE-TAPE-001', name: 'Cello Tape', nameBn: 'সেলো টেপ', category: 'OFFICE-SUPPLIES', unit: 'pc', costPrice: 18, sellingPrice: 28 },
  ];

  for (const p of products) {
    const categoryId = categoryMap[p.category];
    const unitId = unitMap[p.unit];
    if (!categoryId) continue;

    await prisma.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: {
        sku: p.sku,
        name: p.name,
        nameBn: p.nameBn,
        categoryId,
        unitId,
        costPrice: p.costPrice,
        sellingPrice: p.sellingPrice,
        reorderLevel: 5,
        reorderQty: 20,
        status: 'ACTIVE',
      },
    });
  }
}

// ─── MAIN SEED ────────────────────────────────────────────────────────
async function main() {
  console.log('🌱 Starting database seed...');

  // 1. Permissions
  console.log('  → Creating permissions...');
  await prisma.permission.createMany({ data: PERMISSIONS, skipDuplicates: true });
  const allPermissions = await prisma.permission.findMany();
  const permMap = Object.fromEntries(
    allPermissions.map((p) => [`${p.module}:${p.action}:${p.resource}`, p.id]),
  );

  // 2. Roles
  console.log('  → Creating roles...');
  for (const roleData of ROLES) {
    const role = await prisma.role.upsert({
      where: { name: roleData.name },
      update: {},
      create: {
        name: roleData.name,
        nameBn: roleData.nameBn,
        description: roleData.description,
        isSystem: roleData.isSystem,
      },
    });

    // Assign permissions
    const permIds = roleData.allPermissions
      ? Object.values(permMap)
      : (roleData.permissions || []).map((p) => permMap[p]).filter(Boolean);

    for (const permissionId of permIds) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }
  }

  // 3. Main Branch
  console.log('  → Creating branch & warehouse...');
  const branch = await prisma.branch.upsert({
    where: { code: 'MAIN' },
    update: {},
    create: {
      code: 'MAIN',
      name: 'Main Branch',
      nameBn: 'প্রধান শাখা',
      address: 'Dhaka, Bangladesh',
      phone: '01700000000',
      isMain: true,
      status: 'ACTIVE',
    },
  });

  const warehouse = await prisma.warehouse.upsert({
    where: { code: 'WH-MAIN' },
    update: {},
    create: {
      branchId: branch.id,
      code: 'WH-MAIN',
      name: 'Main Warehouse',
      nameBn: 'প্রধান গুদাম',
      isDefault: true,
      isActive: true,
    },
  });

  // 4. Super Admin User
  console.log('  → Creating super admin user...');
  const adminUsername = process.env.SEED_ADMIN_USERNAME || 'admin';
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@barakahfinance.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@123456';
  const adminPhone = process.env.SEED_ADMIN_PHONE || '01700000000';

  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const superAdminRole = await prisma.role.findUnique({ where: { name: 'SUPER_ADMIN' } });

  const adminUser = await prisma.user.upsert({
    where: { username: adminUsername },
    update: {},
    create: {
      username: adminUsername,
      email: adminEmail,
      phone: adminPhone,
      passwordHash,
      firstName: 'Super',
      lastName: 'Admin',
      firstNameBn: 'সুপার',
      lastNameBn: 'অ্যাডমিন',
      status: 'ACTIVE',
      branchId: branch.id,
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
  console.log('  → Creating chart of accounts...');
  for (const acc of ACCOUNTS) {
    await prisma.account.upsert({
      where: { code: acc.code },
      update: {},
      create: acc as any,
    });
  }

  // 6. Categories
  console.log('  → Creating categories...');
  const categoryMap: Record<string, string> = {};
  for (const cat of CATEGORIES) {
    const c = await prisma.category.upsert({
      where: { code: cat.code },
      update: {},
      create: { code: cat.code, name: cat.name, nameBn: cat.nameBn, isActive: true },
    });
    categoryMap[cat.code] = c.id;
  }

  // 7. Units
  console.log('  → Creating units...');
  const unitMap: Record<string, string> = {};
  for (const unit of UNITS) {
    const u = await prisma.unit.upsert({
      where: { abbreviation: unit.abbreviation },
      update: {},
      create: { ...unit, isActive: true },
    });
    unitMap[unit.abbreviation] = u.id;
  }

  // 8. Numbering Sequences
  console.log('  → Creating numbering sequences...');
  for (const seq of SEQUENCES) {
    await prisma.numberingSequence.upsert({
      where: { module: seq.module },
      update: {},
      create: seq,
    });
  }

  // 9. Settings
  console.log('  → Creating settings...');
  for (const setting of SETTINGS) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting as any,
    });
  }

  // 10. Expense Categories
  console.log('  → Creating expense categories...');
  const expenseCategories = [
    { name: 'Rent', nameBn: 'ভাড়া' },
    { name: 'Salary & Wages', nameBn: 'বেতন ও মজুরি' },
    { name: 'Electricity', nameBn: 'বিদ্যুৎ বিল' },
    { name: 'Internet & Phone', nameBn: 'ইন্টারনেট ও ফোন' },
    { name: 'Transport', nameBn: 'পরিবহন' },
    { name: 'Marketing', nameBn: 'বিপণন' },
    { name: 'Maintenance', nameBn: 'রক্ষণাবেক্ষণ' },
    { name: 'Other', nameBn: 'অন্যান্য' },
  ];
  for (const ec of expenseCategories) {
    await prisma.expenseCategory.create({ data: ec }).catch(() => {});
  }

  // 11. Sample Products
  console.log('  → Creating sample products...');
  await seedSampleProducts(prisma, categoryMap, unitMap);

  // 12. Sample Demo Data (Supplier & Customer)
  console.log('  → Creating demo supplier & customer...');
  await prisma.supplier.upsert({
    where: { code: 'SUP-00001' },
    update: {},
    create: {
      code: 'SUP-00001',
      name: 'Boi Ghar Publishers',
      nameBn: 'বই ঘর পাবলিশার্স',
      phone: '01711111111',
      city: 'Dhaka',
      creditLimit: 100000,
      creditDays: 30,
      currentBalance: 0,
    },
  });

  await prisma.customer.upsert({
    where: { code: 'CUS-00001' },
    update: {},
    create: {
      code: 'CUS-00001',
      name: 'Walk-in Customer',
      nameBn: 'সাধারণ গ্রাহক',
      phone: '00000000000',
      currentBalance: 0,
    },
  });

  console.log(`
✅ Database seed complete!
   Admin credentials:
   Username : ${adminUsername}
   Password : ${adminPassword}
   Email    : ${adminEmail}
  `);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
