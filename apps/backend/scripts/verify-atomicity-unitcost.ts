/**
 * Tests:
 *  1. Transaction atomicity: invalid productId → rollback
 *  2. Unit cost immutability: purchase_items.unit_cost unchanged after product update
 *
 * Run: npx ts-node --transpile-only scripts/verify-atomicity-unitcost.ts
 */
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import Decimal from 'decimal.js';

const API = process.env.API_URL || 'http://localhost:3001/api/v1';
const prisma = new PrismaClient();

async function login() {
  const r = await axios.post(`${API}/auth/login`, { username: 'admin', password: 'Admin@123456' });
  return r.data.data.accessToken as string;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function main() {
  const token = await login();
  const headers = authHeaders(token);

  // ── Setup: get valid IDs ──────────────────────────────────────────────────
  const branchRes = await axios.get(`${API}/purchases/stats`, { headers });
  // Get branch & supplier from existing purchase
  const pList = await axios.get(`${API}/purchases?limit=1`, { headers });
  const existingPurchase = await axios.get(`${API}/purchases/${pList.data.data[0].id}`, { headers });
  const branchId   = existingPurchase.data.data.branchId;
  const supplierId = existingPurchase.data.data.supplierId;
  const validProdId = existingPurchase.data.data.items[0].productId;
  const validPurchaseItemId = existingPurchase.data.data.items[0].id;

  console.log(`\n════════════════════════════════════════════════════`);
  console.log(` TEST 3: TRANSACTION ATOMICITY`);
  console.log(`════════════════════════════════════════════════════\n`);

  // Count purchases before
  const countBefore = await prisma.purchase.count();
  const moveBefore  = await prisma.stockMovement.count();
  console.log(`Purchases before:        ${countBefore}`);
  console.log(`Stock movements before:  ${moveBefore}`);

  // Try to create a purchase with one valid + one invalid productId
  const INVALID_UUID = '00000000-0000-0000-0000-000000000000';
  let atomicityPassed = false;
  try {
    await axios.post(
      `${API}/purchases`,
      {
        supplierId,
        branchId,
        receiveImmediately: true,
        items: [
          { productId: validProdId,   quantity: 1, unitCost: 10 },  // valid
          { productId: INVALID_UUID,  quantity: 1, unitCost: 10 },  // INVALID
        ],
      },
      { headers },
    );
    console.log('❌ Request succeeded unexpectedly — atomicity may be broken!');
  } catch (err: any) {
    const status = err.response?.status;
    const msg    = err.response?.data?.message ?? err.message;
    console.log(`✅ Request rejected with HTTP ${status}: ${msg}`);
    atomicityPassed = true;
  }

  // Count after — must be unchanged
  const countAfter = await prisma.purchase.count();
  const moveAfter  = await prisma.stockMovement.count();

  console.log(`\nPurchases after:         ${countAfter}  (was: ${countBefore})`);
  console.log(`Stock movements after:   ${moveAfter}  (was: ${moveBefore})`);

  const noPurchaseCreated = countAfter === countBefore;
  const noMovementCreated = moveAfter === moveBefore;

  console.log(`\nNo partial purchase created:  ${noPurchaseCreated ? '✅' : '❌ FAIL'}`);
  console.log(`No orphan stock movement:     ${noMovementCreated ? '✅' : '❌ FAIL'}`);
  console.log(`\nATOMICITY RESULT: ${atomicityPassed && noPurchaseCreated && noMovementCreated ? '✅ PASSED' : '❌ FAILED'}`);

  // ── TEST 4: UNIT COST IMMUTABILITY ────────────────────────────────────────
  console.log(`\n════════════════════════════════════════════════════`);
  console.log(` TEST 4: UNIT COST IMMUTABILITY`);
  console.log(`════════════════════════════════════════════════════\n`);

  // Read current purchase item unit_cost and product cost_price
  const purchaseItemBefore = await prisma.purchaseItem.findUnique({
    where: { id: validPurchaseItemId },
    select: { id: true, unitCost: true, product: { select: { id: true, name: true, costPrice: true } } },
  });

  console.log(`Product:       ${purchaseItemBefore!.product.name}`);
  console.log(`product.costPrice (before update): ${purchaseItemBefore!.product.costPrice}`);
  console.log(`purchase_item.unit_cost (before):  ${purchaseItemBefore!.unitCost}`);

  const originalUnitCost = new Decimal(purchaseItemBefore!.unitCost.toString());
  const newPrice = 9999;

  // Update product cost price via API
  await axios.patch(
    `${API}/products/${purchaseItemBefore!.product.id}`,
    { costPrice: newPrice },
    { headers },
  );

  // Read back
  const purchaseItemAfter = await prisma.purchaseItem.findUnique({
    where: { id: validPurchaseItemId },
    select: { unitCost: true, product: { select: { costPrice: true } } },
  });

  const afterUnitCost  = new Decimal(purchaseItemAfter!.unitCost.toString());
  const afterCostPrice = new Decimal(purchaseItemAfter!.product.costPrice.toString());

  console.log(`\nproduct.costPrice (after update):  ${afterCostPrice}  [expected: ${newPrice}]`);
  console.log(`purchase_item.unit_cost (after):   ${afterUnitCost}  [expected: ${originalUnitCost} unchanged]`);

  const costPriceUpdated = afterCostPrice.equals(new Decimal(newPrice));
  const unitCostUnchanged = afterUnitCost.equals(originalUnitCost);

  console.log(`\nproduct.costPrice updated:    ${costPriceUpdated ? '✅' : '❌ FAIL'}`);
  console.log(`purchase_item.unit_cost IMMUTABLE: ${unitCostUnchanged ? '✅' : '❌ FAIL — historical cost was mutated!'}`);

  console.log(`\nUNIT COST IMMUTABILITY RESULT: ${costPriceUpdated && unitCostUnchanged ? '✅ PASSED' : '❌ FAILED'}`);

  // Restore product price (cleanup)
  await axios.patch(
    `${API}/products/${purchaseItemBefore!.product.id}`,
    { costPrice: parseFloat(originalUnitCost.toFixed(4)) },
    { headers },
  );
  console.log(`\n(Product cost restored to ${originalUnitCost.toFixed(4)})`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
