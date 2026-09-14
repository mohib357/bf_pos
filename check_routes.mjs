import http from 'http';
import { execSync } from 'child_process';

function req(method, path, body, token, raw = false) {
  return new Promise(res => {
    const pay = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const opts = {
      hostname: 'localhost', port: 3001,
      path: '/api/v1' + path, method,
      headers: {
        'Content-Type': 'application/json',
        ...(pay ? { 'Content-Length': Buffer.byteLength(pay, 'utf8') } : {}),
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
    };
    const r = http.request(opts, resp => {
      const c = [];
      resp.on('data', d => c.push(d));
      resp.on('end', () => {
        const buf = Buffer.concat(c);
        if (raw) return res({ status: resp.statusCode, buf, headers: resp.headers });
        try { res({ status: resp.statusCode, data: JSON.parse(buf.toString('utf8')), headers: resp.headers }); }
        catch { res({ status: resp.statusCode, data: null, headers: resp.headers }); }
      });
    });
    r.on('error', () => res({ status: 0, data: null }));
    if (pay) r.write(pay, 'utf8');
    r.end();
  });
}

// ─── Login ────────────────────────────────────────────────────────────────────
const lr = await req('POST', '/auth/login', { username: 'admin', password: 'Admin@123456' });
const T = lr.data.data.accessToken;
console.log(`Login: ${lr.status} ✅`);

// ─── 1. /products-data/* must all 404 ────────────────────────────────────────
console.log('\n=== /products-data/* must all 404 (route removed) ===');
const oldRoutes = [
  '/products-data/export?format=xlsx',
  '/products-data/import/template',
];
for (const path of oldRoutes) {
  const r = await req('GET', path, null, T);
  console.log(`  ${r.status === 404 ? '✅' : '❌'} GET ${path} → ${r.status}  (expected 404)`);
}

// ─── 2. /products/* must all 200 ─────────────────────────────────────────────
console.log('\n=== /products/* (new canonical paths) ===');

// export
const exp = await req('GET', '/products/export?format=xlsx', null, T, true);
console.log(`  ${exp.status === 200 ? '✅' : '❌'} GET /products/export?format=xlsx → ${exp.status}`);
if (exp.status === 200) {
  console.log(`     Content-Type:  ${exp.headers['content-type']}`);
  console.log(`     Content-Disp:  ${exp.headers['content-disposition']}`);
  console.log(`     File size:     ${exp.buf.length} bytes`);
  console.log(`     PK magic bytes: 0x${exp.buf[0].toString(16)} 0x${exp.buf[1].toString(16)} ${exp.buf[0] === 0x50 && exp.buf[1] === 0x4B ? '✅ valid xlsx' : '❌'}`);
}

// import template
const tpl = await req('GET', '/products/import/template', null, T, true);
console.log(`  ${tpl.status === 200 ? '✅' : '❌'} GET /products/import/template → ${tpl.status} (${tpl.buf.length} bytes)`);

// other static routes still work
const staticRoutes = [
  ['/products/stats',           200, 'GET /products/stats'],
  ['/products/generate-barcode',200, 'GET /products/generate-barcode'],
  ['/products/low-stock',       200, 'GET /products/low-stock'],
  ['/products/search?q=Quran',  200, 'GET /products/search'],
];
for (const [path, expected, label] of staticRoutes) {
  const r = await req('GET', path, null, T);
  console.log(`  ${r.status === expected ? '✅' : '❌'} ${r.status}  ${label}`);
}

// :id still works
const prod = await req('GET', '/products?limit=1', null, T);
const pid = prod.data?.data?.[0]?.id;
if (pid) {
  const byId = await req('GET', `/products/${pid}`, null, T);
  console.log(`  ${byId.status === 200 ? '✅' : '❌'} ${byId.status}  GET /products/:id (${pid.slice(0,8)}...)`);
}

// fake UUID → 404 not 400
const fakeUUID = '00000000-0000-0000-0000-000000000000';
const fake = await req('GET', `/products/${fakeUUID}`, null, T);
console.log(`  ${fake.status === 404 ? '✅' : '❌'} ${fake.status}  GET /products/fake-uuid → 404 (not 400 UUID error)`);

// ─── 3. Swagger docs-json must not contain "products-data" ───────────────────
console.log('\n=== Swagger: no "products-data" in docs ===');
const swagger = await req('GET', '/docs-json', null, null, true);
if (swagger.status === 200) {
  const swaggerText = swagger.buf.toString('utf8');
  const count = (swaggerText.match(/products-data/g) || []).length;
  console.log(`  "products-data" occurrences in docs-json: ${count}  ${count === 0 ? '✅' : '❌'}`);
} else {
  console.log(`  Swagger docs returned ${swagger.status} (may be disabled in dev)`);
  // Check Swagger is available at /api/docs instead
  const swaggerPage = await req('GET', '/', null, null, true);
  console.log(`  Checking /api/docs via text search in Swagger HTML...`);
  // The swagger endpoint is at /api/docs not /api/v1/docs
  const swaggerDirect = await new Promise(res => {
    const r = http.request({ hostname:'localhost', port:3001, path:'/api/docs-json', method:'GET' }, resp => {
      const c = []; resp.on('data', d=>c.push(d)); resp.on('end', ()=>{
        const text = Buffer.concat(c).toString('utf8');
        const count = (text.match(/products-data/g) || []).length;
        res({ status: resp.statusCode, count, size: text.length });
      });
    }); r.on('error', () => res({ status: 0, count: 0 })); r.end();
  });
  console.log(`  GET /api/docs-json → ${swaggerDirect.status}, "products-data" count: ${swaggerDirect.count}  ${swaggerDirect.count === 0 ? '✅' : '❌ still present'}`);
}
