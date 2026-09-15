/**
 * verify-sales-rbac.ts
 * RBAC boundary tests for the Sales module.
 * Tests 7 scenarios across 5 roles.
 * Run: npx ts-node scripts/verify-sales-rbac.ts
 */
import { PrismaClient } from '@prisma/client';
import * as http from 'http';
import * as https from 'https';
import * as bcrypt from 'bcrypt';

const p = new PrismaClient();
let PASS = 0;
let FAIL = 0;

// ─── HTTP helpers (pure Node — no axios, no PowerShell ternary) ────────────────

function request(
  method: string,
  path: string,
  body: any,
  token: string,
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const opts: http.RequestOptions = {
      hostname: 'localhost',
      port: 3001,
      path: `/api/v1${path}`,
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode!, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode!, body: raw });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const post = (path: string, body: any, token: string) =>
  request('POST', path, body, token);
const get = (path: string, token: string) =>
  request('GET', path, null, token);

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`);
    PASS++;
  } else {
    console.error(`  ✗ FAIL: ${label}${detail ? ' — ' + detail : ''}`);
    FAIL++;
  }
}

// ─── Login helper ─────────────────────────────────────────────────────────────

async function loginAs(username: string, password: string): Promise<string> {
  const r = await post('/auth/login', { username, password }, '');
  const token = r.body?.data?.accessToken;
  if (!token) {
    throw new Error(
      `Login failed for ${username}: ${JSON.stringify(r.body).slice(0, 200)}`,
    );
  }
  return token;
}

// ─── Create test user if not exists ──────────────────────────────────────────

async function ensureTestUser(
  username: string,
  roleName: string,
  branchId: string,
): Promise<void> {
  const existing = await p.user.findFirst({ where: { username } });
  if (existing) return;

  const role = await p.role.findFirst({ where: { name: roleName } });
  if (!role) throw new Error(`Role not found: ${roleName}`);

  const passwordHash = await bcrypt.hash('Test@123456', 10);
  const user = await p.user.create({
    data: {
      username,
      email: `${username}@test.barakah.local`,
      passwordHash,
      firstName: username,
      branchId,
      status: 'ACTIVE',
    },
  });

  await p.userRole.create({
    data: {
      userId: user.id,
      roleId: role.id,
      branchId,
    },
  });

  console.log(`  → Created test user: ${username} (${roleName})`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(
    '╔═══════════════════════════════════════════════════╗',
  );
  console.log(
    '║   Sales RBAC Boundary Verification — 7 Scenarios  ║',
  );
  console.log(
    '╚═══════════════════════════════════════════════════╝\n',
  );

  // ── Setup ──────────────────────────────────────────────────────────────────
  const branch = await p.branch.findFirst({ where: { isMain: true } });
  if (!branch) throw new Error('No main branch found');
  const branchId = branch.id;

  const warehouse = await p.warehouse.findFirst({
    where: { branchId, isDefault: true },
  });
  if (!warehouse) throw new Error('No default warehouse found');

  // Ensure test users exist for every role we need
  await ensureTestUser('rbac_cashier', 'CASHIER', branchId);
  await ensureTestUser('rbac_manager', 'MANAGER', branchId);
  await ensureTestUser('rbac_accountant', 'ACCOUNTANT', branchId);
  await ensureTestUser('rbac_viewer', 'VIEWER', branchId);

  // Get a product with stock for sale payload
  const stock = await p.productStock.findFirst({
    where: { warehouseId: warehouse.id, quantity: { gte: 5 } },
    include: { product: { select: { id: true, sellingPrice: true } } },
  });
  if (!stock) throw new Error('No product with stock >= 5 found');

  const salePayload = {
    branchId,
    items: [
      {
        productId: stock.product.id,
        quantity: 1,
        unitPrice: Number(stock.product.sellingPrice),
      },
    ],
    payments: [
      { method: 'CASH', amount: Number(stock.product.sellingPrice) },
    ],
  };

  // ── Login as each role ──────────────────────────────────────────────────────
  console.log('Logging in as each role...');
  const adminToken    = await loginAs('admin',           'Admin@123456');
  const cashierToken  = await loginAs('rbac_cashier',    'Test@123456');
  const managerToken  = await loginAs('rbac_manager',    'Test@123456');
  const accountantToken = await loginAs('rbac_accountant', 'Test@123456');
  const viewerToken   = await loginAs('rbac_viewer',     'Test@123456');
  console.log('  ✓ All logins successful\n');

  // Create a completed sale as admin for void/return tests
  const adminSaleRes = await post('/sales', salePayload, adminToken);
  if (![200, 201].includes(adminSaleRes.status)) {
    throw new Error(`Admin sale creation failed: HTTP ${adminSaleRes.status} — ${JSON.stringify(adminSaleRes.body).slice(0, 300)}`);
  }
  const testSaleId = adminSaleRes.body.data.id;
  const testInvoice = adminSaleRes.body.data.invoiceNumber;
  console.log(`  Setup sale: ${testInvoice} (${testSaleId})\n`);

  // ══════════════════════════════════════════════════════════════════════════
  // SCENARIO 1 — CASHIER can POST /sales → expect 201
  // ══════════════════════════════════════════════════════════════════════════
  console.log('SCENARIO 1: CASHIER → POST /sales (should → 201)');
  const cashierSaleRes = await post('/sales', salePayload, cashierToken);
  console.log(
    `  HTTP ${cashierSaleRes.status}: invoice=${cashierSaleRes.body?.data?.invoiceNumber ?? 'N/A'}`,
  );
  assert(
    'CASHIER can create sale',
    [200, 201].includes(cashierSaleRes.status),
    `got ${cashierSaleRes.status}`,
  );
  const cashierSaleId = cashierSaleRes.body?.data?.id;
  console.log();

  // ══════════════════════════════════════════════════════════════════════════
  // SCENARIO 2 — CASHIER cannot POST /sales/:id/void → expect 403
  // ══════════════════════════════════════════════════════════════════════════
  console.log('SCENARIO 2: CASHIER → POST /sales/:id/void (should → 403)');
  const cashierVoidRes = await post(
    `/sales/${testSaleId}/void`,
    { reason: 'test cashier cannot void' },
    cashierToken,
  );
  console.log(
    `  HTTP ${cashierVoidRes.status}: message=${JSON.stringify(cashierVoidRes.body?.message ?? cashierVoidRes.body?.error ?? '').slice(0, 80)}`,
  );
  assert(
    'CASHIER cannot void sale (403)',
    cashierVoidRes.status === 403,
    `got ${cashierVoidRes.status}`,
  );
  console.log();

  // ══════════════════════════════════════════════════════════════════════════
  // SCENARIO 3 — MANAGER can POST /sales/:id/void → expect 200
  // ══════════════════════════════════════════════════════════════════════════
  console.log('SCENARIO 3: MANAGER → POST /sales/:id/void (should → 200)');
  const managerVoidRes = await post(
    `/sales/${testSaleId}/void`,
    { reason: 'manager void test' },
    managerToken,
  );
  console.log(
    `  HTTP ${managerVoidRes.status}: status=${managerVoidRes.body?.data?.status ?? 'N/A'}`,
  );
  assert(
    'MANAGER can void sale (200)',
    managerVoidRes.status === 200,
    `got ${managerVoidRes.status}`,
  );
  console.log();

  // ══════════════════════════════════════════════════════════════════════════
  // SCENARIO 4 — ACCOUNTANT cannot POST /sales → expect 403
  // ══════════════════════════════════════════════════════════════════════════
  console.log('SCENARIO 4: ACCOUNTANT → POST /sales (should → 403)');
  const accountantSaleRes = await post('/sales', salePayload, accountantToken);
  console.log(
    `  HTTP ${accountantSaleRes.status}: message=${JSON.stringify(accountantSaleRes.body?.message ?? accountantSaleRes.body?.error ?? '').slice(0, 80)}`,
  );
  assert(
    'ACCOUNTANT cannot create sale (403)',
    accountantSaleRes.status === 403,
    `got ${accountantSaleRes.status}`,
  );
  console.log();

  // ══════════════════════════════════════════════════════════════════════════
  // SCENARIO 5 — ACCOUNTANT cannot POST /sales/:id/void → expect 403
  // ══════════════════════════════════════════════════════════════════════════
  // Create a fresh sale for accountant void test
  const freshSale = await post('/sales', salePayload, adminToken);
  const freshSaleId = freshSale.body?.data?.id ?? testSaleId;

  console.log('SCENARIO 5: ACCOUNTANT → POST /sales/:id/void (should → 403)');
  const accountantVoidRes = await post(
    `/sales/${freshSaleId}/void`,
    { reason: 'accountant void attempt' },
    accountantToken,
  );
  console.log(
    `  HTTP ${accountantVoidRes.status}: message=${JSON.stringify(accountantVoidRes.body?.message ?? accountantVoidRes.body?.error ?? '').slice(0, 80)}`,
  );
  assert(
    'ACCOUNTANT cannot void sale (403)',
    accountantVoidRes.status === 403,
    `got ${accountantVoidRes.status}`,
  );
  console.log();

  // ══════════════════════════════════════════════════════════════════════════
  // SCENARIO 6 — VIEWER cannot POST /sales → expect 403
  // ══════════════════════════════════════════════════════════════════════════
  console.log('SCENARIO 6: VIEWER → POST /sales (should → 403)');
  const viewerSaleRes = await post('/sales', salePayload, viewerToken);
  console.log(
    `  HTTP ${viewerSaleRes.status}: message=${JSON.stringify(viewerSaleRes.body?.message ?? viewerSaleRes.body?.error ?? '').slice(0, 80)}`,
  );
  assert(
    'VIEWER cannot create sale (403)',
    viewerSaleRes.status === 403,
    `got ${viewerSaleRes.status}`,
  );
  console.log();

  // ══════════════════════════════════════════════════════════════════════════
  // SCENARIO 7 — VIEWER can GET /sales → expect 200
  // ══════════════════════════════════════════════════════════════════════════
  console.log('SCENARIO 7: VIEWER → GET /sales (should → 200)');
  const viewerListRes = await get('/sales', viewerToken);
  console.log(
    `  HTTP ${viewerListRes.status}: total=${viewerListRes.body?.pagination?.total ?? viewerListRes.body?.data?.length ?? 'N/A'}`,
  );
  assert(
    'VIEWER can read sales list (200)',
    viewerListRes.status === 200,
    `got ${viewerListRes.status}`,
  );
  console.log();

  // ══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════════════════
  console.log(
    '╔═══════════════════════════════════════════════════╗',
  );
  console.log(
    `║  RBAC RESULTS: ${String(PASS).padEnd(2)} passed, ${String(FAIL).padEnd(2)} failed              ║`,
  );
  console.log(
    '╚═══════════════════════════════════════════════════╝',
  );

  if (FAIL > 0) {
    console.error(`\n${FAIL} RBAC test(s) FAILED`);
    process.exit(1);
  }
}

main().finally(() => p.$disconnect());
