/**
 * verify-sales-setup.ts
 * Gets a valid branchId, warehouseId, product, admin token for trap tests
 */
import { PrismaClient } from '@prisma/client';
import * as http from 'http';

const p = new PrismaClient();
const BASE = 'http://localhost:3001/api/v1';

function post(path: string, body: any, token?: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const opts = {
      hostname: 'localhost', port: 3001, path: `/api/v1${path}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };
    const req = http.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(path: string, token: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost', port: 3001, path: `/api/v1${path}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    };
    const req = http.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('=== Sales Setup Verification ===\n');

  // Get admin token
  const loginRes = await post('/auth/login', { username: 'admin', password: 'Admin@123456' });
  if (!loginRes.body?.data?.accessToken) {
    console.error('LOGIN FAILED:', JSON.stringify(loginRes.body));
    process.exit(1);
  }
  const token = loginRes.body.data.accessToken;
  console.log('✓ Login: admin token obtained');

  // Get branch
  const branch = await p.branch.findFirst({ where: { isMain: true } });
  console.log(`✓ Branch: ${branch?.name} (${branch?.id})`);

  // Get warehouse
  const warehouse = await p.warehouse.findFirst({ where: { branchId: branch?.id, isDefault: true } });
  console.log(`✓ Warehouse: ${warehouse?.name} (${warehouse?.id})`);

  // Get a product with stock
  const stock = await p.productStock.findFirst({
    where: { quantity: { gt: 0 }, warehouseId: warehouse?.id },
    include: { product: true },
  });
  console.log(`✓ Product with stock: ${stock?.product?.name} qty=${stock?.quantity} id=${stock?.product?.id}`);

  // Test barcode endpoint
  if (stock?.product?.barcode) {
    const barcodeRes = await get(`/sales/barcode/${stock.product.barcode}`, token);
    console.log(`✓ Barcode lookup [${barcodeRes.status}]: found=${barcodeRes.body?.data?.found}`);
  }

  // Test stats endpoint
  const statsRes = await get('/sales/stats', token);
  console.log(`✓ Stats [${statsRes.status}]: ${JSON.stringify(statsRes.body?.data)}`);

  // Output setup data
  console.log('\n=== CONFIG ===');
  console.log(JSON.stringify({
    token,
    branchId: branch?.id,
    warehouseId: warehouse?.id,
    productId: stock?.product?.id,
    productName: stock?.product?.name,
    productBarcode: stock?.product?.barcode,
    productStock: stock?.quantity?.toString(),
    sellingPrice: stock?.product?.sellingPrice?.toString(),
  }, null, 2));
}

main().finally(() => p.$disconnect());
