/**
 * Journal Entry Balance Verification Script
 * Run: npx ts-node --transpile-only scripts/verify-journals.ts
 */
import { PrismaClient } from '@prisma/client';
import Decimal from 'decimal.js';

const prisma = new PrismaClient();

async function main() {
  console.log('\n════════════════════════════════════════════════════');
  console.log(' JOURNAL ENTRY Dr = Cr VERIFICATION');
  console.log('════════════════════════════════════════════════════\n');

  // All journal entries with their lines + account names
  const entries = await prisma.journalEntry.findMany({
    where: { isVoided: false },
    orderBy: { createdAt: 'asc' },
    include: {
      lines: {
        include: {
          debitAccount:  { select: { code: true, name: true, type: true } },
          creditAccount: { select: { code: true, name: true, type: true } },
        },
      },
      purchase:       { select: { invoiceNumber: true } },
      purchaseReturn: { select: { returnNumber: true } },
    },
  });

  console.log(`Total non-voided journal entries: ${entries.length}\n`);

  let allBalanced = true;

  for (const entry of entries) {
    const ref = entry.purchase?.invoiceNumber
      ?? entry.purchaseReturn?.returnNumber
      ?? entry.referenceId
      ?? '—';

    console.log(`─────────────────────────────────────────────`);
    console.log(`Entry : ${entry.entryNumber}`);
    console.log(`Type  : ${entry.type}  |  Ref: ${ref}`);
    console.log(`Date  : ${entry.entryDate.toISOString().split('T')[0]}`);
    console.log(`Lines :`);

    let debitSum  = new Decimal(0);
    let creditSum = new Decimal(0);

    for (const line of entry.lines) {
      const amount = new Decimal(line.amount.toString());
      if (line.debitAccount) {
        debitSum = debitSum.plus(amount);
        console.log(
          `  Dr  ${line.debitAccount.code} ${line.debitAccount.name.padEnd(30)} ${amount.toFixed(2)}`,
        );
      }
      if (line.creditAccount) {
        creditSum = creditSum.plus(amount);
        console.log(
          `  Cr  ${line.creditAccount.code} ${line.creditAccount.name.padEnd(30)} ${amount.toFixed(2)}`,
        );
      }
    }

    const balanced = debitSum.equals(creditSum);
    if (!balanced) allBalanced = false;

    const storedDr = new Decimal(entry.totalDebit.toString());
    const storedCr = new Decimal(entry.totalCredit.toString());
    const headerMatch = storedDr.equals(debitSum) && storedCr.equals(creditSum);

    console.log(`\n  ┌──────────────────────────────────────────────────`);
    console.log(`  │ Total Debit  : ${debitSum.toFixed(2)}  (stored: ${storedDr.toFixed(2)}) ${storedDr.equals(debitSum) ? '✓' : '✗ MISMATCH'}`);
    console.log(`  │ Total Credit : ${creditSum.toFixed(2)}  (stored: ${storedCr.toFixed(2)}) ${storedCr.equals(creditSum) ? '✓' : '✗ MISMATCH'}`);
    console.log(`  │ BALANCED     : ${balanced ? '✅ YES' : '❌ NO — IMBALANCED!'}`);
    console.log(`  └──────────────────────────────────────────────────\n`);
  }

  console.log('════════════════════════════════════════════════════');
  console.log(` OVERALL RESULT: ${allBalanced ? '✅ ALL ENTRIES BALANCED' : '❌ SOME ENTRIES IMBALANCED'}`);
  console.log('════════════════════════════════════════════════════\n');

  // Account balance snapshot
  console.log('\n📊 ACCOUNT BALANCE SNAPSHOT (non-zero):');
  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    orderBy: [{ type: 'asc' }, { code: 'asc' }],
    select: { code: true, name: true, type: true, currentBalance: true },
  });
  for (const acc of accounts) {
    const bal = new Decimal(acc.currentBalance.toString());
    if (!bal.isZero()) {
      console.log(`  ${acc.code} ${acc.type.padEnd(10)} ${acc.name.padEnd(35)} ${bal.toFixed(2)}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
