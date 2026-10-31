import 'dotenv/config';
import { Client } from 'pg';
import { expect, test } from '@playwright/test';

// Read-only database assertions. Never connect unless the configured URL is the
// expected local development database; derive the isolated test database URL.
const developmentUrl = process.env.DATABASE_URL;
if (!developmentUrl) throw new Error('DATABASE_URL is required for registration E2E tests.');
const databaseUrl = new URL(developmentUrl);
if (
  databaseUrl.hostname !== '127.0.0.1' ||
  databaseUrl.port !== '5434' ||
  databaseUrl.pathname !== '/commuforge_dev'
) {
  throw new Error('Registration E2E safety check: expected local commuforge_dev at 127.0.0.1:5434.');
}
databaseUrl.pathname = '/commuforge_test';

async function getUsersByEmail(email: string): Promise<Array<{ role: string }>> {
  const client = new Client({ connectionString: databaseUrl.toString() });
  await client.connect();
  try {
    const result = await client.query<{ role: string }>(
      'SELECT role FROM "user" WHERE email = $1',
      [email]
    );
    return result.rows;
  } finally {
    await client.end();
  }
}

const uniqueEmail = () => `commuforge-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 9)}@example.com`;

const fillRegistration = async (
  page: import('@playwright/test').Page,
  overrides: Partial<{ name: string; email: string; password: string; confirmPassword: string }> = {}
) => {
  const values = {
    name: 'Playwright Test',
    email: uniqueEmail(),
    password: 'SafeTestPassword123!',
    confirmPassword: 'SafeTestPassword123!',
    ...overrides,
  };
  await page.getByRole('textbox', { name: 'Full Name' }).fill(values.name);
  await page.getByRole('textbox', { name: 'Email' }).fill(values.email);
  await page.getByLabel('Password', { exact: true }).fill(values.password);
  await page.getByLabel('Confirm Password').fill(values.confirmPassword);
  return values;
};

test.describe('Registration — Layer 1', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/sign-up');
    await expect(page.getByRole('button', { name: 'Sign Up' })).toBeVisible();
  });

  test('rejects missing name', async ({ page }) => {
    await fillRegistration(page, { name: '' });
    await page.getByRole('button', { name: 'Sign Up' }).click();
    await expect(page.getByText('Name is required')).toBeVisible();
    await expect(page).toHaveURL(/\/sign-up$/);
  });

  test('rejects invalid email', async ({ page }) => {
    await fillRegistration(page, { email: 'not-an-email' });
    await page.getByRole('button', { name: 'Sign Up' }).click();
    await expect(page).toHaveURL(/\/sign-up$/);
    await expect(page.getByRole('textbox', { name: 'Email' }).and(page.locator(':invalid'))).toBeVisible();
  });

  test('rejects short password', async ({ page }) => {
    await fillRegistration(page, { password: 'short', confirmPassword: 'short' });
    await page.getByRole('button', { name: 'Sign Up' }).click();
    await expect(page.getByText('Password must be at least 10 characters in length')).toBeVisible();
    await expect(page).toHaveURL(/\/sign-up$/);
  });

  test('rejects mismatched passwords', async ({ page }) => {
    await fillRegistration(page, { confirmPassword: 'DifferentPassword123!' });
    await page.getByRole('button', { name: 'Sign Up' }).click();
    await expect(page.getByText('Passwords do not match')).toBeVisible();
    await expect(page).toHaveURL(/\/sign-up$/);
  });

  test('creates an account and navigates to email verification instructions', async ({ page }) => {
    const { email } = await fillRegistration(page);
    const responsePromise = page.waitForResponse(response =>
      response.url().includes('/api/auth/sign-up/email') && response.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'Sign Up' }).click();
    const response = await responsePromise;
    expect(response.ok(), `Registration API returned ${response.status()}`).toBeTruthy();
    await expect(page).toHaveURL(/\/validate-email$/);
    expect(await getUsersByEmail(email)).toEqual([{ role: 'user' }]);
  });

  test('does not create a duplicate account', async ({ page }) => {
    const email = uniqueEmail();
    await fillRegistration(page, { email });
    const firstResponse = page.waitForResponse(r => r.url().includes('/api/auth/sign-up/email') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Sign Up' }).click();
    expect((await firstResponse).ok()).toBeTruthy();
    await expect(page).toHaveURL(/\/validate-email$/);
    expect(await getUsersByEmail(email)).toHaveLength(1);

    await page.goto('/sign-up');
    await fillRegistration(page, { email });
    const secondResponse = page.waitForResponse(r => r.url().includes('/api/auth/sign-up/email') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Sign Up' }).click();
    const response = await secondResponse;
    // Better Auth may deliberately obscure duplicate-email existence.
    expect(response.status()).toBeLessThan(500);
    expect(await getUsersByEmail(email)).toHaveLength(1);
  });
});
