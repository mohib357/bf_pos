import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  const seqs = await p.numberingSequence.findMany({ orderBy: { module: 'asc' } });
  console.log('=== Numbering Sequences ===');
  seqs.forEach(s => console.log(`  ${s.module}: prefix=${s.prefix}, currentNo=${s.currentNo}`));

  const saleReturnSeq = await p.numberingSequence.findUnique({ where: { module: 'sale_return' } });
  if (!saleReturnSeq) {
    console.log('\n⚠ sale_return sequence missing — inserting...');
    await p.numberingSequence.create({
      data: { module: 'sale_return', prefix: 'SR', separator: '-', padding: 6, currentNo: 0 },
    });
    console.log('✓ sale_return sequence created');
  } else {
    console.log(`\n✓ sale_return sequence exists: ${JSON.stringify(saleReturnSeq)}`);
  }
}

main().finally(() => p.$disconnect());
