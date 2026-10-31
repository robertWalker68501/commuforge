import 'dotenv/config';
import { Client } from 'pg';
import { expect, test, type Page } from '@playwright/test';

// Registration is deliberately restricted to the existing local Docker test database.
const developmentUrl = process.env.DATABASE_URL;
if (!developmentUrl) throw new Error('Missing DATABASE_URL for E2E tests.');
const dbUrl = new URL(developmentUrl);
if (dbUrl.hostname !== '127.0.0.1' || dbUrl.port !== '5434' || dbUrl.pathname !== '/commuforge_dev') {
  throw new Error('Sessions E2E safety check: expected local commuforge_dev on port 5434.');
}
dbUrl.pathname = '/commuforge_test';

const password = 'SafeTestPassword123!';
const uniqueEmail = () => `commuforge-session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}@example.com`;

async function createVerifiedAccount(page: Page): Promise<string> {
  const email = uniqueEmail();
  const response = await page.request.post('/api/auth/sign-up/email', {
    data: { name: 'Session E2E', email, password },
  });
  expect(response.ok(), `Account setup failed: HTTP ${response.status()}`).toBeTruthy();

  const client = new Client({ connectionString: dbUrl.toString() });
  await client.connect();
  try {
    const result = await client.query(
      'UPDATE "user" SET "emailVerified" = true WHERE email = $1 RETURNING id',
      [email]
    );
    expect(result.rowCount, 'Expected one test user').toBe(1);
  } finally {
    await client.end();
  }
  return email;
}

async function signIn(page: Page): Promise<void> {
  const email = await createVerifiedAccount(page);
  await page.goto('/sign-in');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  const responsePromise = page.waitForResponse(response =>
    response.url().includes('/api/auth/sign-in/email') && response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  expect((await responsePromise).ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText('Dashboard', { exact: true })).toBeVisible();
}

async function signOut(page: Page): Promise<void> {
  // The public (root) layout contains the authenticated user menu; the dashboard does not.
  await page.goto('/');
  const menuTrigger = page.locator('[data-slot="dropdown-menu-trigger"]').filter({ hasNotText: 'Toggle theme' });
  await expect(menuTrigger).toBeVisible();
  await menuTrigger.click();
  const logout = page.getByRole('menuitem', { name: 'Log out' });
  await expect(logout).toBeVisible();
  const responsePromise = page.waitForResponse(response =>
    response.url().includes('/api/auth/sign-out') && response.request().method() === 'POST'
  );
  await logout.click();
  expect((await responsePromise).ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/$/);
}

test.describe('Sessions and sign-out — Layer 4', () => {
  test('unauthenticated visitor is redirected from dashboard to sign-in', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test('session persists after dashboard reload', async ({ page }) => {
    await signIn(page);
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText('Dashboard', { exact: true })).toBeVisible();
  });

  test('authenticated visitor is redirected away from sign-in', async ({ page }) => {
    await signIn(page);
    await page.goto('/sign-in');
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('sign-out redirects home and revokes dashboard access', async ({ page }) => {
    await signIn(page);
    await signOut(page);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test('signed-out session remains invalid after page reload', async ({ page }) => {
    await signIn(page);
    await signOut(page);
    await page.reload();
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test('signing out in one tab invalidates the other tab on navigation', async ({ page, context }) => {
    await signIn(page);
    const secondTab = await context.newPage();
    await secondTab.goto('/dashboard');
    await expect(secondTab).toHaveURL(/\/dashboard$/);
    await signOut(page);
    // Other tabs need not immediately update their rendered UI; the server must reject the next request.
    await secondTab.reload();
    await expect(secondTab).toHaveURL(/\/sign-in$/);
  });
});
