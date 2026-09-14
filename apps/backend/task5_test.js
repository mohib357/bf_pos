/**
 * TASK 5: Password Change Kills Other Sessions
 *
 * Simulation:
 *   - User "test_cashier_01" logs in from device1 → gets AT_d1, RT_d1
 *   - Same user logs in from device2 → gets AT_d2, RT_d2
 *   - device1 changes password
 *   - device2's access token → should be 401 (blacklisted)
 *   - device2's refresh token → should be 401 (DB revoked)
 */
const http = require('http');

function req(method, path, token, body) {
  return new Promise(resolve => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: 3001, path, method,
      headers: {
        'Content-Type': 'application/json',
        ...(token   ? { 'Authorization': 'Bearer ' + token } : {}),
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      }
    };
    const r = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch  { resolve({ status: res.statusCode, body: d }); }
      });
    });
    r.on('error', e => resolve({ status: 'ERR', body: e.message }));
    if (bodyStr) r.write(bodyStr);
    r.end();
  });
}

async function main() {
  console.log('='.repeat(62));
  console.log('TASK 5: PASSWORD CHANGE KILLS OTHER SESSIONS');
  console.log('='.repeat(62));
  console.log('User: test_cashier_01 / Cashier@123456');
  console.log('');

  // ── Step 1: device1 login ─────────────────────────────────────────
  const d1 = await req('POST', '/api/v1/auth/login', null,
    { username: 'test_cashier_01', password: 'Cashier@123456' });
  const AT_d1 = d1.body.data.accessToken;
  const RT_d1 = d1.body.data.refreshToken;
  console.log('STEP 1 — device1 login: HTTP', d1.status);
  console.log('  AT_d1 (first 40):', AT_d1.substring(0, 40) + '...');
  console.log('  RT_d1:', RT_d1);

  // ── Step 2: device2 login (same user, separate session) ───────────
  const d2 = await req('POST', '/api/v1/auth/login', null,
    { username: 'test_cashier_01', password: 'Cashier@123456' });
  const AT_d2 = d2.body.data.accessToken;
  const RT_d2 = d2.body.data.refreshToken;
  console.log('\nSTEP 2 — device2 login: HTTP', d2.status);
  console.log('  AT_d2 (first 40):', AT_d2.substring(0, 40) + '...');
  console.log('  RT_d2:', RT_d2);
  console.log('  Note: AT_d1 !== AT_d2:', AT_d1 !== AT_d2 ? 'YES (different sessions)' : 'NO');

  // ── Step 3: Verify both tokens work BEFORE password change ────────
  const d1_before = await req('GET', '/api/v1/auth/profile', AT_d1, null);
  const d2_before = await req('GET', '/api/v1/auth/profile', AT_d2, null);
  console.log('\nSTEP 3 — Both tokens valid BEFORE password change:');
  console.log('  device1 GET /profile: HTTP', d1_before.status, success(d1_before));
  console.log('  device2 GET /profile: HTTP', d2_before.status, success(d2_before));

  // ── Step 4: device1 changes password ─────────────────────────────
  const changePwd = await req('POST', '/api/v1/auth/change-password', AT_d1, {
    currentPassword: 'Cashier@123456',
    newPassword:     'NewCashier@789012',
  });
  console.log('\nSTEP 4 — device1 changes password: HTTP', changePwd.status);
  console.log('  message:', changePwd.body.message || JSON.stringify(changePwd.body));

  // ── Step 5: device2 access token → should be 401 ─────────────────
  const d2_after_at = await req('GET', '/api/v1/auth/profile', AT_d2, null);
  console.log('\nSTEP 5 — device2 AT after password change:');
  console.log('  HTTP:', d2_after_at.status, '| message:', d2_after_at.body.message);
  if (d2_after_at.status === 401) {
    console.log('  RESULT: ✓ PASS — 401 (device2 AT blacklisted by password change)');
  } else {
    console.log('  RESULT: ✗ FAIL — got', d2_after_at.status,
      '(password change did not blacklist device2 AT)');
  }

  // ── Step 6: device2 refresh token → should be 401 ────────────────
  const d2_after_rt = await req('POST', '/api/v1/auth/refresh', null,
    { refreshToken: RT_d2 });
  console.log('\nSTEP 6 — device2 RT refresh after password change:');
  console.log('  HTTP:', d2_after_rt.status, '| message:', d2_after_rt.body.message);
  if (d2_after_rt.status === 401) {
    console.log('  RESULT: ✓ PASS — 401 (device2 RT revoked in DB by password change)');
  } else {
    console.log('  RESULT: ✗ FAIL — got', d2_after_rt.status);
  }

  // ── Step 7: device1 AT after password change ─────────────────────
  const d1_after_at = await req('GET', '/api/v1/auth/profile', AT_d1, null);
  console.log('\nSTEP 7 — device1 AT after password change (device1 AT also blacklisted by logout-on-change):');
  console.log('  HTTP:', d1_after_at.status, '| message:', d1_after_at.body.message);

  // ── Reset: restore original password ─────────────────────────────
  // Login with new password first to get a fresh admin token
  const adminLogin = await req('POST', '/api/v1/auth/login', null,
    { username: 'admin', password: 'Admin@123456' });
  const adminAT = adminLogin.body.data.accessToken;

  // Get cashier user ID
  const usersRes = await req('GET', '/api/v1/users?search=test_cashier_01', adminAT, null);
  const cashier  = usersRes.body.data.find(u => u.username === 'test_cashier_01');

  if (cashier) {
    // Admin reset password back to original
    const reset = await req('POST', '/api/v1/auth/users/' + cashier.id + '/reset-password',
      adminAT, { newPassword: 'Cashier@123456', mustChangePwd: false });
    console.log('\nPassword restored to Cashier@123456 (HTTP', reset.status + ')');
  }

  console.log('');
  console.log('='.repeat(62));
  console.log('SUMMARY:');
  console.log('  device1 + device2 = 2 separate sessions (different ATs)');
  console.log('  changePassword revokes ALL refresh tokens in DB');
  console.log('  device2 RT → 401:', d2_after_rt.status === 401 ? '✓' : '✗');
  console.log('  device2 AT → 401:', d2_after_at.status === 401 ? '✓ (via blacklist)' : '✗ NOTE: AT blacklisting on pwd change is separate from logout blacklist');
  console.log('='.repeat(62));
}

function success(r) {
  return '(success=' + r.body.success + ')';
}

main().catch(e => console.error('ERR:', e.message));
