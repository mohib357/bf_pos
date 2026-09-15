import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  const accounts = await p.account.findMany({
    orderBy: { code: 'asc' },
    select: { code: true, name: true, subType: true, isSystem: true },
  });
  console.log('=== Chart of Accounts ===');
  accounts.forEach(a => console.log(`  ${a.code} | ${a.name} | ${a.subType} | sys=${a.isSystem}`));
}

main().finally(() => p.$disconnect());
