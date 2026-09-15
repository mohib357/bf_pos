/**
 * Seed Opening Capital for Barakah Finance POS
 *
 * Configurable via environment variables:
 *   OPENING_CAPITAL_CASH=50000
 *   OPENING_CAPITAL_BANK=20000
 *   OPENING_CAPITAL_BKASH=10000
 *   OPENING_CAPITAL_NAGAD=5000
 *
 * Run: npx ts-node --transpile-only scripts/seed-opening-capital.ts
 * Reset: set RESET_OPENING_CAPITAL=true to force re-seed even if exists
 */
import { PrismaClient } from '@prisma/client';
import Decimal from 'decimal.js';

// Load .env if running standalone
try {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
} catch { /* dotenv optional */ }

const prisma = new PrismaClient();

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log(' OPENING CAPITAL JOURNAL ENTRY');
  console.log('══════════════════════════════════════════════════════\n');

  // ── Read amounts from environment (with fallback defaults) ──────────────
  const amountCash  = Number(process.env.OPENING_CAPITAL_CASH  ?? 50000);
  const amountBank  = Number(process.env.OPENING_CAPITAL_BANK  ?? 20000);
  const amountBkash = Number(process.env.OPENING_CAPITAL_BKASH ?? 10000);
  const amountNagad = Number(process.env.OPENING_CAPITAL_NAGAD ?? 5000);
  const resetFlag   = process.env.RESET_OPENING_CAPITAL === 'true';

  console.log('Capital amounts (from env / default):');
  console.log(`  OPENING_CAPITAL_CASH  = ${amountCash}`);
  console.log(`  OPENING_CAPITAL_BANK  = ${amountBank}`);
  console.log(`  OPENING_CAPITAL_BKASH = ${amountBkash}`);
  console.log(`  OPENING_CAPITAL_NAGAD = ${amountNagad}`);
  console.log(`  RESET_OPENING_CAPITAL = ${resetFlag}\n`);

  // ── Idempotency guard ────────────────────────────────────────────────────
  const existing = await prisma.journalEntry.findFirst({
    where: { type: 'OPENING_BALANCE' },
  });
  if (existing && !resetFlag) {
    console.log(`⏭  Opening balance already exists: ${existing.entryNumber}`);
    console.log('   Set RESET_OPENING_CAPITAL=true to re-seed.');
    await printBalances();
    return;
  }

  // If resetting, void the old entry and restore account balances
  if (existing && resetFlag) {
    console.log(`🔄  Resetting existing entry ${existing.entryNumber}…`);
    const oldEntry = await prisma.journalEntry.findUnique({
      where: { id: existing.id },
      include: { lines: true },
    });
    if (oldEntry) {
      for (const line of oldEntry.lines) {
        const amt = new Decimal(line.amount.toString());
        if (line.debitAccountId) {
          await prisma.account.update({
            where: { id: line.debitAccountId },
            data: { currentBalance: { decrement: amt.toNumber() } },
          });
        }
        if (line.creditAccountId) {
          await prisma.account.update({
            where: { id: line.creditAccountId },
            data: { currentBalance: { decrement: amt.toNumber() } },
          });
        }
      }
      await prisma.journalLine.deleteMany({ where: { journalEntryId: existing.id } });
      await prisma.journalEntry.delete({ where: { id: existing.id } });
      console.log('   Old entry removed, balances reversed.\n');
    }
  }

  // ── Resolve accounts ─────────────────────────────────────────────────────
  const cash  = await prisma.account.findUnique({ where: { code: '1010' } });
  const bank  = await prisma.account.findUnique({ where: { code: '1020' } });
  const bkash = await prisma.account.findUnique({ where: { code: '1021' } });
  const nagad = await prisma.account.findUnique({ where: { code: '1022' } });
  const cap   = await prisma.account.findUnique({ where: { code: '3000' } });

  if (!cash || !bank || !cap) {
    throw new Error('Required accounts (1010, 1020, 3000) not found. Run seed first.');
  }

  // ── Build lines (skip zero-amount entries) ───────────────────────────────
  const openingLines = [
    { account: cash,  label: 'Cash in Hand',   amount: amountCash  },
    { account: bank,  label: 'Bank Account',    amount: amountBank  },
    ...(bkash && amountBkash > 0 ? [{ account: bkash, label: 'bKash Account', amount: amountBkash }] : []),
    ...(nagad && amountNagad > 0 ? [{ account: nagad, label: 'Nagad Account', amount: amountNagad  }] : []),
  ].filter(l => l.amount > 0);

  const totalCapital = openingLines.reduce((s, l) => s + l.amount, 0);

  console.log('Journal lines:');
  for (const l of openingLines) {
    console.log(`  Dr ${l.account!.code} ${l.label.padEnd(20)} ৳${l.amount.toLocaleString()}`);
  }
  console.log(`  Cr ${cap.code} ${cap.name.padEnd(20)} ৳${totalCapital.toLocaleString()}`);
  console.log(`  ─────────────────────────────────────────────`);
  console.log(`  Total Capital: ৳${totalCapital.toLocaleString()}\n`);

  // ── Get next JE number ────────────────────────────────────────────────────
  const seq = await prisma.numberingSequence.findUnique({ where: { module: 'journal_entry' } });
  if (!seq) throw new Error('journal_entry sequence not found — run seed first');
  const nextNo = seq.currentNo + 1;
  const jeNum  = `JE-${String(nextNo).padStart(6, '0')}`;

  // ── Create entry in transaction ───────────────────────────────────────────
  await prisma.$transaction(async (tx) => {
    await tx.journalEntry.create({
      data: {
        entryNumber:  jeNum,
        entryDate:    new Date('2026-09-01'),
        type:         'OPENING_BALANCE',
        status:       'POSTED',
        description:  'Opening capital — business commencement',
        totalDebit:   totalCapital.toFixed(2),
        totalCredit:  totalCapital.toFixed(2),
        lines: {
          create: [
            ...openingLines.map(l => ({
              debitAccountId: l.account!.id,
              amount:         l.amount.toFixed(2),
              description:    `Opening balance — ${l.label}`,
            })),
            {
              creditAccountId: cap.id,
              amount:          totalCapital.toFixed(2),
              description:     'Opening capital injection',
            },
          ],
        },
      },
    });

    // Update account balances
    for (const l of openingLines) {
      await tx.account.update({
        where: { id: l.account!.id },
        data:  { currentBalance: { increment: l.amount } },
      });
    }
    // Capital (equity) — credit increases balance
    await tx.account.update({
      where: { id: cap.id },
      data:  { currentBalance: { increment: totalCapital } },
    });

    // Advance JE sequence
    await tx.numberingSequence.update({
      where: { module: 'journal_entry' },
      data:  { currentNo: nextNo },
    });
  });

  console.log(`✅ Opening capital entry created: ${jeNum}\n`);
  await printBalances();
}

