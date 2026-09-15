/**
 * RBAC Boundary Test — 4 roles
 * Run: npx ts-node --transpile-only scripts/verify-rbac.ts
 */
import axios, { AxiosInstance } from 'axios';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const API = process.env.API_URL || 'http://localhost:3001/api/v1';
const prisma = new PrismaClient();

async function createTestUser(roleName: string, branch: any): Promise<{ token: string; userId: string }> {
  const role = await prisma.role.findUnique({ where: { name: roleName } });
  if (!role) throw new Error(`Role ${roleName} not found`);
  const hash = await bcrypt.hash('Test@123456', 10);
  const ts = Date.now();
  const user = await prisma.user.create({
    data: {
      username: `rbac_${roleName.toLowerCase()}_${ts}`,
      email: `rbac_${roleName.toLowerCase()}_${ts}@test.com`,
      passwordHash: hash,
      firstName: `RBAC`,
      lastName: roleName,
      status: 'ACTIVE',
    },
  });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id, branchId: branch.id } });

  const loginResp = await axios.post(`${API}/auth/login`, {
    username: user.username, password: 'Test@123456',
  });
  return { token: loginResp.data.data.accessToken, userId: user.id };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function check(
  label: string,
  fn: () => Promise<any>,
  expectedStatus: number,
) {
  try {
    const r = await fn();
    const actual = r.status ?? 200;
    const passed = actual === expectedStatus;
    console.log(`  ${passed ? '✅' : '❌'} ${label}: HTTP ${actual} [expected ${expectedStatus}]`);
    return passed;
  } catch (err: any) {
    const actual = err.response?.status ?? 0;
    const passed = actual === expectedStatus;
    console.log(`  ${passed ? '✅' : '❌'} ${label}: HTTP ${actual} [expected ${expectedStatus}]`);
    return passed;
  }
}

