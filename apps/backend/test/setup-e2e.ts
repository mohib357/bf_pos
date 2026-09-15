/**
 * Jest Global Setup for E2E Tests
 *
 * Runs ONCE before all e2e test suites.
 * Verifies the backend server is reachable at port 3001.
 *
 * Two modes:
 *  1. SERVER_MANAGED=true  → spawns the server (NODE_ENV=test) and waits for it
 *  2. SERVER_MANAGED=false → asserts an existing server is listening (default)
 *
 * Usage:
 *   # Mode 1 (fully automatic — server managed by Jest):
 *   SERVER_MANAGED=true npx jest --config test/jest-e2e.json
 *
 *   # Mode 2 (manual — start server first):
 *   NODE_ENV=test npm run start:dev &
 *   npx jest --config test/jest-e2e.json
 *
 *   # Convenience script (mode 2):
 *   npm run test:e2e
 */

import * as net from 'net';
import * as http from 'http';
import { ChildProcess, spawn } from 'child_process';

const SERVER_PORT    = parseInt(process.env.TEST_PORT    ?? '3001', 10);
const SERVER_HOST    = process.env.TEST_HOST              ?? '127.0.0.1';
const SERVER_MANAGED = process.env.SERVER_MANAGED         === 'true';
const API_URL        = process.env.API_URL                ?? `http://${SERVER_HOST}:${SERVER_PORT}/api/v1`;

// Store server process handle globally for teardown
declare global {
  var __E2E_SERVER__: ChildProcess | undefined;
}

// ── Probe TCP port (try both IPv4 and IPv6) ──────────────────────────────────
function isPortOpen(host: string, port: number, timeoutMs = 1000): Promise<boolean> {
  return new Promise(resolve => {
    const socket = net.createConnection({ host, port });
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.on('error',   () => { socket.destroy(); resolve(false); });
  });
}

async function isServerUp(port: number): Promise<boolean> {
  const hosts = ['127.0.0.1', '::1', 'localhost'];
  for (const h of hosts) {
    if (await isPortOpen(h, port, 800)) return true;
  }
  return false;
}

// ── Health check via HTTP ─────────────────────────────────────────────────────
function healthCheck(url: string): Promise<boolean> {
  return new Promise(resolve => {
    http.get(`${url}/health`, res => {
      resolve(res.statusCode === 200);
    }).on('error', () => resolve(false));
  });
}

// ── Wait for server to be ready (polling) ─────────────────────────────────────
async function waitForServer(maxAttempts = 30, intervalMs = 1000): Promise<void> {
  for (let i = 1; i <= maxAttempts; i++) {
    if (await isServerUp(SERVER_PORT)) {
      await new Promise(r => setTimeout(r, 500));
      console.log(`  ✅ Server ready on port ${SERVER_PORT} (attempt ${i})`);
      return;
    }
    if (i % 5 === 0) {
      console.log(`  ⏳ Waiting for server… (${i}/${maxAttempts})`);
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(
    `❌ Server not reachable on port ${SERVER_PORT} after ${maxAttempts}s.\n` +
    `   Start with: NODE_ENV=test npm run start:dev\n` +
    `   Or set SERVER_MANAGED=true for automatic management.`,
  );
}

// ── Spawn server (SERVER_MANAGED=true) ────────────────────────────────────────
function spawnServer(): ChildProcess {
  console.log('  🚀 Spawning test server (NODE_ENV=test)…');
  const proc = spawn('npm', ['run', 'start:dev'], {
    cwd:      process.cwd(),
    env:      { ...process.env, NODE_ENV: 'test', PORT: String(SERVER_PORT) },
    stdio:    'pipe',
    shell:    true,
    detached: false,
  });

  proc.stdout?.on('data', (d: Buffer) => {
    const line = d.toString().trim();
    if (line.includes('Running') || line.includes('Started') || line.includes('listening')) {
      console.log(`  [server] ${line}`);
    }
  });
  proc.stderr?.on('data', (d: Buffer) => {
    const line = d.toString().trim();
    if (line && !line.includes('ExperimentalWarning')) {
      console.error(`  [server:err] ${line.substring(0, 120)}`);
    }
  });
  proc.on('exit', code => {
    if (code !== 0 && code !== null) console.error(`  [server] exited with code ${code}`);
  });

  return proc;
}

// ── Global setup entry point ──────────────────────────────────────────────────
export default async function globalSetup(): Promise<void> {
  console.log('\n══════════════════════════════════════════════════');
  console.log(' E2E GLOBAL SETUP');
  console.log(`  API URL      : ${API_URL}`);
  console.log(`  Server port  : ${SERVER_PORT}`);
  console.log(`  Managed mode : ${SERVER_MANAGED}`);
  console.log('══════════════════════════════════════════════════\n');

  if (SERVER_MANAGED) {
    // Spawn server and wait
    global.__E2E_SERVER__ = spawnServer();
    await waitForServer(60, 1000);
  } else {
    // Assert existing server
    const alreadyUp = await isServerUp(SERVER_PORT);
    if (alreadyUp) {
      console.log(`  ✅ Existing server detected on port ${SERVER_PORT}`);
    } else {
      await waitForServer(5, 500).catch(() => {
        throw new Error(
          `\n❌ Backend server is NOT running on port ${SERVER_PORT}.\n\n` +
          `   SOLUTION — run one of:\n` +
          `     a) NODE_ENV=test npm run start:dev  (in a separate terminal)\n` +
          `     b) SERVER_MANAGED=true npm run test:e2e  (auto-manages server)\n`,
        );
      });
    }
  }

  // Store API_URL for tests
  process.env.API_URL = API_URL;
  console.log('  ✅ Setup complete — tests starting\n');
}
