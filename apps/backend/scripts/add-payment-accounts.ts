/**
 * One-time script: seed dedicated payment method accounts
 * Run: npx ts-node --transpile-only scripts/add-payment-accounts.ts
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const PAYMENT_ACCOUNTS = [
  { code: '1021', name: 'bKash Account',   nameBn: 'বিকাশ একাউন্ট',  type: 'ASSET', subType: 'BANK', isSystem: false },
  { code: '1022', name: 'Nagad Account',   nameBn: 'নগদ একাউন্ট',    type: 'ASSET', subType: 'BANK', isSystem: false },
  { code: '1023', name: 'Rocket Account',  nameBn: 'রকেট একাউন্ট',   type: 'ASSET', subType: 'BANK', isSystem: false },
  { code: '1024', name: 'Card Account',    nameBn: 'কার্ড একাউন্ট',   type: 'ASSET', subType: 'BANK', isSystem: false },
  { code: '1025', name: 'Cheque Account',  nameBn: 'চেক একাউন্ট',    type: 'ASSET', subType: 'BANK', isSystem: false },
];

async function main() {
  console.log('Adding dedicated payment method accounts...\n');
  for (const acc of PAYMENT_ACCOUNTS) {
    const existing = await prisma.account.findUnique({ where: { code: acc.code } });
    if (existing) {
      console.log(`  ⏭  ${acc.code} ${acc.name} — already exists`);
      continue;
    }
    await prisma.account.create({ data: acc as any });
    console.log(`  ✅ Created: ${acc.code} ${acc.name}`);
  }

  console.log('\nFinal payment accounts in DB:');
  const accs = await prisma.account.findMany({
    where: { code: { in: ['1000','1010','1020','1021','1022','1023','1024','1025','1030'] } },
    orderBy: { code: 'asc' },
    select: { code: true, name: true, subType: true, currentBalance: true },
  });
  for (const a of accs) {
    console.log(`  ${a.code}  ${a.name.padEnd(25)} subType=${a.subType}  balance=${a.currentBalance}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
