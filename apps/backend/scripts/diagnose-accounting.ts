/**
 * Diagnose: negative cash balances — find root cause
 */
import { PrismaClient } from '@prisma/client';
import Decimal from 'decimal.js';

const prisma = new PrismaClient();

async function main() {
  console.log('\n══════════════════════════════════════════════════');
  console.log(' ACCOUNTING DIAGNOSIS');
  console.log('══════════════════════════════════════════════════\n');

  // 1. Opening/Investment journal entries
  const openingEntries = await prisma.journalEntry.findMany({
    where: { type: { in: ['OPENING_BALANCE', 'INVESTMENT'] } },
    select: { entryNumber: true, type: true, description: true, totalDebit: true, totalCredit: true },
  });
  console.log(`1. OPENING_BALANCE / INVESTMENT entries: ${openingEntries.length}`);
  for (const e of openingEntries) {
    console.log(`   ${e.entryNumber} | ${e.type} | Dr ${e.totalDebit} | ${e.description}`);
  }

  // 2. Investments table
  const investments = await prisma.investment.findMany({
    select: { investorName: true, amount: true, investmentDate: true, status: true },
  });
  console.log(`\n2. Investments table: ${investments.length} entries`);
  for (const i of investments) {
    console.log(`   ${i.investorName} | ${i.amount} | ${i.status}`);
  }

  // 3. Equity accounts
  const equityAccounts = await prisma.account.findMany({
    where: { type: 'EQUITY' },
    orderBy: { code: 'asc' },
    select: { code: true, name: true, type: true, currentBalance: true },
  });
  console.log(`\n3. Equity accounts: ${equityAccounts.length}`);
  for (const a of equityAccounts) {
    console.log(`   ${a.code} ${a.name.padEnd(30)} balance=${a.currentBalance}`);
  }

  // 4. All non-zero account balances
  const allAccounts = await prisma.account.findMany({
    where: { isActive: true },
    orderBy: [{ type: 'asc' }, { code: 'asc' }],
    select: { code: true, name: true, type: true, currentBalance: true },
  });
  console.log('\n4. ALL NON-ZERO ACCOUNT BALANCES:');
  for (const a of allAccounts) {
    const bal = new Decimal(a.currentBalance.toString());
    if (!bal.isZero()) {
      const sign = bal.isNegative() ? '❌ NEGATIVE' : '✅';
      console.log(`   ${a.code} ${a.type.padEnd(10)} ${a.name.padEnd(32)} ${bal.toFixed(2)}  ${sign}`);
    }
  }

  // 5. Trial balance — sum of ALL debit lines vs credit lines
  const [debitAgg, creditAgg] = await prisma.$transaction([
    prisma.journalLine.aggregate({
      where: { debitAccountId: { not: null } },
      _sum: { amount: true },
    }),
    prisma.journalLine.aggregate({
      where: { creditAccountId: { not: null } },
      _sum: { amount: true },
    }),
  ]);

  const totalDebit  = new Decimal(debitAgg._sum.amount?.toString()  ?? '0');
  const totalCredit = new Decimal(creditAgg._sum.amount?.toString() ?? '0');
  console.log('\n5. GLOBAL TRIAL BALANCE:');
  console.log(`   Total Debit  : ${totalDebit.toFixed(2)}`);
  console.log(`   Total Credit : ${totalCredit.toFixed(2)}`);
  console.log(`   Balanced     : ${totalDebit.equals(totalCredit) ? '✅ YES' : '❌ NO'}`);

  // 6. Journal entries count by type
  const byType = await prisma.journalEntry.groupBy({
    by: ['type'],
    _count: { id: true },
    _sum: { totalDebit: true },
  });
  console.log('\n6. JOURNAL ENTRIES BY TYPE:');
  for (const t of byType) {
    console.log(`   ${t.type.padEnd(20)} count=${t._count.id}  total_debit=${t._sum.totalDebit}`);
  }

  console.log('\n══════════════════════════════════════════════════');
  console.log(' ROOT CAUSE SUMMARY');
  console.log('══════════════════════════════════════════════════');
  if (openingEntries.length === 0) {
    console.log('❌ NO opening capital entry found!');
    console.log('   Cash is negative because purchases debited inventory');
    console.log('   and payments credited Cash — but no capital was ever');
    console.log('   introduced. Fix: add Dr Cash 50000 / Cr Capital 50000');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
