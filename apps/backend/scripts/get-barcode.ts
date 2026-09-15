import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const wh = await p.warehouse.findFirst({ where: { isDefault: true } });
  const stocks = await p.productStock.findMany({
    where: { warehouseId: wh!.id, quantity: { gte: 10 } },
    include: { product: { select: { id: true, name: true, barcode: true, sellingPrice: true } } },
    orderBy: { quantity: 'desc' }, take: 3,
  });
  stocks.forEach(s => {
    console.log(`Product: ${s.product.name} | barcode: ${s.product.barcode} | price: ${s.product.sellingPrice} | qty: ${s.quantity}`);
  });
}
main().finally(() => p.$disconnect());
