/**
 * E2E TEST: Product Management System
 *
 * Requires NODE_ENV=test so the throttler is disabled (see app.module.ts).
 * Run: NODE_ENV=test npx jest --config test/jest-e2e.json --testPathPattern products
 *
 * All assertions are strict — no 429 fallbacks, no artificial delays.
 * Test products are cleaned up in afterAll.
 */

import axios, { AxiosInstance } from 'axios';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const API_URL = process.env.API_URL || 'http://localhost:3001/api/v1';
const DB_URL  = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/bf_pos';

let api:        AxiosInstance;
let adminToken: string;
let viewerToken: string;
let prisma:     PrismaClient;
const cleanup = { productIds: [] as string[], userIds: [] as string[] };

async function login(username: string, password: string) {
  const r = await api.post('/auth/login', { username, password });
  expect(r.status).toBe(200);
  return r.data.data.accessToken as string;
}
const auth = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

beforeAll(async () => {
  prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
  api    = axios.create({ baseURL: API_URL, validateStatus: () => true });

  adminToken = await login('admin', 'Admin@123456');

  // Create VIEWER via Prisma
  const branch     = await prisma.branch.findFirst({ where: { code: 'MAIN' } });
  const viewerRole = await prisma.role.findFirst({ where: { name: 'VIEWER' } });
  const hash       = await bcrypt.hash('Test@123456', 10);
  const u = await prisma.user.create({
    data: { username: `e2e_viewer_${Date.now()}`, email: `e2e_v_${Date.now()}@t.com`, passwordHash: hash, firstName: 'E2EViewer', status: 'ACTIVE' },
  });
  cleanup.userIds.push(u.id);
  if (viewerRole && branch) {
    await prisma.userRole.create({ data: { userId: u.id, roleId: viewerRole.id, branchId: branch.id } });
  }
  viewerToken = await login(u.username, 'Test@123456');
}, 20000);

afterAll(async () => {
  if (cleanup.productIds.length) {
    await prisma.productPriceHistory.deleteMany({ where: { productId: { in: cleanup.productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: cleanup.productIds } } });
  }
  if (cleanup.userIds.length) {
    await prisma.userRole.deleteMany({ where: { userId: { in: cleanup.userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: cleanup.userIds } } });
  }
  await prisma.$disconnect();
}, 15000);

// ─────────────────────────────────────────────────────────────────────────────

