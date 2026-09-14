import http from 'http';

function get(path, token) {
  return new Promise(res => {
    const opts = { hostname:'localhost', port:3001, path:'/api/v1'+path, method:'GET',
      headers: { Authorization: 'Bearer '+token } };
    http.request(opts, resp => res(resp.statusCode)).on('error', () => res(0)).end();
  });
}

function post(path, body) {
  return new Promise(res => {
    const pay = JSON.stringify(body);
    const opts = { hostname:'localhost', port:3001, path:'/api/v1'+path, method:'POST',
      headers: { 'Content-Type':'application/json', 'Content-Length': Buffer.byteLength(pay,'utf8') } };
    const r = http.request(opts, resp => { const c=[]; resp.on('data',d=>c.push(d)); resp.on('end',()=>{ try{res(JSON.parse(Buffer.concat(c).toString()))} catch{res(null)} }); });
    r.on('error',()=>res(null)); r.write(pay); r.end();
  });
}

const lr = await post('/auth/login', { username:'admin', password:'Admin@123456' });
const T = lr.data.accessToken;
console.log(`Server env: ${lr.data?.user ? 'OK' : 'FAIL'}`);

// Fire 150 simultaneous requests — in test mode none should be throttled
const results = await Promise.all(Array.from({ length: 150 }, () => get('/products/stats', T)));
const s200 = results.filter(x => x === 200).length;
const s429 = results.filter(x => x === 429).length;
const sOther = results.filter(x => x !== 200 && x !== 429).length;

console.log(`\n150 parallel /products/stats requests:`);
console.log(`  200 OK:      ${s200}`);
console.log(`  429 Throttle: ${s429}`);
console.log(`  Other:       ${sOther}`);
console.log(`\n${s429 === 0 ? '✅ Throttler DISABLED in test env — no 429s' : '❌ Still throttling: ' + s429 + ' requests throttled'}`);
