/**
 * Fix seeded journal entries to match new accounting model:
 *  - Purchase journals: Dr Inventory / Cr AP (full amount)
 *  - Payment journals: Dr AP / Cr correct payment account
 *
 * Run: npx ts-node --transpile-only scripts/fix-seed-journals.ts
 */
import { PrismaClient } from '@prisma/client';
import Decimal from 'decimal.js';
const prisma = new PrismaClient();

async function main() {
  console.log('Fixing seeded journal entries for correct account routing...\n');

  // ── Account lookup ───────────────────────────────────────────────────────
  const inv  = await prisma.account.findFirst({ where: { subType: 'INVENTORY', isSystem: true } });
  const ap   = await prisma.account.findFirst({ where: { subType: 'ACCOUNTS_PAYABLE', isSystem: true } });
  const cash = await prisma.account.findFirst({ where: { code: '1010' } })
            ?? await prisma.account.findFirst({ where: { code: '1000' } });
  const bkash  = await prisma.account.findUnique({ where: { code: '1021' } });
  const nagad  = await prisma.account.findUnique({ where: { code: '1022' } });
  const bank   = await prisma.account.findUnique({ where: { code: '1020' } });

  if (!inv || !ap || !cash) { console.error('Required accounts missing'); return; }

  console.log(`Inventory: ${inv.code} ${inv.name}`);
  console.log(`AP:        ${ap.code}  ${ap.name}`);
  console.log(`Cash:      ${cash.code} ${cash.name}`);
  console.log(`bKash:     ${bkash?.code} ${bkash?.name}`);
  console.log(`Nagad:     ${nagad?.code} ${nagad?.name}`);
  console.log(`Bank:      ${bank?.code}  ${bank?.name}\n`);

  // Reset all account balances to 0, then recompute from scratch
  await prisma.account.updateMany({
    where: { isSystem: false, code: { in: ['1020','1021','1022','1023','1024','1025','1030'] } },
    data: { currentBalance: 0 },
  });

  // ── Delete ALL old journal entries and lines ──────────────────────────────
  console.log('Removing old journal entries...');
  const old = await prisma.journalEntry.findMany({ select: { id: true, entryNumber: true } });
  for (const je of old) {
    await prisma.journalLine.deleteMany({ where: { journalEntryId: je.id } });
  }
  await prisma.journalEntry.deleteMany({});
  console.log(`  Deleted ${old.length} old entries.\n`);

  // Reset sequence
  await prisma.numberingSequence.update({ where: { module: 'journal_entry' }, data: { currentNo: 0 } });

  // ── Reset account balances ────────────────────────────────────────────────
  await prisma.account.updateMany({ data: { currentBalance: 0 } });

  // ── Re-seed journal entries correctly ─────────────────────────────────────
  const purchases = await prisma.purchase.findMany({
    where: { isVoided: false },
    orderBy: { purchaseDate: 'asc' },
    include: { payments: { where: { isVoided: false }, orderBy: { paymentDate: 'asc' } } },
  });

  let jeNo = 0;
  function nextJE() { jeNo++; return `JE-${String(jeNo).padStart(6,'0')}`; }

  async function applyBalance(accountId: string, debitAmt: Decimal, creditAmt: Decimal) {
    const acc = await prisma.account.findUnique({ where: { id: accountId } });
    if (!acc) return;
    const normalDebit = ['ASSET','EXPENSE'].includes(acc.type);
    let delta = normalDebit
      ? debitAmt.minus(creditAmt)
      : creditAmt.minus(debitAmt);
    if (!delta.isZero()) {
      await prisma.account.update({
        where: { id: accountId },
        data: { currentBalance: { increment: parseFloat(delta.toFixed(2)) } },
      });
    }
  }

  for (const p of purchases) {
    const total  = new Decimal(p.totalAmount.toString());
    const paid   = new Decimal(p.paidAmount.toString());

    // ── PURCHASE journal: Dr Inventory / Cr AP (full amount) ────────────
    const jeNum1 = nextJE();
    await prisma.journalEntry.create({
      data: {
        entryNumber: jeNum1,
        entryDate: p.purchaseDate,
        type: 'PURCHASE', status: 'POSTED',
        description: `Purchase - ${p.invoiceNumber}`,
        totalDebit: total.toFixed(2), totalCredit: total.toFixed(2),
        purchaseId: p.id,
        lines: {
          create: [
            { debitAccountId: inv.id, amount: total.toFixed(2), description: `Inventory - ${p.invoiceNumber}` },
            { creditAccountId: ap.id,  amount: total.toFixed(2), description: `AP - ${p.invoiceNumber}` },
          ],
        },
      },
    });
    await applyBalance(inv.id, total, new Decimal(0));
    await applyBalance(ap.id,  new Decimal(0), total);
    console.log(`  ${jeNum1} PURCHASE ${p.invoiceNumber}: Dr Inventory ${total.toFixed(2)} / Cr AP ${total.toFixed(2)}`);

    // ── PAYMENT_MADE journals: one per payment line ───────────────────────
    for (const pay of p.payments) {
      const amt = new Decimal(pay.amount.toString());

      // Determine credit account
      let payAccId: string = cash!.id;
      let payAccName: string = cash!.name;
      const ref = (pay.referenceNo ?? '').toLowerCase();
      const method = pay.method;

      if (method === 'CASH') {
        payAccId = cash!.id; payAccName = cash!.name;
      } else if (method === 'BANK_TRANSFER') {
        payAccId = (bank ?? cash!).id; payAccName = (bank ?? cash!).name;
      } else if (method === 'MOBILE_BANKING') {
        if (ref.includes('bkash') || ref.includes('বিকাশ')) {
          payAccId = (bkash ?? cash!).id; payAccName = (bkash ?? cash!).name;
        } else if (ref.includes('nagad') || ref.includes('নগদ')) {
          payAccId = (nagad ?? cash!).id; payAccName = (nagad ?? cash!).name;
        } else {
          const mobAcc = await prisma.account.findUnique({ where: { code: '1030' } });
          payAccId = (mobAcc ?? cash!).id; payAccName = (mobAcc ?? cash!).name;
        }
      } else if (method === 'CARD') {
        const cardAcc = await prisma.account.findUnique({ where: { code: '1024' } });
        payAccId = (cardAcc ?? cash!).id; payAccName = (cardAcc ?? cash!).name;
      } else if (method === 'CHEQUE') {
        const cheqAcc = await prisma.account.findUnique({ where: { code: '1025' } });
        payAccId = (cheqAcc ?? cash!).id; payAccName = (cheqAcc ?? cash!).name;
      }

      const jeNum2 = nextJE();
      await prisma.journalEntry.create({
        data: {
          entryNumber: jeNum2,
          entryDate: pay.paymentDate,
          type: 'PAYMENT_MADE', status: 'POSTED',
          description: `Supplier payment - ${p.invoiceNumber} via ${method}`,
          totalDebit: amt.toFixed(2), totalCredit: amt.toFixed(2),
          purchaseId: p.id, supplierPaymentId: pay.id,
          lines: {
            create: [
              { debitAccountId: ap.id,      amount: amt.toFixed(2), description: `Reduce AP - ${p.invoiceNumber}` },
              { creditAccountId: payAccId,   amount: amt.toFixed(2), description: `${payAccName} out` },
            ],
          },
        },
      });
      await applyBalance(ap.id,     amt, new Decimal(0));
      await applyBalance(payAccId,  new Decimal(0), amt);
      console.log(`  ${jeNum2} PAYMENT ${p.invoiceNumber} ${method}: Dr AP ${amt.toFixed(2)} / Cr ${payAccName} ${amt.toFixed(2)}`);
    }
  }

  // ── Purchase returns ──────────────────────────────────────────────────────
  const returns = await prisma.purchaseReturn.findMany({
    where: { isVoided: false },
    orderBy: { returnDate: 'asc' },
  });

  for (const ret of returns) {
    const amt = new Decimal(ret.totalAmount.toString());
    const jeNum = nextJE();

    const debitAccId   = ret.refundMethod === 'CASH' ? cash!.id : ap.id;
    const debitAccName = ret.refundMethod === 'CASH' ? cash!.name : ap.name;

    await prisma.journalEntry.create({
      data: {
        entryNumber: jeNum,
        entryDate: ret.returnDate,
        type: 'RETURN', status: 'POSTED',
        description: `Purchase return - ${ret.returnNumber}`,
        totalDebit: amt.toFixed(2), totalCredit: amt.toFixed(2),
        purchaseId: ret.purchaseId, purchaseReturnId: ret.id,
        lines: {
          create: [
            { debitAccountId: debitAccId, amount: amt.toFixed(2), description: `${debitAccName} - ${ret.returnNumber}` },
            { creditAccountId: inv.id,    amount: amt.toFixed(2), description: `Reduce inventory - ${ret.returnNumber}` },
          ],
        },
      },
    });
    await applyBalance(debitAccId, amt, new Decimal(0));
    await applyBalance(inv.id, new Decimal(0), amt);
    console.log(`  ${jeNum} RETURN ${ret.returnNumber}: Dr ${debitAccName} ${amt.toFixed(2)} / Cr Inventory ${amt.toFixed(2)}`);
  }

  // Update sequence
  await prisma.numberingSequence.update({ where: { module: 'journal_entry' }, data: { currentNo: jeNo } });

  console.log(`\nTotal new journal entries: ${jeNo}`);
  console.log('\n📊 Final account balances (non-zero):');
  const accs = await prisma.account.findMany({
    where: { isActive: true },
    orderBy: [{ type: 'asc' }, { code: 'asc' }],
    select: { code: true, name: true, type: true, currentBalance: true },
  });
  for (const a of accs) {
    const bal = new Decimal(a.currentBalance.toString());
    if (!bal.isZero()) {
      console.log(`  ${a.code} ${a.type.padEnd(10)} ${a.name.padEnd(35)} ${bal.toFixed(2)}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
