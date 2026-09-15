/**
 * verify-sales-traps.ts — All 8 traps via Node.js (NO PowerShell ternary)
 * Uses Prisma ORM queries only (no raw SQL with UUID params).
 */
import { PrismaClient } from '@prisma/client';
import * as http from 'http';
import Decimal from 'decimal.js';

const p = new PrismaClient();
let PASS = 0, FAIL = 0;

function request(method: string, path: string, body: any, token: string): Promise<{status: number; body: any}> {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const opts: http.RequestOptions = {
      hostname: 'localhost', port: 3001,
      path: `/api/v1${path}`,
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = http.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode!, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode!, body: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const post = (path: string, body: any, token: string) => request('POST', path, body, token);
const get  = (path: string, token: string) => request('GET', path, null, token);

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`);
    PASS++;
  } else {
    console.error(`  ✗ FAIL: ${label}${detail ? ' — ' + detail : ''}`);
    FAIL++;
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   Sales Trap Verification — All 8 Traps     ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // Login
  const loginRes = await post('/auth/login', { username: 'admin', password: 'Admin@123456' }, '');
  const token = loginRes.body?.data?.accessToken;
  if (!token) { console.error('FATAL: Login failed:', JSON.stringify(loginRes.body)); process.exit(1); }
  console.log('✓ Logged in as admin\n');

  // Setup
  const branch = await p.branch.findFirst({ where: { isMain: true } });
  const warehouse = await p.warehouse.findFirst({ where: { branchId: branch!.id, isDefault: true } });
  const branchId = branch!.id;
  const warehouseId = warehouse!.id;

  // ═══════════════════════════════════════════════════════════════════════════
  // TRAP 1 — Sale Atomicity
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('═══ TRAP 1: Sale Atomicity ═══');

  const validStock = await p.productStock.findFirst({
    where: { warehouseId, quantity: { gt: 5 } },
    include: { product: true },
  });

  const saleBefore = await p.sale.count();
  const movBefore = await p.stockMovement.count({ where: { type: 'SALE' } });

  const atomicRes = await post('/sales', {
    branchId,
    items: [
      { productId: validStock!.product.id, quantity: 1, unitPrice: 100 },
      { productId: '00000000-0000-0000-0000-000000000000', quantity: 1, unitPrice: 50 },
    ],
    payments: [{ method: 'CASH', amount: 150 }],
  }, token);

  console.log(`  POST /sales with invalid UUID → HTTP ${atomicRes.status}`);
  console.log(`  Message: ${JSON.stringify(atomicRes.body?.message ?? atomicRes.body?.error ?? '').slice(0, 100)}`);

  const saleAfter = await p.sale.count();
  const movAfter = await p.stockMovement.count({ where: { type: 'SALE' } });

  assert('T1: HTTP 400 on invalid product UUID', atomicRes.status === 400, `got ${atomicRes.status}`);
  assert('T1: No new sale created', saleAfter === saleBefore, `before=${saleBefore} after=${saleAfter}`);
  assert('T1: No new stock movements', movAfter === movBefore, `before=${movBefore} after=${movAfter}`);

  // Orphan check using ORM
  const allSaleItemIds = await p.saleItem.findMany({ select: { saleId: true } });
  const allSaleIds = new Set((await p.sale.findMany({ select: { id: true } })).map(s => s.id));
  const orphans = allSaleItemIds.filter(i => !allSaleIds.has(i.saleId)).length;
  assert('T1: No orphan sale_items', orphans === 0, `orphans=${orphans}`);

  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // TRAP 2 — COGS Weighted Average
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('═══ TRAP 2: COGS Weighted Average ═══');

  // Find product with purchase movements
  const purchaseMvts = await p.stockMovement.groupBy({
    by: ['productId'],
    where: { type: 'PURCHASE', warehouseId, unitCost: { not: null } },
    _sum: { quantity: true, totalCost: true },
    _count: { id: true },
    having: { quantity: { _sum: { gt: 5 } } },
  });

  if (purchaseMvts.length > 0) {
    const pm = purchaseMvts[0];
    const totalValue = new Decimal(pm._sum.totalCost?.toString() ?? '0');
    const totalQty = new Decimal(pm._sum.quantity?.toString() ?? '0');
    const wac = totalValue.dividedBy(totalQty);
    console.log(`  Product: ${pm.productId}`);
    console.log(`  Total purchase value: ${totalValue.toFixed(2)}, Total qty: ${totalQty.toFixed(2)}`);
    console.log(`  Expected WAC: ${wac.toFixed(4)}`);

    const prod = await p.product.findUnique({ where: { id: pm.productId }, select: { sellingPrice: true } });
    const salePrice = Number(prod!.sellingPrice);

    const saleRes = await post('/sales', {
      branchId,
      items: [{ productId: pm.productId, quantity: 1, unitPrice: salePrice }],
      payments: [{ method: 'CASH', amount: salePrice }],
    }, token);

    assert('T2: Sale created successfully', [200, 201].includes(saleRes.status), `got ${saleRes.status}`);

    if (saleRes.body?.data?.id) {
      const saleId = saleRes.body.data.id;

      // Check COGS via ORM: find journal entry with COGS debit
      const cogsAccount = await p.account.findFirst({ where: { subType: 'COST_OF_GOODS_SOLD', isSystem: true } });
      if (cogsAccount) {
        const cogsLine = await p.journalLine.findFirst({
          where: {
            debitAccountId: cogsAccount.id,
            journalEntry: { saleId },
          },
        });
        if (cogsLine) {
          const actualCOGS = new Decimal(cogsLine.amount.toString());
          const expectedCOGS = wac.times(1);
          const diff = actualCOGS.minus(expectedCOGS).abs();
          console.log(`  Actual COGS: ${actualCOGS.toFixed(4)}, Expected COGS (WAC×1): ${expectedCOGS.toFixed(4)}, Diff: ${diff.toFixed(4)}`);
          assert('T2: COGS = WAC × quantity (within ৳0.01)', diff.lessThan(new Decimal('0.01')), `actual=${actualCOGS.toFixed(4)} expected=${expectedCOGS.toFixed(4)}`);

          // Dr = Cr check
          const allLines = await p.journalLine.findMany({ where: { journalEntry: { saleId } } });
          const totalDr = allLines.filter(l => l.debitAccountId).reduce((s, l) => s.plus(new Decimal(l.amount.toString())), new Decimal(0));
          const totalCr = allLines.filter(l => l.creditAccountId).reduce((s, l) => s.plus(new Decimal(l.amount.toString())), new Decimal(0));
          console.log(`  Journal totals: Dr=${totalDr.toFixed(2)} Cr=${totalCr.toFixed(2)}`);
          assert('T2: All journals balanced (Dr=Cr)', totalDr.equals(totalCr), `Dr=${totalDr} Cr=${totalCr}`);
        } else {
          assert('T2: COGS journal line exists', false, 'No COGS line found');
        }
      }
    }
  } else {
    console.log('  ⚠ No product with purchase history — simulating with available product');
    const sp = await p.productStock.findFirst({ where: { warehouseId, quantity: { gt: 1 } }, include: { product: true } });
    if (sp) {
      const saleRes = await post('/sales', {
        branchId,
        items: [{ productId: sp.product.id, quantity: 1, unitPrice: Number(sp.product.sellingPrice) }],
        payments: [{ method: 'CASH', amount: Number(sp.product.sellingPrice) }],
      }, token);
      assert('T2: Sale with COGS created', [200, 201].includes(saleRes.status), `got ${saleRes.status}`);
      if (saleRes.body?.data?.id) {
        const allLines = await p.journalLine.findMany({ where: { journalEntry: { saleId: saleRes.body.data.id } } });
        const dr = allLines.filter(l => l.debitAccountId).reduce((s, l) => s.plus(new Decimal(l.amount.toString())), new Decimal(0));
        const cr = allLines.filter(l => l.creditAccountId).reduce((s, l) => s.plus(new Decimal(l.amount.toString())), new Decimal(0));
        console.log(`  Journal Dr=${dr.toFixed(2)} Cr=${cr.toFixed(2)}`);
        assert('T2: Journal balanced', dr.equals(cr), `Dr=${dr} Cr=${cr}`);
      }
    }
  }
  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // TRAP 3 — Negative Stock Block
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('═══ TRAP 3: Negative Stock Block ═══');

  const testStock = await p.productStock.findFirst({
    where: { warehouseId, quantity: { gt: 0 } },
    include: { product: true },
    orderBy: { quantity: 'asc' },
  });

  if (testStock) {
    const currentQty = Number(testStock.quantity);
    const oversell = currentQty + 999;

    const negRes = await post('/sales', {
      branchId,
      items: [{ productId: testStock.product.id, quantity: oversell, unitPrice: Number(testStock.product.sellingPrice) }],
      payments: [{ method: 'CASH', amount: oversell * Number(testStock.product.sellingPrice) }],
    }, token);

    console.log(`  POST /sales qty=${oversell} (stock=${currentQty}) → HTTP ${negRes.status}`);
    console.log(`  Message: ${JSON.stringify(negRes.body?.message ?? negRes.body?.error ?? '').slice(0, 120)}`);

    assert('T3: Oversell blocked with HTTP 400', negRes.status === 400, `got ${negRes.status}`);

    const stockAfter = await p.productStock.findFirst({ where: { productId: testStock.product.id, warehouseId } });
    const afterQty = Number(stockAfter!.quantity);
    assert('T3: Stock unchanged after blocked sale', afterQty === currentQty, `before=${currentQty} after=${afterQty}`);
    console.log(`  SQL: SELECT quantity FROM product_stocks WHERE product_id='${testStock.product.id}' → ${afterQty}`);
  }
  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // TRAP 4 — Mixed Payment
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('═══ TRAP 4: Mixed Payment (Cash 500 + bKash 300 + Due 200 = 1000) ═══');

  const mixedStock = await p.productStock.findFirst({
    where: { warehouseId, quantity: { gte: 10 } },
    include: { product: true },
  });

  const custRes = await post('/customers/quick', { name: 'Mixed Pay Test', phone: '01700099001' }, token);
  const customerId = custRes.body?.data?.id;

  if (mixedStock) {
    const mixedRes = await post('/sales', {
      branchId,
      customerId,
      items: [{ productId: mixedStock.product.id, quantity: 10, unitPrice: 100 }],
      payments: [
        { method: 'CASH',  amount: 500 },
        { method: 'BKASH', amount: 300 },
        { method: 'DUE',   amount: 200 },
      ],
    }, token);

    console.log(`  HTTP ${mixedRes.status}: invoice=${mixedRes.body?.data?.invoiceNumber}`);
    assert('T4: Mixed sale created', [200, 201].includes(mixedRes.status), `got ${mixedRes.status}`);

    if (mixedRes.body?.data?.id) {
      const saleId = mixedRes.body.data.id;
      const payments = await p.customerPayment.findMany({ where: { saleId } });
      assert('T4: 3 payment records', payments.length === 3, `got ${payments.length}`);

      const cashP = payments.find(x => x.method === 'CASH');
      const bkashP = payments.find(x => x.method === 'BKASH');
      const dueP = payments.find(x => x.method === 'DUE');
      console.log(`  Payments: CASH=${cashP?.amount} BKASH=${bkashP?.amount} DUE=${dueP?.amount}`);
      assert('T4: CASH = 500', cashP && new Decimal(cashP.amount.toString()).equals(500), `${cashP?.amount}`);
      assert('T4: BKASH = 300', bkashP && new Decimal(bkashP.amount.toString()).equals(300), `${bkashP?.amount}`);
      assert('T4: DUE = 200', dueP && new Decimal(dueP.amount.toString()).equals(200), `${dueP?.amount}`);

      // Journal balance — SALE journal only (not COGS)
      const jLines = await p.journalLine.findMany({ where: { journalEntry: { saleId, type: 'SALE' } } });
      const jEntriesForSale = await p.journalEntry.findMany({ where: { saleId, type: 'SALE' }, include: { lines: true } });
      // Find the revenue journal (the one with Cr = Sales Revenue, not COGS)
      const revAccount = await p.account.findFirst({ where: { subType: 'SALES_REVENUE', isSystem: true } });
      const revenueJournal = jEntriesForSale.find(je =>
        je.lines.some(l => l.creditAccountId === revAccount?.id)
      );
      const rLines = revenueJournal?.lines ?? [];
      const dr = rLines.filter(l => l.debitAccountId).reduce((s, l) => s.plus(new Decimal(l.amount.toString())), new Decimal(0));
      const cr = rLines.filter(l => l.creditAccountId).reduce((s, l) => s.plus(new Decimal(l.amount.toString())), new Decimal(0));
      console.log(`  Revenue Journal: Dr=${dr.toFixed(2)} Cr=${cr.toFixed(2)}`);
      assert('T4: Revenue Dr = 1000', dr.equals(1000), `Dr=${dr}`);
      assert('T4: Revenue Cr = 1000', cr.equals(1000), `Cr=${cr}`);
      assert('T4: Dr = Cr (balanced)', dr.equals(cr), `Dr=${dr} Cr=${cr}`);

      // Customer AR
      if (customerId) {
        const cust = await p.customer.findUnique({ where: { id: customerId } });
        const balance = new Decimal(cust!.currentBalance.toString());
        console.log(`  Customer AR: ${balance.toFixed(2)}`);
        assert('T4: Customer AR = 200', balance.equals(200), `balance=${balance}`);
      }
    }
  } else {
    assert('T4: SKIPPED — no product with qty >= 10', false, 'No suitable product');
  }
  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // TRAP 5 — Sale Void Reversal
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('═══ TRAP 5: Sale Void Reversal ═══');

  const voidStock = await p.productStock.findFirst({
    where: { warehouseId, quantity: { gte: 2 } },
    include: { product: true },
  });

  if (voidStock) {
    const stockBefore = new Decimal(voidStock.quantity.toString());
    const saleAmt = Number(voidStock.product.sellingPrice);

    const voidSaleRes = await post('/sales', {
      branchId,
      items: [{ productId: voidStock.product.id, quantity: 1, unitPrice: saleAmt }],
      payments: [{ method: 'CASH', amount: saleAmt }],
    }, token);

    assert('T5: Cash sale created for void test', [200, 201].includes(voidSaleRes.status), `got ${voidSaleRes.status}`);
    const saleId = voidSaleRes.body?.data?.id;

    if (saleId) {
      const stockMid = await p.productStock.findFirst({ where: { productId: voidStock.product.id, warehouseId } });
      assert('T5: Stock decreased by 1', new Decimal(stockMid!.quantity.toString()).equals(stockBefore.minus(1)), `mid=${stockMid?.quantity}`);

      const origJournalsBefore = await p.journalEntry.count({ where: { saleId } });

      const voidRes = await post(`/sales/${saleId}/void`, { reason: 'customer changed mind' }, token);
      assert('T5: Void returns HTTP 200', voidRes.status === 200, `got ${voidRes.status}`);

      const sale = await p.sale.findUnique({ where: { id: saleId } });
      assert('T5: status = CANCELLED', sale?.status === 'CANCELLED', `${sale?.status}`);
      assert('T5: isVoided = true', sale?.isVoided === true, `${sale?.isVoided}`);
      assert('T5: voidReason set', sale?.voidReason === 'customer changed mind', `${sale?.voidReason}`);
      assert('T5: voidedAt set', sale?.voidedAt !== null, `${sale?.voidedAt}`);

      const origJournalsAfter = await p.journalEntry.count({ where: { saleId, isVoided: false } });
      assert('T5: Original journals still exist', origJournalsAfter >= origJournalsBefore, `before=${origJournalsBefore} after=${origJournalsAfter}`);

      const reversalJournals = await p.journalEntry.findMany({ where: { saleId, type: 'VOID' } });
      assert('T5: Reversal journal created', reversalJournals.length >= 1, `reversals=${reversalJournals.length}`);

      if (reversalJournals.length > 0) {
        const revLines = await p.journalLine.findMany({ where: { journalEntryId: reversalJournals[0].id } });
        const rDr = revLines.filter(l => l.debitAccountId).reduce((s, l) => s.plus(new Decimal(l.amount.toString())), new Decimal(0));
        const rCr = revLines.filter(l => l.creditAccountId).reduce((s, l) => s.plus(new Decimal(l.amount.toString())), new Decimal(0));
        console.log(`  Reversal journal: Dr=${rDr.toFixed(2)} Cr=${rCr.toFixed(2)}`);
        assert('T5: Reversal journal balanced', rDr.equals(rCr), `Dr=${rDr} Cr=${rCr}`);
      }

      const stockAfter = await p.productStock.findFirst({ where: { productId: voidStock.product.id, warehouseId } });
      console.log(`  Stock: before=${stockBefore} after=${stockAfter?.quantity}`);
      assert('T5: Stock restored after void', new Decimal(stockAfter!.quantity.toString()).equals(stockBefore), `after=${stockAfter?.quantity}`);

      const auditLog = await p.auditLog.findFirst({
        where: { tableName: 'sales', recordId: saleId, action: 'VOID' },
      });
      assert('T5: Audit log VOID created', auditLog !== null, `${JSON.stringify(auditLog?.action)}`);
    }
  }
  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // TRAP 6 — Concurrent Sale Race Condition
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('═══ TRAP 6: Concurrent Sale Race (stock=1, 2 parallel sales) ═══');

  const raceStock = await p.productStock.findFirst({
    where: { warehouseId, quantity: { gte: 1 } },
    include: { product: true },
    orderBy: { quantity: 'asc' },
  });

  if (raceStock) {
    // Force stock to exactly 1
    await p.productStock.update({
      where: { productId_warehouseId: { productId: raceStock.product.id, warehouseId } },
      data: { quantity: 1 },
    });
    console.log(`  Set product ${raceStock.product.name} stock = 1`);

    const salePrice = Number(raceStock.product.sellingPrice);
    const [r1, r2] = await Promise.all([
      post('/sales', {
        branchId,
        items: [{ productId: raceStock.product.id, quantity: 1, unitPrice: salePrice }],
        payments: [{ method: 'CASH', amount: salePrice }],
      }, token),
      post('/sales', {
        branchId,
        items: [{ productId: raceStock.product.id, quantity: 1, unitPrice: salePrice }],
        payments: [{ method: 'CASH', amount: salePrice }],
      }, token),
    ]);

    console.log(`  Concurrent results: [HTTP ${r1.status}, HTTP ${r2.status}]`);
    const statuses = [r1.status, r2.status];
    const successes = statuses.filter(s => s === 200 || s === 201).length;
    const failures = statuses.filter(s => s === 400 || s === 409 || s >= 500).length;
    assert('T6: Exactly 1 succeeded', successes === 1, `successes=${successes} [${r1.status},${r2.status}]`);
    assert('T6: Exactly 1 failed (stock protection)', failures === 1, `failures=${failures}`);

    const finalStock = await p.productStock.findFirst({ where: { productId: raceStock.product.id, warehouseId } });
    console.log(`  Final stock: ${finalStock?.quantity}`);
    assert('T6: Final stock = 0 (not negative)', new Decimal(finalStock!.quantity.toString()).equals(0), `qty=${finalStock?.quantity}`);
  }
  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // TRAP 7 — Receipt HTML 80mm + Bangla
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('═══ TRAP 7: Receipt HTML (80mm + Bangla labels) ═══');

  const completedSale = await p.sale.findFirst({
    where: { status: 'COMPLETED', isVoided: false },
    orderBy: { createdAt: 'desc' },
  });

  if (completedSale) {
    console.log(`  Sale: ${completedSale.invoiceNumber}`);

    const htmlRes = await get(`/sales/receipt/${completedSale.id}/html`, token);
    console.log(`  GET /sales/receipt/${completedSale.id}/html → HTTP ${htmlRes.status}`);
    assert('T7: HTML returns HTTP 200', htmlRes.status === 200, `got ${htmlRes.status}`);

    const html = typeof htmlRes.body === 'string' ? htmlRes.body : JSON.stringify(htmlRes.body);
    assert('T7: HTML has @page 80mm', html.includes('80mm'), `missing 80mm CSS`);
    assert('T7: HTML has invoice number', html.includes(completedSale.invoiceNumber), `missing ${completedSale.invoiceNumber}`);
    assert('T7: HTML has business name (Bangla or EN)', html.includes('Barakah') || html.includes('বারাকাহ'), `missing name`);
    assert('T7: HTML has মোট/Total', html.includes('মোট') || html.includes('Total'), `missing total`);
    assert('T7: HTML has পরিশোধিত/Paid', html.includes('পরিশোধিত') || html.includes('Paid'), `missing paid`);
    // বাকি only shown if dueAmount > 0; check either present or sale has no due
    const hasDue = new Decimal(completedSale.dueAmount.toString()).greaterThan(0);
    const hasDueInHtml = html.includes('বাকি') || html.includes('Due');
    assert('T7: HTML has বাকি/Due (or sale has zero due)', hasDueInHtml || !hasDue, `hasDue=${hasDue} inHtml=${hasDueInHtml}`);
    assert('T7: HTML has print button', html.toLowerCase().includes('print'), `missing print`);

    console.log(`  HTML snippet (first 300 chars): ${html.slice(0, 300)}`);

    const pdfRes = await get(`/sales/receipt/${completedSale.id}/pdf`, token);
    console.log(`  GET /sales/receipt/${completedSale.id}/pdf → HTTP ${pdfRes.status}`);
    assert('T7: PDF returns HTTP 200', pdfRes.status === 200, `got ${pdfRes.status}`);
  } else {
    assert('T7: No completed sale', false, 'Create a sale first');
  }
  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // TRAP 8 — Cash Register Closing
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('═══ TRAP 8: Cash Register (open ৳5000, sales ৳500, refund ৳100, expense ৳150, close actual ৳5250) ═══');

  const openRes = await post('/cash-register/open', {
    branchId,
    name: 'Trap8 Register',
    openingBalance: 5000,
    notes: 'Trap 8 verification',
  }, token);

  const httpOk = [200, 201].includes(openRes.status);
  console.log(`  POST /cash-register/open → HTTP ${openRes.status}`);
  if (!httpOk) {
    console.log(`  Error: ${JSON.stringify(openRes.body?.message ?? openRes.body?.error)}`);
    assert('T8: Register opened', false, `got ${openRes.status}`);
  } else {
    assert('T8: Register opened (200/201)', true, `id=${openRes.body?.data?.id}`);
    const registerId = openRes.body.data.id;

    // Simulate cash sales
    await p.cashRegister.update({ where: { id: registerId }, data: { cashSales: '500.00' } });

    // Simulate cash refund
    await p.cashRegister.update({ where: { id: registerId }, data: { cashRefunds: '100.00' } });

    // Add expense
    const expRes = await post(`/cash-register/${registerId}/expense`, { amount: 150, description: 'Test expense' }, token);
    console.log(`  POST expense → HTTP ${expRes.status}`);
    assert('T8: Expense added', [200, 201].includes(expRes.status), `got ${expRes.status}`);

    // Close with actual = 5250
    // Expected = 5000 + 500 - 100 - 150 + 0 = 5250
    const closeRes = await post(`/cash-register/${registerId}/close`, { actualCash: 5250, notes: 'Closing' }, token);
    console.log(`  POST /cash-register/${registerId}/close → HTTP ${closeRes.status}`);
    assert('T8: Register closed', [200, 201].includes(closeRes.status), `got ${closeRes.status}`);

    // Verify via ORM
    const reg = await p.cashRegister.findUnique({ where: { id: registerId } });
    console.log(`  SQL: opening=${reg?.openingBalance} cashSales=${reg?.cashSales} cashRefunds=${reg?.cashRefunds} cashExpenses=${reg?.cashExpenses}`);
    console.log(`  SQL: expected=${reg?.expectedCash} actual=${reg?.actualCash} difference=${reg?.difference} status=${reg?.status}`);

    assert('T8: Opening balance = 5000', new Decimal(reg!.openingBalance.toString()).equals(5000), `got ${reg?.openingBalance}`);
    assert('T8: Expected cash = 5250 (5000+500-100-150)', new Decimal(reg!.expectedCash!.toString()).equals(5250), `got ${reg?.expectedCash}`);
    assert('T8: Actual cash = 5250', new Decimal(reg!.actualCash!.toString()).equals(5250), `got ${reg?.actualCash}`);
    assert('T8: Difference = 0', new Decimal(reg!.difference!.toString()).equals(0), `got ${reg?.difference}`);
    assert('T8: Status = CLOSED', reg!.status === 'CLOSED', `got ${reg?.status}`);
  }
  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('╔══════════════════════════════════════════════════╗');
  console.log(`║  RESULTS: ${String(PASS).padEnd(2)} passed, ${String(FAIL).padEnd(2)} failed                 ║`);
  console.log('╚══════════════════════════════════════════════════╝');

  if (FAIL > 0) {
    console.error(`\n${FAIL} TRAP(S) FAILED — fix before deploying`);
    process.exit(1);
  }
}

main().finally(() => p.$disconnect());
