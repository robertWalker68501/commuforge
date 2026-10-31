import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';
import { expect, test, type Page } from '@playwright/test';

// Never allow this suite to modify the development or production database.
const developmentUrl = process.env.DATABASE_URL;
if (!developmentUrl) throw new Error('Missing DATABASE_URL for security E2E tests.');
const dbUrl = new URL(developmentUrl);
if (dbUrl.hostname !== '127.0.0.1' || dbUrl.port !== '5434' || dbUrl.pathname !== '/commuforge_dev') {
  throw new Error('Security E2E requires local commuforge_dev at 127.0.0.1:5434.');
}
dbUrl.pathname = '/commuforge_test';

const password = 'SafeTestPassword123!';
const uniqueEmail = () => `commuforge-security-${Date.now()}-${Math.random().toString(36).slice(2, 10)}@example.com`;
const captureFile = path.join(process.cwd(), 'test-results', 'verification-emails.jsonl');

async function database<T>(sql: string, values: unknown[] = []): Promise<T[]> {
  const client = new Client({ connectionString: dbUrl.toString() });
  await client.connect();
  try { return (await client.query(sql, values)).rows as T[]; }
  finally { await client.end(); }
}

async function createAccount(page: Page, verify: boolean): Promise<string> {
  const email = uniqueEmail();
  const response = await page.request.post('/api/auth/sign-up/email', {
    data: { name: 'Security E2E', email, password },
  });
  expect(response.ok(), `Account setup returned HTTP ${response.status()}`).toBeTruthy();
  if (verify) {
    const rows = await database<{ id: string }>(
      'UPDATE "user" SET "emailVerified" = true WHERE email = $1 RETURNING id', [email]
    );
    expect(rows).toHaveLength(1);
  }
  return email;
}

async function signIn(page: Page): Promise<string> {
  const email = await createAccount(page, true);
  await page.goto('/sign-in');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  const response = page.waitForResponse(r =>
    r.url().includes('/api/auth/sign-in/email') && r.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  expect((await response).ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/dashboard$/);
  return email;
}

async function capturedVerificationUrl(email: string): Promise<string> {
  let url = '';
  await expect.poll(async () => {
    let contents = '';
    try { contents = await readFile(captureFile, 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const entries = contents.split('\n').filter(Boolean)
      .map(line => JSON.parse(line) as { email: string; url: string });
    url = entries.filter(entry => entry.email === email).at(-1)?.url ?? '';
    return url.length > 0;
  }, { timeout: 15_000 }).toBe(true);
  const parsed = new URL(url);
  if (parsed.hostname !== '127.0.0.1' || parsed.port !== '3100' || !parsed.pathname.startsWith('/api/auth/verify-email')) {
    throw new Error('Unexpected verification URL; refusing to request it.');
  }
  return url;
}

test.describe('Authentication — Layer 5 security and integration', () => {
  test('a fabricated session cookie does not grant dashboard access', async ({ page, context }) => {
    await context.addCookies([{
      name: 'better-auth.session_token',
      value: `forged-${Date.now()}-not-a-real-session`,
      url: 'http://127.0.0.1:3100',
      httpOnly: true,
      sameSite: 'Lax',
    }]);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test('deleting a session from PostgreSQL revokes protected-route access', async ({ page }) => {
    const email = await signIn(page);
    const rows = await database<{ id: string }>(
      'DELETE FROM "session" WHERE "userId" IN (SELECT id FROM "user" WHERE email = $1) RETURNING id',
      [email]
    );
    expect(rows.length, 'Expected to revoke at least one live session').toBeGreaterThan(0);
    await page.reload();
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test('registration cannot assign itself the administrator role', async ({ page }) => {
    const email = uniqueEmail();
    const response = await page.request.post('/api/auth/sign-up/email', {
      data: { name: 'Role Escalation E2E', email, password, role: 'admin' },
    });
    // The API may reject unexpected fields or ignore them. Either is safe if no admin is created.
    const rows = await database<{ role: string }>('SELECT role FROM "user" WHERE email = $1', [email]);
    if (response.ok()) {
      expect(rows).toHaveLength(1);
      expect(rows[0].role).toBe('user');
    } else {
      expect(rows).toHaveLength(0);
    }
  });

  test('malformed registration request cannot create an account', async ({ page }) => {
    const response = await page.request.post('/api/auth/sign-up/email', {
      data: { name: 'Missing Email E2E', password },
    });
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);
  });

  test('tampered verification token cannot verify an unverified account', async ({ page, request }) => {
    const email = await createAccount(page, false);
    const link = new URL(await capturedVerificationUrl(email));
    const token = link.searchParams.get('token');
    expect(token, 'Expected verification token query parameter').toBeTruthy();
    // Alter the signature, not an innocuous URL parameter. For JWTs, the last segment is the signature.
    const segments = token!.split('.');
    const last = segments.length - 1;
    const signature = segments[last];
    expect(signature.length).toBeGreaterThan(4);
    const index = Math.floor(signature.length / 2);
    segments[last] = signature.slice(0, index) + (signature[index] === 'A' ? 'B' : 'A') + signature.slice(index + 1);
    link.searchParams.set('token', segments.join('.'));
    const response = await request.get(link.toString(), { maxRedirects: 0 });
    expect(response.status()).toBeGreaterThanOrEqual(300);
    const rows = await database<{ emailVerified: boolean }>(
      'SELECT "emailVerified" FROM "user" WHERE email = $1', [email]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].emailVerified).toBe(false);
  });
});