describe('Products E2E', () => {
  const RUN = Date.now();
  let prodId: string;
  let prodBarcode: string;

  // ── Test 3 — Bangla name UTF-8 ────────────────────────────────────────────
  it('3 — creates product with Bangla name, returns intact from DB', async () => {
    const r = await api.post('/products', {
      name: 'E2E Test Book', nameBn: 'ই-টু-ই টেস্ট বই',
      costPrice: 80, sellingPrice: 120,
    }, auth(adminToken));

    expect(r.status).toBe(201);
    expect(r.data.data.nameBn).toBe('ই-টু-ই টেস্ট বই');
    expect(r.data.data.sku).toBeTruthy();
    expect(r.data.data.barcode).toBeTruthy();

    prodId = r.data.data.id;
    prodBarcode = r.data.data.barcode;
    cleanup.productIds.push(prodId);

    const row = await prisma.product.findUnique({ where: { id: prodId } });
    expect(row?.nameBn).toBe('ই-টু-ই টেস্ট বই');
  });

  // ── Test 4 — SKU sequential ───────────────────────────────────────────────
  it('4 — sequential creates produce ascending SKU suffixes', async () => {
    const cat = await prisma.category.findFirst({ where: { code: 'BOOKS' } });

    const r1 = await api.post('/products', { name: `Seq A ${RUN}`, categoryId: cat?.id }, auth(adminToken));
    const r2 = await api.post('/products', { name: `Seq B ${RUN}`, categoryId: cat?.id }, auth(adminToken));
    const r3 = await api.post('/products', { name: `Seq C ${RUN}`, categoryId: cat?.id }, auth(adminToken));

    [r1, r2, r3].forEach(r => { if (r.data?.data?.id) cleanup.productIds.push(r.data.data.id); });

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r3.status).toBe(201);

    const skus = [r1.data.data.sku, r2.data.data.sku, r3.data.data.sku] as string[];
    const nums = skus.map(s => parseInt(s.split('-').pop()!, 10));
    expect(new Set(nums).size).toBe(3); // all distinct
    expect(nums).toEqual([...nums].sort((a, b) => a - b)); // ascending
  });

  // ── Test 5 — Barcode uniqueness ───────────────────────────────────────────
  it('5 — rejects duplicate barcode with HTTP 409', async () => {
    const r = await api.post('/products', { name: 'Dup BC Test', barcode: prodBarcode }, auth(adminToken));
    expect(r.status).toBe(409);
    expect(r.data.message).toMatch(/barcode|already/i);
  });

  // ── Test 6 — Concurrent barcode race condition ────────────────────────────
  it('6 — concurrent same barcode: exactly one 201 + one 409', async () => {
    const bc = `2001${RUN}`.substring(0, 13).padEnd(13, '0');
    const [ra, rb] = await Promise.all([
      api.post('/products', { name: `Race A ${RUN}`, barcode: bc }, auth(adminToken)),
      api.post('/products', { name: `Race B ${RUN}`, barcode: bc }, auth(adminToken)),
    ]);
    [ra, rb].forEach(r => { if (r.data?.data?.id) cleanup.productIds.push(r.data.data.id); });

    const statuses = [ra.status, rb.status].sort();
    // With throttler disabled: exactly one 201, one 409
    expect(statuses).toEqual([201, 409]);

    const count = await prisma.product.count({ where: { barcode: bc } });
    expect(count).toBe(1);
  });

  // ── Test 7+8 — Price immutability + history ───────────────────────────────
  it('7+8 — price update creates history; old price record unchanged', async () => {
    const ph1 = await prisma.productPriceHistory.findMany({ where: { productId: prodId } });
    expect(ph1.length).toBeGreaterThanOrEqual(1);
    const originalCost = parseFloat(ph1[0].costPrice.toString());

    const r = await api.patch(`/products/${prodId}`, {
      costPrice: 999, sellingPrice: 1299, priceChangeReason: 'E2E price test',
    }, auth(adminToken));
    expect(r.status).toBe(200);
    expect(parseFloat(r.data.data.costPrice)).toBe(999);

    const ph2 = await prisma.productPriceHistory.findMany({
      where: { productId: prodId }, orderBy: { createdAt: 'asc' },
    });
    expect(ph2.length).toBeGreaterThanOrEqual(2);
    expect(parseFloat(ph2[0].costPrice.toString())).toBe(originalCost); // original unchanged
    expect(parseFloat(ph2[ph2.length - 1].costPrice.toString())).toBe(999); // new appended
  });

  // ── Test 9 — CSV import preview duplicate detection ───────────────────────
  it('9 — CSV preview detects duplicate SKU; DB count unchanged', async () => {
    const before = await prisma.product.count({ where: { deletedAt: null } });

    const csv = [
      'sku,barcode,name,selling_price,cost_price,status',
      `E2E-${RUN}-1,,Row 1,100,80,ACTIVE`,
      `E2E-${RUN}-2,,Row 2,100,80,ACTIVE`,
      `BOOK-SCH-001,,DUPLICATE,100,80,ACTIVE`,
      `E2E-${RUN}-3,,Row 4,100,80,ACTIVE`,
    ].join('\r\n');

    const bnd = `E2EBnd${RUN}`;
    const body = [`--${bnd}`, `Content-Disposition: form-data; name="file"; filename="t.csv"`,
      `Content-Type: text/csv`, '', csv, `--${bnd}--`].join('\r\n');

    const r = await api.post('/products/import/preview',
      Buffer.from(body, 'utf8'), {
        headers: { ...auth(adminToken).headers, 'Content-Type': `multipart/form-data; boundary=${bnd}` },
      });

    expect(r.status).toBe(201);
    expect(r.data.data.totalRows).toBe(4);
    expect(r.data.data.validRows).toBe(3);
    expect(r.data.data.errorRows).toBe(1);
    expect(r.data.data.errors[0].field).toBe('sku');
    expect(r.data.data.errors[0].message).toContain('BOOK-SCH-001');

    const after = await prisma.product.count({ where: { deletedAt: null } });
    expect(after).toBe(before); // no insert on preview
  });

  // ── Test 10 — Excel export ────────────────────────────────────────────────
  it('10 — export returns valid xlsx with PK magic bytes', async () => {
    const r = await api.get('/products/export?format=xlsx', {
      ...auth(adminToken), responseType: 'arraybuffer',
    });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/spreadsheetml/);
    expect(r.headers['content-disposition']).toMatch(/products-export/);
    const buf = Buffer.from(r.data);
    expect(buf.length).toBeGreaterThan(5000);
    expect(buf[0]).toBe(0x50); // PK zip magic
    expect(buf[1]).toBe(0x4B);
  });

  // ── Test 11 — Category tree ───────────────────────────────────────────────
  it('11 — category tree has hierarchical structure', async () => {
    const r = await api.get('/categories/tree', auth(adminToken));
    expect(r.status).toBe(200);
    const roots = r.data.data as any[];
    expect(roots.length).toBeGreaterThanOrEqual(3);
    const books = roots.find((c: any) => c.code === 'BOOKS');
    expect(books).toBeTruthy();
    expect(books.children.length).toBeGreaterThanOrEqual(3);
  });

  // ── Test 12 — RBAC ────────────────────────────────────────────────────────
  it('12a — VIEWER POST /products → 403 (not 429)', async () => {
    const r = await api.post('/products', { name: 'VIEWER fail' }, auth(viewerToken));
    expect(r.status).toBe(403);
    expect(r.data.message).toMatch(/Permission denied/i);
  });

  it('12b — VIEWER GET /products → 200', async () => {
    const r = await api.get('/products?limit=1', auth(viewerToken));
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
  });

  it('12c — no token → 401', async () => {
    const r = await api.get('/products?limit=1');
    expect(r.status).toBe(401);
  });

  // ── Test 13 — Soft delete ─────────────────────────────────────────────────
  it('13a — soft delete sets deleted_at timestamp and status=INACTIVE', async () => {
    const cr = await api.post('/products', { name: `Del Test ${RUN}`, costPrice: 10, sellingPrice: 15 }, auth(adminToken));
    expect(cr.status).toBe(201);
    const delId = cr.data.data.id;
    cleanup.productIds.push(delId);

    const dr = await api.delete(`/products/${delId}`, auth(adminToken));
    expect(dr.status).toBe(200);
    expect(dr.data.data.message).toMatch(/deleted/i);

    const row = await prisma.product.findUnique({ where: { id: delId } });
    expect(row?.deletedAt).not.toBeNull();
    expect(row?.status).toBe('INACTIVE');
  });

  it('13b — GET soft-deleted product → 404', async () => {
    const cr = await api.post('/products', { name: `404 Del Test ${RUN}` }, auth(adminToken));
    expect(cr.status).toBe(201);
    const delId = cr.data.data.id;
    cleanup.productIds.push(delId);

    await api.delete(`/products/${delId}`, auth(adminToken));
    const gr = await api.get(`/products/${delId}`, auth(adminToken));
    expect(gr.status).toBe(404);
    expect(gr.data.message).toMatch(/not found/i);
  });

  // ── Test 15 — Seed idempotency ────────────────────────────────────────────
  it('15 — all seeded products have barcodes', async () => {
    const nullBc = await prisma.product.count({
      where: { barcode: null, deletedAt: null, sku: { not: { startsWith: 'E2E-' } } },
    });
    expect(nullBc).toBe(0);
  });

  // ── Route 1 — export at /products/export ─────────────────────────────────
  it('route — /products/export returns 200 (not routed to :id)', async () => {
    const r = await api.get('/products/export?format=xlsx', {
      ...auth(adminToken), responseType: 'arraybuffer',
    });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/spreadsheetml/);
  });

  it('route — /products-data/export returns 404 (old prefix gone)', async () => {
    const r = await api.get('/products-data/export?format=xlsx', auth(adminToken));
    expect(r.status).toBe(404);
  });

  // ── Barcode ───────────────────────────────────────────────────────────────
  it('barcode — lookup by barcode finds correct product', async () => {
    const r = await api.get(`/barcodes/lookup/${prodBarcode}`, auth(adminToken));
    expect(r.status).toBe(200);
    expect(r.data.data.id).toBe(prodId);
    expect(r.data.data.nameBn).toBe('ই-টু-ই টেস্ট বই');
  });

  it('barcode — validate returns isUnique=false for existing', async () => {
    const r = await api.get(`/barcodes/validate/${prodBarcode}`, auth(adminToken));
    expect(r.status).toBe(200);
    expect(r.data.data.isUnique).toBe(false);
    expect(r.data.data.conflict).not.toBeNull();
  });

  it('barcode — validate returns isUnique=true for new', async () => {
    const bc = `20099${RUN}`.substring(0, 13).padEnd(13, '1');
    const r = await api.get(`/barcodes/validate/${bc}`, auth(adminToken));
    expect(r.status).toBe(200);
    expect(r.data.data.isUnique).toBe(true);
  });
});
