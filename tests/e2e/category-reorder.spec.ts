import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { expect, test, type Page } from '@playwright/test';

const developmentUrl = process.env.DATABASE_URL;
if (!developmentUrl) throw new Error('Missing DATABASE_URL for category reorder E2E tests.');
const dbUrl = new URL(developmentUrl);
if (dbUrl.hostname !== '127.0.0.1' || dbUrl.port !== '5434' || dbUrl.pathname !== '/commuforge_dev') {
  throw new Error('Category reorder E2E requires local commuforge_dev at 127.0.0.1:5434.');
}
dbUrl.pathname = '/commuforge_test';

const listPath = '/dashboard/categories';
const password = 'SafeTestPassword123!';
const categoryIds: string[] = [];
const emails: string[] = [];
type Category = { id: string; name: string; sortOrder: number };

async function database<T>(sql: string, values: unknown[] = []): Promise<T[]> {
  const client = new Client({ connectionString: dbUrl.toString() });
  await client.connect();
  try { return (await client.query(sql, values)).rows as T[]; }
  finally { await client.end(); }
}

async function seedCategory(sortOrder: number): Promise<Category> {
  const id = randomUUID();
  const suffix = randomUUID().slice(0, 8);
  const rows = await database<Category>(
    `INSERT INTO category (id, name, slug, description, "sortOrder", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, NULL, $4, NOW(), NOW()) RETURNING id, name, "sortOrder"`,
    [id, `E2E Reorder ${suffix}`, `e2e-reorder-${suffix}`, sortOrder],
  );
  categoryIds.push(id);
  return rows[0];
}

async function getCategory(id: string): Promise<Category | undefined> {
  return (await database<Category>('SELECT id, name, "sortOrder" FROM category WHERE id = $1', [id]))[0];
}

async function edgeOrders(): Promise<{ low: number; high: number }> {
  const [row] = await database<{ low: number; high: number }>(
    'SELECT COALESCE(MIN("sortOrder"), 0)::int AS low, COALESCE(MAX("sortOrder"), 0)::int AS high FROM category',
  );
  return row;
}

