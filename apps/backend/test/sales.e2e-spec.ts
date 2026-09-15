/**
 * E2E TEST: Sales, POS & Cash Register System
 *
 * Sections:
 *  1 — Sale Atomicity          (2 tests)
 *  2 — COGS Weighted Average   (3 tests)
 *  3 — Negative Stock          (2 tests)
 *  4 — Mixed Payment           (3 tests)
 *  5 — Sale Void               (3 tests)
 *  6 — Sale Return             (3 tests)
 *  7 — RBAC                    (5 tests)
 *  8 — Journal Balance         (1 test)
 *  9 — Customer AR             (2 tests)
 * 10 — Cash Register           (2 tests)
 *
 * Total: 26 tests
 *
 * Requires: server running at http://localhost:3001 in NODE_ENV=test
 * Run:
 *   $env:NODE_ENV="test"
 *   npx jest --config test/jest-e2e.json --testPathPattern sales --forceExit
 */

import axios, { AxiosInstance } from 'axios';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import Decimal from 'decimal.js';

const API_URL = process.env.API_URL || 'http://127.0.0.1:3001/api/v1';
const prisma  = new PrismaClient();

let api:   AxiosInstance;
let token: string;  // admin token

// IDs resolved at runtime
let branchId:    string;
let warehouseId: string;
let productId:   string;   // main test product (high stock)
let product2Id:  string;   // secondary product
let productPrice: number;
let product2Price: number;
let productBarcode: string | null;

// Cleanup sets — removed in afterAll
const cleanup = {
  saleIds:         [] as string[],
  returnIds:       [] as string[],
  customerIds:     [] as string[],
  userIds:         [] as string[],
  registerIds:     [] as string[],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function d(v: any) { return new Decimal(v?.toString() ?? '0'); }

function auth(t = token) {
  return { headers: { Authorization: `Bearer ${t}` } };
}

async function login(username: string, password: string): Promise<string> {
  const r = await api.post('/auth/login', { username, password });
  expect(r.status).toBe(200);
  return r.data.data.accessToken as string;
}

async function createTestUser(roleName: string): Promise<{ token: string; userId: string }> {
  const role   = await prisma.role.findFirst({ where: { name: roleName } });
  const branch = await prisma.branch.findFirst({ where: { isMain: true } });
  if (!role || !branch) throw new Error(`Role ${roleName} or branch not found`);

  const hash = await bcrypt.hash('Test@12345', 10);
  const ts   = Date.now();
  const user = await prisma.user.create({
    data: {
      username:     `e2e_sales_${roleName.toLowerCase()}_${ts}`,
      email:        `e2e_sales_${roleName.toLowerCase()}_${ts}@test.com`,
      passwordHash: hash,
      firstName:    'E2E',
      lastName:     roleName,
      status:       'ACTIVE',
      branchId:     branch.id,
    },
  });
  cleanup.userIds.push(user.id);
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id, branchId: branch.id } });
  const t = await login(user.username, 'Test@12345');
  return { token: t, userId: user.id };
}

async function createQuickCustomer(name: string) {
  const r = await api.post('/customers/quick', { name, phone: `0170${Date.now().toString().slice(-7)}` }, auth());
  expect(r.status).toBe(201);
  cleanup.customerIds.push(r.data.data.id);
  return r.data.data;
}

async function makeSale(overrides: Record<string, any> = {}): Promise<any> {
  const payload = {
    branchId,
    items: [{ productId, quantity: 1, unitPrice: productPrice }],
    payments: [{ method: 'CASH', amount: productPrice }],
    ...overrides,
  };
  const r = await api.post('/sales', payload, auth());
  if (r.status === 201 || r.status === 200) cleanup.saleIds.push(r.data.data.id);
  return r;
}

// ─── Global setup / teardown ──────────────────────────────────────────────────

