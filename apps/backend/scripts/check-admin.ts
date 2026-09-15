import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const u = await p.user.findFirst({ where: { username: 'admin' }, select: { id: true, branchId: true } });
  console.log('admin branchId:', u?.branchId);
  const branch = await p.branch.findFirst({ where: { isMain: true } });
  console.log('main branch:', branch?.id, branch?.name);
}
main().finally(() => p.$disconnect());
