// qa_test.spec.ts - Playwright QA audit tests
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Load credentials (fix hyphen to normal ascii)
const CRED_PATH = path.resolve(process.cwd(), '..', '..', '.qa_test_credentials');
const creds = fs
  .readFileSync(CRED_PATH, 'utf-8')
  .trim()
  .split('\n')
  .reduce<Record<string, string>>((acc, line) => {
    const [email, pwd] = line.split(':');
    acc[email] = pwd;
    return acc;
  }, {});

const ADMIN_EMAIL = 'qa_test@local.test';
const REGULAR_EMAIL = 'regular@local.test';
const MANAGER_EMAIL = 'manager@local.test';

let consoleErrors: string[] = [];

async function uiLogin(page, email: string, password: string) {
  await page.goto('http://localhost:5173/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([
    page.waitForNavigation(),
    page.click('button[type="submit"]'),
  ]);
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe('VTL_ATTENDANCE UI – Full QA audit', () => {
  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
  });

  test('Admin can log in and see admin‑only nav items', async ({ page }) => {
    await uiLogin(page, ADMIN_EMAIL, creds[ADMIN_EMAIL]);
    const adminNav = page.locator('nav >> text=Admin');
    await expect(adminNav).toBeVisible();
    await page.click('nav >> text=Admin');
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.locator('h1')).toContainText('Admin Dashboard');
  });

  test('Regular employee UI is correctly role‑gated', async ({ page }) => {
    await uiLogin(page, REGULAR_EMAIL, creds[REGULAR_EMAIL]);
    const adminNav = page.locator('nav >> text=Admin');
    await expect(adminNav).toHaveCount(0);
    await page.goto('http://localhost:5173/admin');
    await expect(page.locator('text=403')).toBeVisible();
  });

  // Additional UI tests omitted for brevity – they follow the same pattern.

  test.afterEach(async ({ page }, testInfo) => {
    if (consoleErrors.length) {
      console.log(`Console errors in ${testInfo.title}:\n${consoleErrors.join('\n')}`);
    }
    // Playwright automatically captures screenshots on failure via its config.
  });
});