async function signIn(page: Page, role: 'admin' | 'owner' | 'user' = 'admin'): Promise<void> {
  const email = `commuforge-reorder-${randomUUID()}@example.com`;
  const response = await page.request.post('/api/auth/sign-up/email', {
    data: { name: 'Category Reorder E2E', email, password },
  });
  expect(response.ok(), `Sign-up returned HTTP ${response.status()}`).toBeTruthy();
  emails.push(email);
  const rows = await database<{ id: string }>(
    'UPDATE "user" SET "emailVerified" = true, "role" = $2 WHERE email = $1 RETURNING id',
    [email, role],
  );
  expect(rows).toHaveLength(1);
  await page.goto('/sign-in');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  const responsePromise = page.waitForResponse(r =>
    r.url().includes('/api/auth/sign-in/email') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  expect((await responsePromise).ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function openList(page: Page): Promise<void> {
  await page.goto(listPath);
  await expect(page.getByRole('heading', { name: 'Category List' })).toBeVisible();
}

function moveButton(page: Page, category: Category, direction: 'up' | 'down') {
  return page.getByRole('button', { name: `Move ${category.name} ${direction}`, exact: true });
}

async function move(page: Page, category: Category, direction: 'up' | 'down'): Promise<void> {
  await moveButton(page, category, direction).click();
  await expect(page.getByText('Category moved successfully.')).toBeVisible();
}

async function expectBefore(page: Page, first: Category, second: Category): Promise<void> {
  await expect.poll(async () => {
    const rows = await page.locator('table tbody tr').allTextContents();
    return rows.findIndex(row => row.includes(first.name)) < rows.findIndex(row => row.includes(second.name));
  }).toBe(true);
}

test.describe('Category Management — Reorder Categories', () => {
  test.afterEach(async () => {
    if (categoryIds.length) {
      await database('DELETE FROM category WHERE id = ANY($1::text[])', [[...categoryIds]]);
      categoryIds.length = 0;
    }
    if (emails.length) {
      await database('DELETE FROM "user" WHERE email = ANY($1::text[])', [[...emails]]);
      emails.length = 0;
    }
  });

  test('admin moves up and down, preserving gaps and persisted order', async ({ page }) => {
    const { high } = await edgeOrders();
    const first = await seedCategory(high + 100);
    const middle = await seedCategory(high + 105);
    const last = await seedCategory(high + 112);
    await signIn(page);
    await openList(page);
    await expectBefore(page, first, middle);
    await move(page, middle, 'up');
    await expectBefore(page, middle, first);
    expect((await getCategory(middle.id))?.sortOrder).toBe(high + 100);
    expect((await getCategory(first.id))?.sortOrder).toBe(high + 105);
    expect((await getCategory(last.id))?.sortOrder).toBe(high + 112);
    await page.reload();
    await expectBefore(page, middle, first);
    await move(page, middle, 'down');
    await expectBefore(page, first, middle);
    expect((await getCategory(middle.id))?.sortOrder).toBe(high + 105);
    expect((await getCategory(first.id))?.sortOrder).toBe(high + 100);
    expect((await getCategory(last.id))?.sortOrder).toBe(high + 112);
  });

  test('first Up and last Down are disabled', async ({ page }) => {
    const { low, high } = await edgeOrders();
    const first = await seedCategory(low - 100);
    const last = await seedCategory(high + 100);
    await signIn(page);
    await openList(page);
    await expect(moveButton(page, first, 'up')).toBeDisabled();
    await expect(moveButton(page, last, 'down')).toBeDisabled();
    await expect(moveButton(page, first, 'down')).toBeEnabled();
    await expect(moveButton(page, last, 'up')).toBeEnabled();
  });

  test('owner can reorder categories', async ({ page }) => {
    const { high } = await edgeOrders();
    const first = await seedCategory(high + 100);
    const second = await seedCategory(high + 107);
    await signIn(page, 'owner');
    await openList(page);
    await move(page, second, 'up');
    expect((await getCategory(second.id))?.sortOrder).toBe(high + 100);
    expect((await getCategory(first.id))?.sortOrder).toBe(high + 107);
  });

  test('regular users cannot access reorder controls', async ({ page }) => {
    const category = await seedCategory((await edgeOrders()).high + 100);
    await signIn(page, 'user');
    await page.goto(listPath);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(moveButton(page, category, 'up')).toHaveCount(0);
    expect(await getCategory(category.id)).toEqual(category);
  });

  test('anonymous visitors cannot access reorder controls', async ({ page }) => {
    const category = await seedCategory((await edgeOrders()).high + 100);
    await page.goto(listPath);
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(moveButton(page, category, 'up')).toHaveCount(0);
    expect(await getCategory(category.id)).toEqual(category);
  });

  test('invalid IDs, missing categories, and invalid directions cannot mutate order', async ({ page }) => {
    const { high } = await edgeOrders();
    const first = await seedCategory(high + 100);
    const second = await seedCategory(high + 107);
    await signIn(page);
    await openList(page);
    const capturedPromise = page.waitForRequest(r => r.method() === 'POST' && Boolean(r.headers()['next-action']));
    await move(page, second, 'up');
    const actionId = (await capturedPromise).headers()['next-action'];
    expect(actionId).toBeTruthy();
    const headers = { 'Next-Action': actionId, 'Content-Type': 'text/plain;charset=UTF-8' };
    const beforeFirst = await getCategory(first.id);
    const beforeSecond = await getCategory(second.id);
    for (const input of [
      { id: 'invalid-uuid', direction: 'up' },
      { id: randomUUID(), direction: 'down' },
      { id: first.id, direction: 'sideways' },
    ]) {
      await page.request.post(listPath, { headers, data: JSON.stringify([input]), maxRedirects: 0 });
      expect(await getCategory(first.id)).toEqual(beforeFirst);
      expect(await getCategory(second.id)).toEqual(beforeSecond);
    }
  });

  test('direct Server Action replay cannot reorder as a regular or anonymous user', async ({ page, browser }) => {
    const { high } = await edgeOrders();
    const capture = await seedCategory(high + 100);
    const target = await seedCategory(high + 107);
    await signIn(page);
    await openList(page);
    const capturedPromise = page.waitForRequest(r => r.method() === 'POST' && Boolean(r.headers()['next-action']));
    await move(page, target, 'up');
    const actionId = (await capturedPromise).headers()['next-action'];
    expect(actionId).toBeTruthy();
    const headers = { 'Next-Action': actionId, 'Content-Type': 'text/plain;charset=UTF-8' };
    const payload = JSON.stringify([{ id: target.id, direction: 'down' }]);
    const beforeCapture = await getCategory(capture.id);
    const beforeTarget = await getCategory(target.id);
    const regularContext = await browser.newContext();
    const anonymousContext = await browser.newContext();
    try {
      const regularPage = await regularContext.newPage();
      await signIn(regularPage, 'user');
      await regularPage.request.post(listPath, { headers, data: payload, maxRedirects: 0 });
      expect(await getCategory(capture.id)).toEqual(beforeCapture);
      expect(await getCategory(target.id)).toEqual(beforeTarget);
      await anonymousContext.request.post(listPath, { headers, data: payload, maxRedirects: 0 });
      expect(await getCategory(capture.id)).toEqual(beforeCapture);
      expect(await getCategory(target.id)).toEqual(beforeTarget);
    } finally {
      await regularContext.close();
      await anonymousContext.close();
    }
  });
});