async function main() {
  console.log('\n════════════════════════════════════════════════════');
  console.log(' TEST 5: RBAC BOUNDARY VERIFICATION');
  console.log('════════════════════════════════════════════════════\n');

  const branch = await prisma.branch.findFirst({ where: { code: 'MAIN' } });
  if (!branch) throw new Error('Branch not found');

  // Get valid IDs from existing data
  const purchase = await prisma.purchase.findFirst({
    where: { status: 'RECEIVED' },
    include: { items: { take: 1 } },
  });
  const supplier = await prisma.supplier.findFirst({ where: { deletedAt: null } });
  const product  = await prisma.product.findFirst({ where: { deletedAt: null } });
  if (!purchase || !supplier || !product) throw new Error('Test data missing');

  const purchaseId = purchase.id;
  const supplierId = supplier.id;
  const branchId   = branch.id;
  const productId  = product.id;

  const purchasePayload = JSON.stringify({
    supplierId, branchId, receiveImmediately: false,
    items: [{ productId, quantity: 1, unitCost: 10 }],
  });
  const paymentPayload = JSON.stringify({ method: 'CASH', amount: 1 });

  const users: Record<string, { token: string; userId: string }> = {};
  const cleanupUserIds: string[] = [];

  const roles = ['CASHIER', 'INVENTORY_STAFF', 'ACCOUNTANT', 'VIEWER'];
  for (const role of roles) {
    console.log(`Creating test user: ${role}...`);
    const u = await createTestUser(role, branch);
    users[role] = u;
    cleanupUserIds.push(u.userId);
  }

  console.log('\n─────────────────────────────────────────────────────');
  console.log('CASHIER tests:');
  const cashierResults = [
    await check(
      'CASHIER → POST /purchases [should be 403]',
      () => axios.post(`${API}/purchases`, purchasePayload, { headers: auth(users.CASHIER.token), validateStatus: () => true }),
      403,
    ),
    await check(
      'CASHIER → GET  /purchases [should be 403]',
      () => axios.get(`${API}/purchases`, { headers: auth(users.CASHIER.token), validateStatus: () => true }),
      403,
    ),
  ];

  console.log('\n─────────────────────────────────────────────────────');
  console.log('INVENTORY_STAFF tests:');
  const invResults = [
    await check(
      'INVENTORY_STAFF → POST /purchases [should be 201]',
      () => axios.post(`${API}/purchases`, purchasePayload, { headers: auth(users.INVENTORY_STAFF.token), validateStatus: () => true }),
      201,
    ),
    await check(
      'INVENTORY_STAFF → GET  /purchases [should be 200]',
      () => axios.get(`${API}/purchases`, { headers: auth(users.INVENTORY_STAFF.token), validateStatus: () => true }),
      200,
    ),
    await check(
      'INVENTORY_STAFF → GET  /suppliers [should be 200]',
      () => axios.get(`${API}/suppliers`, { headers: auth(users.INVENTORY_STAFF.token), validateStatus: () => true }),
      200,
    ),
  ];

  console.log('\n─────────────────────────────────────────────────────');
  console.log('ACCOUNTANT tests:');
  const accResults = [
    await check(
      'ACCOUNTANT → POST /purchases [should be 403]',
      () => axios.post(`${API}/purchases`, purchasePayload, { headers: auth(users.ACCOUNTANT.token), validateStatus: () => true }),
      403,
    ),
    await check(
      'ACCOUNTANT → GET  /purchases [should be 200]',
      () => axios.get(`${API}/purchases`, { headers: auth(users.ACCOUNTANT.token), validateStatus: () => true }),
      200,
    ),
    await check(
      `ACCOUNTANT → POST /purchases/${purchaseId}/payment [should be 403 — no purchases:update]`,
      () => axios.post(`${API}/purchases/${purchaseId}/payment`, paymentPayload, { headers: auth(users.ACCOUNTANT.token), validateStatus: () => true }),
      403,
    ),
  ];

  console.log('\n─────────────────────────────────────────────────────');
  console.log('VIEWER tests:');
  const viewerResults = [
    await check(
      'VIEWER → POST /purchases [should be 403]',
      () => axios.post(`${API}/purchases`, purchasePayload, { headers: auth(users.VIEWER.token), validateStatus: () => true }),
      403,
    ),
    await check(
      'VIEWER → GET  /purchases [should be 200]',
      () => axios.get(`${API}/purchases`, { headers: auth(users.VIEWER.token), validateStatus: () => true }),
      200,
    ),
    await check(
      'VIEWER → GET  /suppliers [should be 200]',
      () => axios.get(`${API}/suppliers`, { headers: auth(users.VIEWER.token), validateStatus: () => true }),
      200,
    ),
    await check(
      'VIEWER → PATCH /suppliers/:id [should be 403]',
      () => axios.patch(`${API}/suppliers/${supplierId}`, '{"name":"hacked"}', { headers: auth(users.VIEWER.token), validateStatus: () => true }),
      403,
    ),
  ];

  const allResults = [...cashierResults, ...invResults, ...accResults, ...viewerResults];
  const passed = allResults.filter(Boolean).length;
  const total  = allResults.length;

  console.log(`\n════════════════════════════════════════════════════`);
  console.log(` RBAC RESULT: ${passed}/${total} passed ${passed === total ? '✅ ALL PASSED' : '❌ SOME FAILED'}`);
  console.log(`════════════════════════════════════════════════════\n`);

  // Cleanup
  console.log('Cleaning up test users...');
  for (const userId of cleanupUserIds) {
    await prisma.userRole.deleteMany({ where: { userId } });
    await prisma.refreshToken.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  }

  // Clean up purchases created by test inventory user
  const invUserId = users.INVENTORY_STAFF.userId;
  const testPurchases = await prisma.purchase.findMany({ where: { createdBy: invUserId } });
  for (const p of testPurchases) {
    await prisma.purchaseItem.deleteMany({ where: { purchaseId: p.id } });
    await prisma.purchase.delete({ where: { id: p.id } });
  }
  console.log('Cleanup done.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
