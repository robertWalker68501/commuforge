import 'dotenv/config';
import { Client } from 'pg';
import { expect, test, type Page } from '@playwright/test';

// Only the local, isolated Docker test database may be modified by this suite.
const developmentUrl = process.env.DATABASE_URL;
if (!developmentUrl) throw new Error('Missing DATABASE_URL for E2E tests.');
const dbUrl = new URL(developmentUrl);
if (dbUrl.hostname !== '127.0.0.1' || dbUrl.port !== '5434' || dbUrl.pathname !== '/commuforge_dev') {
  throw new Error('Sign-in E2E safety check: expected local commuforge_dev on port 5434.');
}
dbUrl.pathname = '/commuforge_test';

const password = 'SafeTestPassword123!';
const uniqueEmail = () => `commuforge-signin-${Date.now()}-${Math.random().toString(36).slice(2, 10)}@example.com`;

async function createAccount(page: Page, verify: boolean): Promise<string> {
  const email = uniqueEmail();
  const response = await page.request.post('/api/auth/sign-up/email', {
    data: { name: 'Sign In E2E', email, password },
  });
  expect(response.ok(), `Account setup failed: HTTP ${response.status()}`).toBeTruthy();
  if (verify) {
    const client = new Client({ connectionString: dbUrl.toString() });
    await client.connect();
    try {
      const result = await client.query(
        'UPDATE "user" SET "emailVerified" = true WHERE email = $1 RETURNING id',
        [email]
      );
      expect(result.rowCount, 'Expected exactly one isolated test user').toBe(1);
    } finally {
      await client.end();
    }
  }
  return email;
}

async function fillSignIn(page: Page, email: string, secret: string) {
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(secret);
}

async function submitSignIn(page: Page) {
  const responsePromise = page.waitForResponse(response =>
    response.url().includes('/api/auth/sign-in/email') && response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  return responsePromise;
}

test.describe('Sign-in — Layer 3', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
  });

  test('requires an email address', async ({ page }) => {
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole('textbox', { name: 'Email' })).toHaveAttribute('aria-invalid', 'true');
  });

  test('requires a password', async ({ page }) => {
    await page.getByRole('textbox', { name: 'Email' }).fill(uniqueEmail());
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page.getByText('Password is required')).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test('verified user can sign in and access the dashboard', async ({ page }) => {
    const email = await createAccount(page, true);
    await fillSignIn(page, email, password);
    const response = await submitSignIn(page);
    expect((await response).ok()).toBeTruthy();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('main').getByText('Dashboard', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('wrong password does not authenticate', async ({ page }) => {
    const email = await createAccount(page, true);
    await fillSignIn(page, email, 'DefinitelyWrongPassword123!');
    const response = await submitSignIn(page);
    expect((await response).ok()).toBeFalsy();
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByText('Failed to sign in.')).toBeVisible();
  });

  test('unknown email does not authenticate', async ({ page }) => {
    await fillSignIn(page, uniqueEmail(), password);
    const response = await submitSignIn(page);
    expect((await response).ok()).toBeFalsy();
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByText('Failed to sign in.')).toBeVisible();
  });

  test('unverified user cannot sign in', async ({ page }) => {
    const email = await createAccount(page, false);
    await fillSignIn(page, email, password);
    const response = await submitSignIn(page);
    expect((await response).ok()).toBeFalsy();
    await expect(page).toHaveURL(/\/sign-in$/);
    // Ensure the account still cannot access the protected dashboard.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test('GitHub sign-in button is available and OAuth initiation returns GitHub authorization URL', async ({ page, request }) => {
    await expect(page.getByRole('button', { name: /Sign in with GitHub/i })).toBeVisible();
    // Test our own Better Auth endpoint, not GitHub's external login UI.
    const response = await request.post('/api/auth/sign-in/social', {
      data: { provider: 'github', callbackURL: '/dashboard' },
    });
    expect(response.ok(), `GitHub OAuth initiation failed: HTTP ${response.status()}`).toBeTruthy();
    const body = await response.json() as { url?: string; redirect?: boolean };
    expect(body.url, 'Expected a provider authorization URL').toBeTruthy();
    const authorizationUrl = new URL(body.url!);
    expect(authorizationUrl.protocol).toBe('https:');
    expect(authorizationUrl.hostname).toMatch(/(^|\.)github\.com$/);
  });
});