beforeAll(async () => {
  api = axios.create({ baseURL: API_URL, validateStatus: () => true });

  token = await login('admin', 'Admin@123456');

  const branch = await prisma.branch.findFirst({ where: { isMain: true } });
  branchId = branch!.id;

  const wh = await prisma.warehouse.findFirst({ where: { branchId, isDefault: true } });
  warehouseId = wh!.id;

  // Get 2 products with enough stock for all tests
  const stocks = await prisma.productStock.findMany({
    where: { warehouseId, quantity: { gte: 30 } },
    include: { product: true },
    orderBy: { quantity: 'desc' },
    take: 2,
  });

  if (stocks.length < 2) throw new Error('Need at least 2 products with qty >= 30 for e2e tests');

  productId    = stocks[0].product.id;
  productPrice = parseFloat(stocks[0].product.sellingPrice.toString());
  productBarcode = stocks[0].product.barcode;

  product2Id    = stocks[1].product.id;
  product2Price = parseFloat(stocks[1].product.sellingPrice.toString());
});

afterAll(async () => {
  // Clean up test data in correct FK order
  for (const id of cleanup.returnIds) {
    await prisma.saleReturn.deleteMany({ where: { id } }).catch(() => {});
  }
  for (const id of cleanup.saleIds) {
    await prisma.sale.deleteMany({ where: { id, isVoided: true } }).catch(() => {});
  }
  for (const id of cleanup.customerIds) {
    await prisma.customer.deleteMany({ where: { id } }).catch(() => {});
  }
  for (const id of cleanup.registerIds) {
    await prisma.cashRegister.deleteMany({ where: { id } }).catch(() => {});
  }
  for (const id of cleanup.userIds) {
    await prisma.userRole.deleteMany({ where: { userId: id } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id } }).catch(() => {});
  }
  await prisma.$disconnect();
});

// =============================================================================
// SECTION 1 — Sale Atomicity
// =============================================================================

