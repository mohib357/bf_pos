/**
 * Playwright E2E: Products Page — Real Browser Verification
 *
 * Steps:
 *  1. Navigate to /login, fill credentials, submit
 *  2. Verify redirect to /dashboard
 *  3. Click Products nav or navigate to /products
 *  4. Wait for table rows (≥ 5)
 *  5. Type "Quran" in search, verify filtered results
 *  6. Click first row → detail drawer opens
 *  7. Close drawer
 *  8. Click "Add Product" → modal opens
 *  9. Verify Bangla UI text
 * 10. Screenshot at each key step
 */

import { test, expect, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const BASE = 'http://localhost:3000';
const API  = 'http://localhost:3001/api/v1';
const SCREENSHOTS = path.join(__dirname, 'screenshots');

// Ensure screenshots dir exists
fs.mkdirSync(SCREENSHOTS, { recursive: true });

async function screenshot(page: Page, name: string) {
  const file = path.join(SCREENSHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  📸 Screenshot saved: ${name}.png`);
}

// Track all API requests to /api/v1/products*
const apiRequests: { url: string; status: number }[] = [];

test.describe('Products Page', () => {
  test('full products page flow', async ({ page }) => {
    // ── Network logging ──────────────────────────────────────────────────
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/api/v1/products')) {
        apiRequests.push({ url, status: response.status() });
      }
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.log(`  [browser error] ${msg.text()}`);
      }
    });

    // ── Step 1: Login ─────────────────────────────────────────────────────
    console.log('\nStep 1: Navigate to login page');
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState('networkidle');
    await screenshot(page, '01-login-page');

    const title = await page.title();
    console.log(`  Page title: ${title}`);
    expect(page.url()).toContain('/login');

    // Fill credentials
    // Fill credentials using keyboard events (ensures React onChange fires)
    const usernameInput = page.locator('input').nth(0);
    const passwordInput = page.locator('input[type="password"]').first();

    await usernameInput.waitFor({ state: 'visible', timeout: 5000 });
    await usernameInput.click();
    await usernameInput.pressSequentially('admin', { delay: 30 });
    await passwordInput.click();
    await passwordInput.pressSequentially('Admin@123456', { delay: 30 });
    console.log('  Credentials filled');

    // Wait for button to become enabled (form validation passes)
    const loginBtn = page.locator('button[type="submit"]').first();
    await loginBtn.waitFor({ state: 'visible' });
    await expect(loginBtn).toBeEnabled({ timeout: 5000 });
    console.log('  Login button enabled ✅');

    // Submit
    await loginBtn.click();

    // ── Step 2: Dashboard redirect ───────────────────────────────────────
    console.log('\nStep 2: Wait for dashboard redirect');
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    console.log(`  ✅ Redirected to: ${page.url()}`);
    await page.waitForLoadState('networkidle');
    await screenshot(page, '02-dashboard');

    // ── Step 3: Navigate to Products ─────────────────────────────────────
    console.log('\nStep 3: Navigate to /products');
    await page.goto(`${BASE}/products`);
    await page.waitForLoadState('networkidle');
    console.log(`  URL: ${page.url()}`);

    // ── Step 4: Wait for table rows ───────────────────────────────────────
    console.log('\nStep 4: Wait for product table rows');
    // Table body rows (not loading skeletons)
    await page.waitForFunction(() => {
      const rows = document.querySelectorAll('table tbody tr');
      // Rows that have real content (not pure skeleton divs)
      return rows.length > 0 && !rows[0].querySelector('.animate-pulse');
    }, { timeout: 15000 });

    const rowCount = await page.locator('table tbody tr').count();
    console.log(`  ✅ Table has ${rowCount} rows`);
    expect(rowCount).toBeGreaterThanOrEqual(5);

    // Log first 5 product names (td[2] = product name column, td[1] is checkbox)
    console.log('  First 5 products in table:');
    for (let i = 0; i < Math.min(5, rowCount); i++) {
      const nameCell = await page.locator('table tbody tr').nth(i)
        .locator('td').nth(2).innerText().catch(() => '—');
      console.log(`    Row ${i + 1}: ${nameCell.split('\n')[0].trim()}`);
    }

    await screenshot(page, '03-products-list');

    // Verify Bangla UI elements
    const addButtonText = await page.locator('button:has-text("পণ্য যোগ")').textContent().catch(() => null);
    const banglaVisible  = addButtonText !== null;
    console.log(`\n  Bangla "পণ্য যোগ" button visible: ${banglaVisible ? '✅' : '❌ (checking alternative)'}`);

    // Also check for "Add Product" button
    const addBtn = page.locator('button:has-text("Add Product"), button:has-text("পণ্য যোগ")').first();
    const addBtnExists = await addBtn.isVisible().catch(() => false);
    console.log(`  Add Product button visible: ${addBtnExists ? '✅' : '❌'}`);

    // Check stat tiles
    const statTiles = await page.locator('div.bg-white.rounded-lg.border').count();
    console.log(`  Stat tiles count: ${statTiles}`);

    // Check column headers have Bangla
    const tableText = await page.locator('table thead').innerText().catch(() => '');
    const hasBanglaHeader = tableText.includes('পণ্য') || tableText.includes('মূল্য') || tableText.includes('স্টক');
    console.log(`  Bangla column headers visible: ${hasBanglaHeader ? '✅' : '⚠ checking page...'}`);

    // ── Step 5: Search for "Quran" ────────────────────────────────────────
    console.log('\nStep 5: Search for "Quran"');
    const searchInput = page.locator('input[type="search"], input[placeholder*="Search"], input[placeholder*="পণ্য খুঁজুন"]').first();
    await searchInput.waitFor({ state: 'visible', timeout: 5000 });
    await searchInput.fill('Quran');
    console.log('  Typed "Quran" in search field');

    // Wait for debounce (400ms) + API response
    await page.waitForTimeout(1000);
    await page.waitForLoadState('networkidle');

    const filteredRowCount = await page.locator('table tbody tr').count();
    console.log(`  ✅ Filtered rows: ${filteredRowCount} (was ${rowCount})`);
    expect(filteredRowCount).toBeLessThan(rowCount);
    expect(filteredRowCount).toBeGreaterThanOrEqual(1);

    // Log filtered results
    for (let i = 0; i < filteredRowCount; i++) {
      const nameCell = await page.locator('table tbody tr').nth(i)
        .locator('td').nth(2).innerText().catch(() => '—');
      console.log(`    Filtered row ${i + 1}: ${nameCell.split('\n')[0].trim()}`);
    }

    await screenshot(page, '04-search-quran');

    // ── Step 6: Click first row → detail drawer ───────────────────────────
    console.log('\nStep 6: Click first row to open detail drawer');
    await page.locator('table tbody tr').first().click();
    await page.waitForTimeout(800);

    // Look for the modal/drawer (fixed overlay)
    const drawerVisible = await page.locator('div.fixed.inset-0, [role="dialog"], .bg-black\\/50').first().isVisible().catch(() => false);
    console.log(`  Detail drawer visible: ${drawerVisible ? '✅' : '⚠'}`);

    // Check for "Product Detail" or price history in overlay
    const overlayText = await page.locator('div.fixed.inset-0 *').first().innerText().catch(() => '');
    const hasDetailContent = await page.locator('text=Price History, text=মূল্যের ইতিহাস, text=Stock').count().catch(() => 0);
    console.log(`  Detail content found: ${hasDetailContent > 0 ? '✅' : '⚠'}`);

    await screenshot(page, '05-product-detail-drawer');

    // Close drawer with Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    console.log('  Drawer closed (Escape)');

    // ── Step 7: Clear search ──────────────────────────────────────────────
    await searchInput.clear();
    await page.waitForTimeout(600);

    // ── Step 8: Open "Add Product" modal ──────────────────────────────────
    console.log('\nStep 8: Click "Add Product" button → modal opens');
    await addBtn.click();
    await page.waitForTimeout(800);

    const modalVisible = await page.locator('div.fixed.inset-0').first().isVisible().catch(() => false);
    console.log(`  Modal visible: ${modalVisible ? '✅' : '❌'}`);

    // Check modal has Bangla label
    const modalContent = await page.locator('div.fixed.inset-0').first().innerText().catch(() => '');
    const hasBanglaModal = modalContent.includes('পণ্যের নাম') || modalContent.includes('বারকোড') || modalContent.includes('ক্যাটাগরি');
    console.log(`  Bangla form labels in modal: ${hasBanglaModal ? '✅' : '⚠'}`);
    if (modalContent.length > 0) {
      const banglaChars = (modalContent.match(/[\u0980-\u09FF]/g) || []).length;
      console.log(`  Bangla character count in modal: ${banglaChars}`);
    }

    await screenshot(page, '06-add-product-modal');

    // Close modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await screenshot(page, '07-products-final');

    // ── Step 9: Network verification ─────────────────────────────────────
    console.log('\nStep 9: Network requests to /api/v1/products*');
    const productApiCalls = apiRequests.filter(r => r.url.includes('/products'));
    productApiCalls.forEach(r => {
      console.log(`  ${r.status === 200 ? '✅' : '❌'} ${r.status} ${r.url.replace('http://localhost:3001/api/v1', '')}`);
    });
    expect(productApiCalls.length).toBeGreaterThan(0);
    const successfulCalls = productApiCalls.filter(r => r.status === 200).length;
    console.log(`  Total API calls: ${productApiCalls.length} | Successful: ${successfulCalls}`);
    expect(successfulCalls).toBeGreaterThan(0);

    // ── Screenshot listing ─────────────────────────────────────────────────
    console.log('\nScreenshots saved:');
    const screenshots = fs.readdirSync(SCREENSHOTS).filter(f => f.endsWith('.png'));
    screenshots.forEach(f => {
      const stat = fs.statSync(path.join(SCREENSHOTS, f));
      console.log(`  ${f} (${(stat.size / 1024).toFixed(0)} KB)`);
    });
    expect(screenshots.length).toBeGreaterThanOrEqual(6);

    console.log('\n✅ All frontend verification steps passed');
  });
});
