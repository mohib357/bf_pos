import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const r = await p.$queryRawUnsafe<any[]>(`SELECT enum_range(NULL::"SaleStatus") as vals`);
  console.log('SaleStatus enum values:', r[0].vals);
  const r2 = await p.$queryRawUnsafe<any[]>(`SELECT enum_range(NULL::"StockMovementType") as vals`);
  console.log('StockMovementType values:', r2[0].vals);
}
main().finally(() => p.$disconnect());
