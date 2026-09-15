import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const branch = await p.branch.findFirst({ where: { isMain: true } });
  if (!branch) throw new Error('no branch');
  const wh = await p.warehouse.findFirst({ where: { branchId: branch.id, isDefault: true } });
  if (!wh) throw new Error('no warehouse');
  const stocks = await p.productStock.findMany({
    where: { warehouseId: wh.id, quantity: { gte: 10 } },
    include: { product: { select: { id: true, name: true, sellingPrice: true, costPrice: true, unitId: true } } },
    take: 4,
    orderBy: { quantity: 'desc' },
  });
  const customers = await p.customer.findMany({ take: 3, where: { deletedAt: null } });
  const admin = await p.user.findFirst({ where: { username: 'admin' } });
  const cashAccount = await p.account.findFirst({ where: { code: '1010' } });
  const bkashAccount = await p.account.findFirst({ where: { code: '1021' } });
  console.log('BRANCH_ID=' + branch.id);
  console.log('WAREHOUSE_ID=' + wh.id);
  console.log('ADMIN_ID=' + admin?.id);
  console.log('CASH_ACCOUNT_ID=' + cashAccount?.id);
  console.log('BKASH_ACCOUNT_ID=' + bkashAccount?.id);
  stocks.forEach(s => console.log(`PRODUCT|${s.product.id}|${s.product.name}|${s.product.sellingPrice}|${s.product.costPrice}|${s.product.unitId}|${s.quantity}`));
  customers.forEach(c => console.log(`CUSTOMER|${c.id}|${c.name}|${c.currentBalance}`));
}
main().finally(() => p.$disconnect());