async function printBalances() {
  console.log('── Account Balance Snapshot (non-zero) ──────────────');
  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    orderBy: [{ type: 'asc' }, { code: 'asc' }],
    select: { code: true, name: true, type: true, currentBalance: true },
  });
  for (const a of accounts) {
    const bal = new Decimal(a.currentBalance.toString());
    if (!bal.isZero()) {
      const flag = bal.isNegative() ? '❌ NEGATIVE' : '✅';
      console.log(`  ${a.code}  ${a.type.padEnd(10)} ${a.name.padEnd(30)} ৳${bal.toFixed(2)}  ${flag}`);
    }
  }

  const [dr, cr] = await prisma.$transaction([
    prisma.journalLine.aggregate({ where: { debitAccountId:  { not: null } }, _sum: { amount: true } }),
    prisma.journalLine.aggregate({ where: { creditAccountId: { not: null } }, _sum: { amount: true } }),
  ]);
  const totalDr = new Decimal(dr._sum.amount?.toString() ?? '0');
  const totalCr = new Decimal(cr._sum.amount?.toString() ?? '0');
  console.log('\n── Global Trial Balance ──────────────────────────────');
  console.log(`  Total Debit  : ৳${totalDr.toFixed(2)}`);
  console.log(`  Total Credit : ৳${totalCr.toFixed(2)}`);
  console.log(`  Balanced     : ${totalDr.equals(totalCr) ? '✅ YES — double-entry intact' : '❌ IMBALANCED'}\n`);
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
