/**
 * Jest Global Teardown for E2E Tests
 *
 * Runs ONCE after all e2e test suites complete.
 * Stops the server if it was managed (SERVER_MANAGED=true).
 */

export default async function globalTeardown(): Promise<void> {
  console.log('\n══════════════════════════════════════════════════');
  console.log(' E2E GLOBAL TEARDOWN');

  const proc = global.__E2E_SERVER__;
  if (proc && !proc.killed) {
    console.log('  🛑 Stopping managed test server…');
    proc.kill('SIGTERM');
    // Wait briefly for graceful shutdown
    await new Promise(resolve => setTimeout(resolve, 2000));
    if (!proc.killed) {
      proc.kill('SIGKILL');
    }
    console.log('  ✅ Server stopped');
  } else {
    console.log('  ℹ️  No managed server to stop');
  }

  console.log('══════════════════════════════════════════════════\n');
}