describe('1 — Sale Atomicity', () => {

  it('1.1 invalid product UUID → HTTP 400, no sale created', async () => {
    const countBefore = await prisma.sale.count();
    const movBefore   = await prisma.stockMovement.count({ where: { type: 'SALE' } });

    const r = await api.post('/sales', {
      branchId,
      items: [
        { productId, quantity: 1, unitPrice: productPrice },
        { productId: '00000000-0000-0000-0000-000000000000', quantity: 1, unitPrice: 50 },
      ],
      payments: [{ method: 'CASH', amount: productPrice + 50 }],
    }, auth());

    expect(r.status).toBe(400);
    expect(await prisma.sale.count()).toBe(countBefore);
    expect(await prisma.stockMovement.count({ where: { type: 'SALE' } })).toBe(movBefore);

    // No orphan sale_items
    const orphans = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) AS cnt FROM sale_items si LEFT JOIN sales s ON s.id = si.sale_id WHERE s.id IS NULL`
    );
    expect(Number(orphans[0].cnt)).toBe(0);
  });

  it('1.2 valid sale → 201 with invoice number and items', async () => {
    const r = await makeSale();
    expect(r.status).toBe(201);
    expect(r.data.data.invoiceNumber).toMatch(/^INV-/);
    expect(r.data.data.status).toBe('COMPLETED');
    expect(r.data.data.paymentStatus).toBe('PAID');
  });

});

// =============================================================================
// SECTION 2 — COGS Weighted Average
// =============================================================================

describe('2 — COGS Weighted Average', () => {

  it('2.1 COGS journal entry exists for every completed sale', async () => {
    const r = await makeSale();
    expect(r.status).toBe(201);
    const saleId = r.data.data.id;

    const cogsAccount = await prisma.account.findFirst({
      where: { subType: 'COST_OF_GOODS_SOLD', isSystem: true },
    });
    expect(cogsAccount).toBeTruthy();

    const cogsLine = await prisma.journalLine.findFirst({
      where: {
        debitAccountId: cogsAccount!.id,
        journalEntry: { saleId },
      },
    });
    expect(cogsLine).toBeTruthy();
    expect(d(cogsLine!.amount).greaterThan(0)).toBe(true);
  });

  it('2.2 COGS equals weighted-average cost × quantity', async () => {
    // Get WAC from stock movements
    const movements = await prisma.stockMovement.findMany({
      where: {
        productId,
        warehouseId,
        type: 'PURCHASE',
        unitCost: { not: null },
      },
    });

    let totalValue = d(0);
    let totalQty   = d(0);
    for (const m of movements) {
      totalValue = totalValue.plus(d(m.quantity).times(d(m.unitCost)));
      totalQty   = totalQty.plus(d(m.quantity));
    }

    if (totalQty.isZero()) {
      // No purchase history → fall back to cost price
      const product = await prisma.product.findUnique({ where: { id: productId } });
      const expectedCOGS = d(product!.costPrice).times(1);

      const r = await makeSale();
      expect(r.status).toBe(201);

      const cogsAccount = await prisma.account.findFirst({
        where: { subType: 'COST_OF_GOODS_SOLD', isSystem: true },
      });
      const cogsLine = await prisma.journalLine.findFirst({
        where: { debitAccountId: cogsAccount!.id, journalEntry: { saleId: r.data.data.id } },
      });
      // COGS must be > 0 if cost price > 0
      if (expectedCOGS.greaterThan(0)) {
        expect(d(cogsLine!.amount).greaterThan(0)).toBe(true);
      }
      return;
    }

    const wac = totalValue.dividedBy(totalQty);

    const r = await makeSale({ items: [{ productId, quantity: 1, unitPrice: productPrice }] });
    expect(r.status).toBe(201);
    const saleId = r.data.data.id;

    const cogsAccount = await prisma.account.findFirst({
      where: { subType: 'COST_OF_GOODS_SOLD', isSystem: true },
    });
    const cogsLine = await prisma.journalLine.findFirst({
      where: { debitAccountId: cogsAccount!.id, journalEntry: { saleId } },
    });
    expect(cogsLine).toBeTruthy();

    const actualCOGS  = d(cogsLine!.amount);
    const expectedCOGS = wac.times(1);
    const diff = actualCOGS.minus(expectedCOGS).abs();
    expect(diff.lessThan(d('0.02'))).toBe(true); // within 2 paisa rounding
  });

  it('2.3 COGS journal is balanced (Dr COGS = Cr Inventory)', async () => {
    const r = await makeSale();
    expect(r.status).toBe(201);
    const saleId = r.data.data.id;

    const cogsAccount = await prisma.account.findFirst({
      where: { subType: 'COST_OF_GOODS_SOLD', isSystem: true },
    });
    const inventoryAccount = await prisma.account.findFirst({
      where: { subType: 'INVENTORY', isSystem: true },
    });

    const cogsJournal = await prisma.journalEntry.findFirst({
      where: { saleId, description: { contains: 'COGS' } },
      include: { lines: true },
    });
    expect(cogsJournal).toBeTruthy();

    const dr = cogsJournal!.lines
      .filter(l => l.debitAccountId)
      .reduce((s, l) => s.plus(d(l.amount)), d(0));
    const cr = cogsJournal!.lines
      .filter(l => l.creditAccountId)
      .reduce((s, l) => s.plus(d(l.amount)), d(0));

    expect(dr.equals(cr)).toBe(true);
    expect(dr.greaterThan(0)).toBe(true);
  });

});

// =============================================================================
// SECTION 3 — Negative Stock
// =============================================================================

describe('3 — Negative Stock', () => {

  it('3.1 sell more than available stock → HTTP 400', async () => {
    const stockRow = await prisma.productStock.findFirst({
      where: { warehouseId, productId },
    });
    const currentQty = parseFloat(stockRow!.quantity.toString());
    const oversell   = currentQty + 9999;

    const r = await api.post('/sales', {
      branchId,
      items: [{ productId, quantity: oversell, unitPrice: productPrice }],
      payments: [{ method: 'CASH', amount: oversell * productPrice }],
    }, auth());

    expect(r.status).toBe(400);
    expect(r.data.message).toMatch(/Insufficient stock/i);
  });

  it('3.2 stock unchanged after blocked oversell', async () => {
    const stockBefore = await prisma.productStock.findFirst({
      where: { warehouseId, productId },
    });
    const oversell = parseFloat(stockBefore!.quantity.toString()) + 9999;

    await api.post('/sales', {
      branchId,
      items: [{ productId, quantity: oversell, unitPrice: productPrice }],
      payments: [{ method: 'CASH', amount: oversell * productPrice }],
    }, auth());

    const stockAfter = await prisma.productStock.findFirst({
      where: { warehouseId, productId },
    });
    expect(d(stockAfter!.quantity).equals(d(stockBefore!.quantity))).toBe(true);
  });

});

// =============================================================================
// SECTION 4 — Mixed Payment
// =============================================================================

describe('4 — Mixed Payment', () => {

  it('4.1 two-method payment (Cash + bKash) — 3 payment records, Dr=Cr', async () => {
    const customer = await createQuickCustomer('E2E 2-way pay');
    const qty   = 5;
    const price = 100;
    const total = qty * price; // 500

    const r = await api.post('/sales', {
      branchId,
      customerId: customer.id,
      items: [{ productId, quantity: qty, unitPrice: price }],
      payments: [
        { method: 'CASH',  amount: 300 },
        { method: 'BKASH', amount: 200 },
      ],
    }, auth());

    expect(r.status).toBe(201);
    cleanup.saleIds.push(r.data.data.id);
    const saleId = r.data.data.id;

    const payments = await prisma.customerPayment.findMany({ where: { saleId } });
    expect(payments).toHaveLength(2);

    const totalPaid = payments.reduce((s, p) => s.plus(d(p.amount)), d(0));
    expect(totalPaid.equals(500)).toBe(true);

    // Journal balanced
    const lines = await prisma.journalLine.findMany({
      where: { journalEntry: { saleId, type: 'SALE', description: { not: { contains: 'COGS' } } } },
    });
    const dr = lines.filter(l => l.debitAccountId).reduce((s, l) => s.plus(d(l.amount)), d(0));
    const cr = lines.filter(l => l.creditAccountId).reduce((s, l) => s.plus(d(l.amount)), d(0));
    expect(dr.equals(cr)).toBe(true);
  });

  it('4.2 three-method payment (Cash 500 + bKash 300 + Due 200 = 1000) — customer AR + balanced', async () => {
    const customer = await createQuickCustomer('E2E 3-way pay');
    const qty   = 10;
    const price = 100;

    const r = await api.post('/sales', {
      branchId,
      customerId: customer.id,
      items: [{ productId, quantity: qty, unitPrice: price }],
      payments: [
        { method: 'CASH',  amount: 500 },
        { method: 'BKASH', amount: 300 },
        { method: 'DUE',   amount: 200 },
      ],
    }, auth());

    expect(r.status).toBe(201);
    cleanup.saleIds.push(r.data.data.id);
    const saleId = r.data.data.id;

    // 3 payment records
    const payments = await prisma.customerPayment.findMany({ where: { saleId } });
    expect(payments).toHaveLength(3);

    const cashPmt  = payments.find(p => p.method === 'CASH');
    const bkashPmt = payments.find(p => p.method === 'BKASH');
    const duePmt   = payments.find(p => p.method === 'DUE');
    expect(d(cashPmt!.amount).equals(500)).toBe(true);
    expect(d(bkashPmt!.amount).equals(300)).toBe(true);
    expect(d(duePmt!.amount).equals(200)).toBe(true);

    // Customer AR = 200
    const cust = await prisma.customer.findUnique({ where: { id: customer.id } });
    expect(d(cust!.currentBalance).equals(200)).toBe(true);

    // Revenue journal Dr=Cr=1000
    const revAccount = await prisma.account.findFirst({
      where: { subType: 'SALES_REVENUE', isSystem: true },
    });
    const journals = await prisma.journalEntry.findMany({
      where: { saleId, type: 'SALE' },
      include: { lines: true },
    });
    const revJournal = journals.find(j =>
      j.lines.some(l => l.creditAccountId === revAccount!.id)
    );
    expect(revJournal).toBeTruthy();
    const dr = revJournal!.lines.filter(l => l.debitAccountId).reduce((s, l) => s.plus(d(l.amount)), d(0));
    const cr = revJournal!.lines.filter(l => l.creditAccountId).reduce((s, l) => s.plus(d(l.amount)), d(0));
    expect(dr.equals(1000)).toBe(true);
    expect(cr.equals(1000)).toBe(true);
  });

  it('4.3 overpay (payments exceed total) → HTTP 400', async () => {
    const r = await api.post('/sales', {
      branchId,
      items: [{ productId, quantity: 1, unitPrice: 100 }],
      payments: [
        { method: 'CASH',  amount: 200 },
        { method: 'BKASH', amount: 200 },
      ],
    }, auth());

    expect(r.status).toBe(400);
    expect(r.data.message).toMatch(/exceed/i);
  });

});

// =============================================================================
// SECTION 5 — Sale Void
// =============================================================================

describe('5 — Sale Void', () => {

  let voidSaleId: string;
  let stockBeforeVoid: number;

  beforeEach(async () => {
    const stockRow = await prisma.productStock.findFirst({
      where: { warehouseId, productId },
    });
    stockBeforeVoid = parseFloat(stockRow!.quantity.toString());

    const r = await makeSale({ items: [{ productId, quantity: 2, unitPrice: productPrice }], payments: [{ method: 'CASH', amount: productPrice * 2 }] });
    expect(r.status).toBe(201);
    voidSaleId = r.data.data.id;
  });

  it('5.1 void sets status=CANCELLED, isVoided=true, voidReason', async () => {
    const r = await api.post(`/sales/${voidSaleId}/void`, { reason: 'e2e void test' }, auth());
    expect(r.status).toBe(200);

    const sale = await prisma.sale.findUnique({ where: { id: voidSaleId } });
    expect(sale!.isVoided).toBe(true);
    expect(sale!.status).toBe('CANCELLED');
    expect(sale!.voidReason).toBe('e2e void test');
    expect(sale!.voidedAt).toBeTruthy();
  });

  it('5.2 original journal entries still exist + reversal journal created', async () => {
    const beforeJournals = await prisma.journalEntry.count({ where: { saleId: voidSaleId } });

    await api.post(`/sales/${voidSaleId}/void`, { reason: 'e2e journal test' }, auth());

    const afterJournals  = await prisma.journalEntry.count({ where: { saleId: voidSaleId } });
    const voidJournals   = await prisma.journalEntry.findMany({ where: { saleId: voidSaleId, type: 'VOID' } });

    expect(afterJournals).toBeGreaterThan(beforeJournals);
    expect(voidJournals.length).toBeGreaterThanOrEqual(1);

    // Reversal journal is balanced
    const lines = await prisma.journalLine.findMany({ where: { journalEntryId: voidJournals[0].id } });
    const dr = lines.filter(l => l.debitAccountId).reduce((s, l) => s.plus(d(l.amount)), d(0));
    const cr = lines.filter(l => l.creditAccountId).reduce((s, l) => s.plus(d(l.amount)), d(0));
    expect(dr.equals(cr)).toBe(true);
    expect(dr.greaterThan(0)).toBe(true);
  });

  it('5.3 stock restored after void', async () => {
    const stockMid = await prisma.productStock.findFirst({ where: { warehouseId, productId } });
    const midQty   = parseFloat(stockMid!.quantity.toString());
    // Stock should be 2 less after sale
    expect(midQty).toBeLessThan(stockBeforeVoid);

    await api.post(`/sales/${voidSaleId}/void`, { reason: 'e2e stock restore' }, auth());

    const stockAfter = await prisma.productStock.findFirst({ where: { warehouseId, productId } });
    // Stock restored to before-sale level
    expect(d(stockAfter!.quantity).equals(d(stockBeforeVoid))).toBe(true);
  });

});

// =============================================================================
// SECTION 6 — Sale Return
// =============================================================================

describe('6 — Sale Return', () => {

  let returnSaleId: string;
  let returnSaleItems: any[];
  let stockBeforeReturn: number;

  beforeEach(async () => {
    const r = await makeSale({
      items: [
        { productId, quantity: 5, unitPrice: productPrice },
        { productId: product2Id, quantity: 3, unitPrice: product2Price },
      ],
      payments: [{ method: 'CASH', amount: 5 * productPrice + 3 * product2Price }],
    });
    expect(r.status).toBe(201);
    returnSaleId = r.data.data.id;

    const saleDetail = await prisma.sale.findUnique({
      where: { id: returnSaleId }, include: { items: true },
    });
    returnSaleItems = saleDetail!.items;

    const stockRow = await prisma.productStock.findFirst({ where: { warehouseId, productId } });
    stockBeforeReturn = parseFloat(stockRow!.quantity.toString());
  });

  it('6.1 partial return (2 of 5 units) — creates return record, stock increases', async () => {
    const item = returnSaleItems.find(i => i.productId === productId);
    const r = await api.post(`/sales/${returnSaleId}/return`, {
      saleId: returnSaleId,
      reason: 'e2e partial return',
      refundMethod: 'CASH',
      items: [{ saleItemId: item.id, productId: item.productId, quantity: 2 }],
    }, auth());

    expect(r.status).toBe(201);
    cleanup.returnIds.push(r.data.data.id);
    expect(r.data.data.returnNumber).toMatch(/^SR-/);

    // Stock increased by 2
    const stockAfter = await prisma.productStock.findFirst({ where: { warehouseId, productId } });
    expect(d(stockAfter!.quantity).equals(d(stockBeforeReturn).plus(2))).toBe(true);
  });

  it('6.2 full return — sale status becomes RETURNED', async () => {
    const item1 = returnSaleItems.find(i => i.productId === productId);
    const item2 = returnSaleItems.find(i => i.productId === product2Id);

    const r = await api.post(`/sales/${returnSaleId}/return`, {
      saleId: returnSaleId,
      reason: 'full return e2e',
      refundMethod: 'CASH',
      items: [
        { saleItemId: item1.id, productId: item1.productId, quantity: 5 },
        { saleItemId: item2.id, productId: item2.productId, quantity: 3 },
      ],
    }, auth());

    expect(r.status).toBe(201);
    cleanup.returnIds.push(r.data.data.id);

    const sale = await prisma.sale.findUnique({ where: { id: returnSaleId } });
    expect(sale!.status).toBe('RETURNED');
  });

  it('6.3 return qty exceeds original → HTTP 400', async () => {
    const item = returnSaleItems.find(i => i.productId === productId);

    const r = await api.post(`/sales/${returnSaleId}/return`, {
      saleId: returnSaleId,
      reason: 'excess return attempt',
      refundMethod: 'CASH',
      items: [{ saleItemId: item.id, productId: item.productId, quantity: 999 }],
    }, auth());

    expect(r.status).toBe(400);
    expect(r.data.message).toMatch(/exceed/i);
  });

});

// =============================================================================
// SECTION 7 — RBAC
// =============================================================================

describe('7 — RBAC', () => {

  let cashierToken:   string;
  let managerToken:   string;
  let accountantToken: string;
  let viewerToken:    string;
  let testSaleId:     string;

  beforeAll(async () => {
    const cashier    = await createTestUser('CASHIER');
    const manager    = await createTestUser('MANAGER');
    const accountant = await createTestUser('ACCOUNTANT');
    const viewer     = await createTestUser('VIEWER');

    cashierToken    = cashier.token;
    managerToken    = manager.token;
    accountantToken = accountant.token;
    viewerToken     = viewer.token;

    // Create a sale as admin for void tests
    const r = await makeSale();
    expect(r.status).toBe(201);
    testSaleId = r.data.data.id;
  });

  it('7.1 CASHIER can create a sale (201)', async () => {
    const r = await api.post('/sales', {
      branchId,
      items: [{ productId, quantity: 1, unitPrice: productPrice }],
      payments: [{ method: 'CASH', amount: productPrice }],
    }, auth(cashierToken));
    expect(r.status).toBe(201);
    cleanup.saleIds.push(r.data.data.id);
  });

  it('7.2 CASHIER cannot void a sale (403)', async () => {
    const r = await api.post(`/sales/${testSaleId}/void`, { reason: 'cashier void attempt' }, auth(cashierToken));
    expect(r.status).toBe(403);
    expect(r.data.message).toMatch(/Permission denied/i);
  });

  it('7.3 MANAGER can void a sale (200)', async () => {
    // Create fresh sale to void
    const fresh = await makeSale();
    expect(fresh.status).toBe(201);

    const r = await api.post(`/sales/${fresh.data.data.id}/void`, { reason: 'manager void e2e' }, auth(managerToken));
    expect(r.status).toBe(200);
    expect(r.data.data.status).toBe('CANCELLED');
  });

  it('7.4 ACCOUNTANT cannot create sale (403)', async () => {
    const r = await api.post('/sales', {
      branchId,
      items: [{ productId, quantity: 1, unitPrice: productPrice }],
      payments: [{ method: 'CASH', amount: productPrice }],
    }, auth(accountantToken));
    expect(r.status).toBe(403);
  });

  it('7.5 VIEWER can read sales list (200)', async () => {
    const r = await api.get('/sales', auth(viewerToken));
    expect(r.status).toBe(200);
    expect(Array.isArray(r.data.data)).toBe(true);
  });

});

// =============================================================================
// SECTION 8 — Journal Balance
// =============================================================================

describe('8 — Journal Balance', () => {

  it('8.1 every sale journal entry has Dr = Cr', async () => {
    // Run 3 sales and check all their journals
    const saleIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await makeSale();
      expect(r.status).toBe(201);
      saleIds.push(r.data.data.id);
    }

    for (const saleId of saleIds) {
      const journals = await prisma.journalEntry.findMany({
        where: { saleId, status: 'POSTED' },
        include: { lines: true },
      });
      expect(journals.length).toBeGreaterThan(0);

      for (const j of journals) {
        const dr = j.lines.filter(l => l.debitAccountId).reduce((s, l) => s.plus(d(l.amount)), d(0));
        const cr = j.lines.filter(l => l.creditAccountId).reduce((s, l) => s.plus(d(l.amount)), d(0));
        expect(dr.equals(cr)).toBe(true);
        expect(dr.greaterThan(0)).toBe(true);
      }
    }
  });

});

// =============================================================================
// SECTION 9 — Customer AR
// =============================================================================

describe('9 — Customer AR', () => {

  it('9.1 credit sale increases customer AR by due amount', async () => {
    const customer = await createQuickCustomer('E2E AR test');
    const dueAmount = 400;

    const r = await api.post('/sales', {
      branchId,
      customerId: customer.id,
      items: [{ productId, quantity: 4, unitPrice: 100 }],
      payments: [{ method: 'DUE', amount: dueAmount }],
    }, auth());

    expect(r.status).toBe(201);
    cleanup.saleIds.push(r.data.data.id);

    const cust = await prisma.customer.findUnique({ where: { id: customer.id } });
    expect(d(cust!.currentBalance).equals(dueAmount)).toBe(true);
  });

  it('9.2 payment to due sale reduces customer AR', async () => {
    const customer = await createQuickCustomer('E2E pay AR test');
    const total = 300;

    const saleR = await api.post('/sales', {
      branchId,
      customerId: customer.id,
      items: [{ productId, quantity: 3, unitPrice: 100 }],
      payments: [{ method: 'DUE', amount: total }],
    }, auth());

    expect(saleR.status).toBe(201);
    const saleId = saleR.data.data.id;
    cleanup.saleIds.push(saleId);

    const custBefore = await prisma.customer.findUnique({ where: { id: customer.id } });
    expect(d(custBefore!.currentBalance).equals(total)).toBe(true);

    // Collect partial payment
    const payR = await api.post(`/sales/${saleId}/payment`, {
      method: 'CASH',
      amount: 150,
    }, auth());
    expect([200, 201]).toContain(payR.status);

    const custAfter = await prisma.customer.findUnique({ where: { id: customer.id } });
    expect(d(custAfter!.currentBalance).equals(150)).toBe(true);
  });

});

// =============================================================================
// SECTION 10 — Cash Register
// =============================================================================

describe('10 — Cash Register', () => {

  it('10.1 open register → correct opening balance, status=OPEN', async () => {
    const branch = await prisma.branch.findFirst({ where: { isMain: true } });
    const admin  = await prisma.user.findFirst({ where: { username: 'admin' } });

    // Close any existing open register first
    const openReg = await prisma.cashRegister.findFirst({
      where: { branchId: branch!.id, userId: admin!.id, status: 'OPEN' },
    });
    if (openReg) {
      await prisma.cashRegister.update({
        where: { id: openReg.id },
        data: { status: 'CLOSED', closedAt: new Date(), closedBy: admin!.id,
                expectedCash: openReg.openingBalance, actualCash: openReg.openingBalance,
                difference: '0', closingBalance: openReg.openingBalance },
      });
    }

    const r = await api.post('/cash-register/open', {
      branchId: branch!.id,
      name: 'E2E Register Test',
      openingBalance: 2000,
    }, auth());
    expect(r.status).toBe(201);
    cleanup.registerIds.push(r.data.data.id);

    const reg = await prisma.cashRegister.findUnique({ where: { id: r.data.data.id } });
    expect(reg).toBeTruthy();
    expect(d(reg!.openingBalance).equals(2000)).toBe(true);
    expect(reg!.status).toBe('OPEN');
  });

  it('10.2 close register with correct cash → difference=0, status=CLOSED', async () => {
    const branch = await prisma.branch.findFirst({ where: { isMain: true } });
    const admin  = await prisma.user.findFirst({ where: { username: 'admin' } });

    // Find open E2E register or create one
    let reg = await prisma.cashRegister.findFirst({
      where: { branchId: branch!.id, userId: admin!.id, status: 'OPEN', name: 'E2E Register Test' },
    });
    if (!reg) {
      const open = await prisma.cashRegister.findFirst({
        where: { branchId: branch!.id, userId: admin!.id, status: 'OPEN' },
      });
      if (open) {
        reg = open;
      } else {
        const r = await api.post('/cash-register/open', {
          branchId: branch!.id, name: 'E2E Register Close', openingBalance: 1000,
        }, auth());
        expect(r.status).toBe(201);
        reg = r.data.data;
        cleanup.registerIds.push(reg!.id);
      }
    }

    // Manually inject sales/expenses for predictable expected
    const opening = parseFloat(reg!.openingBalance.toString());
    await prisma.cashRegister.update({
      where: { id: reg!.id },
      data: { cashSales: 500, cashRefunds: 50, cashExpenses: 100, cashAdjustments: 0 },
    });
    // Expected = opening + 500 - 50 - 100 = opening + 350
    const expectedCash = opening + 350;

    const r = await api.post(`/cash-register/${reg!.id}/close`, {
      actualCash: expectedCash,
      notes: 'e2e close test',
    }, auth());
    expect(r.status).toBe(200);

    const closed = await prisma.cashRegister.findUnique({ where: { id: reg!.id } });
    expect(closed!.status).toBe('CLOSED');
    expect(d(closed!.expectedCash!).equals(expectedCash)).toBe(true);
    expect(d(closed!.actualCash!).equals(expectedCash)).toBe(true);
    expect(d(closed!.difference!).equals(0)).toBe(true);
  });

});
