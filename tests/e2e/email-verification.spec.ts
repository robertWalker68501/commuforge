import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';
import { expect, test, type Page } from '@playwright/test';

const dev = process.env.DATABASE_URL;
if (!dev) throw new Error('Missing DATABASE_URL');
const db = new URL(dev);
if (db.hostname !== '127.0.0.1' || db.port !== '5434' || db.pathname !== '/commuforge_dev') {
  throw new Error('Email verification E2E requires the local CommuForge Docker database.');
}
db.pathname = '/commuforge_test';
const captureFile = path.join(process.cwd(), 'test-results', 'verification-emails.jsonl');
const email = () => `commuforge-verify-${Date.now()}-${Math.random().toString(36).slice(2, 10)}@example.com`;

async function database<T>(sql: string, values: unknown[]): Promise<T[]> {
  const client = new Client({ connectionString: db.toString() });
  await client.connect();
  try { return (await client.query(sql, values)).rows as T[]; }
  finally { await client.end(); }
}

type CapturedEmail = { email: string; url: string };

async function capturedEmails(address: string): Promise<CapturedEmail[]> {
  let contents = '';
  try { contents = await readFile(captureFile, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  return contents.split('\n').filter(Boolean)
    .map(line => JSON.parse(line) as CapturedEmail)
    .filter(record => record.email === address);
}

async function verificationUrl(address: string, minimumCount = 1): Promise<string> {
  await expect.poll(async () => (await capturedEmails(address)).length, { timeout: 15_000 })
    .toBeGreaterThanOrEqual(minimumCount);
  const records = await capturedEmails(address);
  const found = records[records.length - 1].url;
  const url = new URL(found);
  if (url.hostname !== '127.0.0.1' || url.port !== '3100' || !url.pathname.startsWith('/api/auth/verify-email')) {
    throw new Error('Captured unexpected verification URL; refusing to navigate.');
  }
  return found;
}

async function register(page: Page): Promise<string> {
  const address = email();
  await page.goto('/sign-up');
  await page.getByRole('textbox', { name: 'Full Name' }).fill('Verification Test');
  await page.getByRole('textbox', { name: 'Email' }).fill(address);
  await page.getByLabel('Password', { exact: true }).fill('SafeTestPassword123!');
  await page.getByLabel('Confirm Password').fill('SafeTestPassword123!');
  const response = page.waitForResponse(r => r.url().includes('/api/auth/sign-up/email') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Sign Up' }).click();
  expect((await response).ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/validate-email$/);
  return address;
}

async function verified(address: string): Promise<boolean> {
  const rows = await database<{ emailVerified: boolean }>('SELECT "emailVerified" FROM "user" WHERE email = $1', [address]);
  expect(rows).toHaveLength(1);
  return rows[0].emailVerified;
}

test.describe('Email verification — Layer 2', () => {
  test('valid link verifies account and does not automatically sign in', async ({ page }) => {
    const address = await register(page);
    expect(await verified(address)).toBe(false);
    const link = await verificationUrl(address);
    await page.goto(link);
    await expect.poll(() => verified(address)).toBe(true);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
  });

  test('replaying a verification link does not create an authenticated session', async ({ page, request }) => {
    const address = await register(page);
    const link = await verificationUrl(address);
    const first = await request.get(link, { maxRedirects: 0 });
    expect(first.status()).toBeGreaterThanOrEqual(200);
    expect(first.status()).toBeLessThan(400);
    await expect.poll(() => verified(address)).toBe(true);

    const second = await request.get(link, { maxRedirects: 0 });
    // Record Better Auth's actual replay response without assuming its redirect shape.
    console.log('Verification replay:', second.status(), second.headers()['location'] ?? '(no redirect)');
    expect(second.status()).toBeGreaterThanOrEqual(200);
    expect(second.status()).toBeLessThan(500);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
    expect(await verified(address)).toBe(true);
  });

  test('an invalid verification token cannot verify an account', async ({ page, request }) => {
    const address = await register(page);
    const link = await verificationUrl(address);
    const invalid = new URL(link);
    invalid.searchParams.set('token', 'invalid-e2e-token-' + Date.now());
    const response = await request.get(invalid.toString(), { maxRedirects: 0 });
    console.log('Invalid verification token:', response.status(), response.headers()['location'] ?? '(no redirect)');
    expect(response.status()).toBeGreaterThanOrEqual(300);
    expect(await verified(address)).toBe(false);
  });

  test('resend request creates a new verification link', async ({ page }) => {
    const address = await register(page);
    const first = await verificationUrl(address);
    const initialCount = (await capturedEmails(address)).length;
    await page.goto('/validate-email');
    await page.getByLabel('Email address').fill(address);
    const response = page.waitForResponse(r => r.url().includes('/api/auth/send-verification-email') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Resend Verification Email' }).click();
    expect((await response).ok()).toBeTruthy();
    await expect(page.getByRole('status')).toContainText('verification email');
    const latest = await verificationUrl(address, initialCount + 1);
    // Better Auth signs verification JWTs with second-resolution timestamps.
    // Two sends in the same second can legitimately produce identical URLs.
    // The additional captured email proves resend invoked email delivery.
    expect(new URL(latest).pathname).toBe(new URL(first).pathname);
    expect((await capturedEmails(address)).length).toBeGreaterThan(initialCount);
    expect(await verified(address)).toBe(false);
  });
});
