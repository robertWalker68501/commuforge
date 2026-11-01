import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { expect, test, type Page } from '@playwright/test';

const developmentUrl = process.env.DATABASE_URL;
if (!developmentUrl) throw new Error('Missing DATABASE_URL for category delete E2E tests.');
const dbUrl = new URL(developmentUrl);
if (dbUrl.hostname !== '127.0.0.1' || dbUrl.port !== '5434' || dbUrl.pathname !== '/commuforge_dev') {
  throw new Error('Category delete E2E requires local commuforge_dev at 127.0.0.1:5434.');
}
dbUrl.pathname = '/commuforge_test';

const listPath = '/dashboard/categories';
const password = 'SafeTestPassword123!';
const ownedCategoryIds: string[] = [];
const ownedEmails: string[] = [];

type CategoryRow = { id: string; name: string; slug: string; description: string | null; sortOrder: number };

async function database<T>(sql: string, values: unknown[] = []): Promise<T[]> {
  const client = new Client({ connectionString: dbUrl.toString() });
  await client.connect();
  try {
    return (await client.query(sql, values)).rows as T[];
  } finally {
    await client.end();
  }
}

async function seedCategory(sortOrder = 45000): Promise<CategoryRow> {
  const id = randomUUID();
  const suffix = randomUUID().slice(0, 8);
  const rows = await database<CategoryRow>(
    `INSERT INTO category (id, name, slug, description, "sortOrder", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     RETURNING id, name, slug, description, "sortOrder"`,
    [id, `E2E Delete ${suffix}`, `e2e-delete-${suffix}`, 'Test category', sortOrder],
  );
  ownedCategoryIds.push(id);
  return rows[0];
}

async function findCategory(id: string): Promise<CategoryRow | undefined> {
  const rows = await database<CategoryRow>(
    'SELECT id, name, slug, description, "sortOrder" FROM category WHERE id = $1', [id],
  );
  return rows[0];
}

async function signIn(page: Page, role: 'admin' | 'owner' | 'user' = 'admin'): Promise<void> {
  const email = `commuforge-category-delete-${randomUUID()}@example.com`;
  const response = await page.request.post('/api/auth/sign-up/email', {
    data: { name: 'Category Delete E2E', email, password },
  });
  expect(response.ok(), `Sign-up returned HTTP ${response.status()}`).toBeTruthy();
  ownedEmails.push(email);
  const rows = await database<{ id: string }>(
    'UPDATE "user" SET "emailVerified" = true, "role" = $2 WHERE email = $1 RETURNING id',
    [email, role],
  );
  expect(rows).toHaveLength(1);
  await page.goto('/sign-in');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  const signInResponse = page.waitForResponse(r =>
    r.url().includes('/api/auth/sign-in/email') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  expect((await signInResponse).ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function openList(page: Page): Promise<void> {
  await page.goto(listPath);
  await expect(page.getByRole('heading', { name: 'Category List' })).toBeVisible();
}

async function openDeleteDialog(page: Page, category: CategoryRow): Promise<void> {
  await page.getByRole('button', { name: `Delete ${category.name}`, exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await expect(page.getByRole('alertdialog').getByRole('heading', { name: `Delete ${category.name}?` })).toBeVisible();
}

async function confirmDelete(page: Page): Promise<void> {
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete Category' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
}

test.describe('Category Management — Delete Category', () => {
  test.afterEach(async () => {
    if (ownedCategoryIds.length) {
      await database('DELETE FROM category WHERE id = ANY($1::text[])', [[...ownedCategoryIds]]);
      ownedCategoryIds.length = 0;
    }
    if (ownedEmails.length) {
      await database('DELETE FROM "user" WHERE email = ANY($1::text[])', [[...ownedEmails]]);
      ownedEmails.length = 0;
    }
  });

  test('confirmation names the selected category and Cancel preserves it', async ({ page }) => {
    const category = await seedCategory();
    await signIn(page);
    await openList(page);
    await openDeleteDialog(page, category);
    await expect(page.getByRole('alertdialog')).toContainText(`Are you sure you want to delete the category "${category.name}"?`);
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: `Delete ${category.name}` })).toBeVisible();
    expect(await findCategory(category.id)).toEqual(category);
  });

  test('admin confirms deletion, sees success feedback, and row disappears', async ({ page }) => {
    const category = await seedCategory();
    await signIn(page);
    await openList(page);
    await openDeleteDialog(page, category);
    await confirmDelete(page);
    await expect(page.getByText('Category deleted successfully.')).toBeVisible();
    await expect(page.getByRole('button', { name: `Delete ${category.name}` })).toHaveCount(0);
    expect(await findCategory(category.id)).toBeUndefined();
    await page.reload();
    await expect(page.getByRole('button', { name: `Delete ${category.name}` })).toHaveCount(0);
  });

  test('deleting a middle category leaves remaining category data and sortOrder gaps intact', async ({ page }) => {
    const first = await seedCategory(46000);
    const middle = await seedCategory(46001);
    const last = await seedCategory(46002);
    await signIn(page);
    await openList(page);
    await openDeleteDialog(page, middle);
    await confirmDelete(page);
    expect(await findCategory(middle.id)).toBeUndefined();
    expect(await findCategory(first.id)).toEqual(first);
    expect(await findCategory(last.id)).toEqual(last);
    await expect(page.getByRole('button', { name: `Delete ${first.name}` })).toBeVisible();
    await expect(page.getByRole('button', { name: `Delete ${last.name}` })).toBeVisible();
  });

  test('owner can delete a category', async ({ page }) => {
    const category = await seedCategory();
    await signIn(page, 'owner');
    await openList(page);
    await openDeleteDialog(page, category);
    await confirmDelete(page);
    expect(await findCategory(category.id)).toBeUndefined();
  });

  test('regular users cannot access category deletion controls', async ({ page }) => {
    const category = await seedCategory();
    await signIn(page, 'user');
    await page.goto(listPath);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('button', { name: `Delete ${category.name}` })).toHaveCount(0);
    expect(await findCategory(category.id)).toEqual(category);
  });

  test('anonymous visitors cannot access category deletion controls', async ({ page }) => {
    const category = await seedCategory();
    await page.goto(listPath);
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole('button', { name: `Delete ${category.name}` })).toHaveCount(0);
    expect(await findCategory(category.id)).toEqual(category);
  });

  test('invalid and nonexistent IDs are rejected by the Server Action without deleting data', async ({ page }) => {
    const capture = await seedCategory();
    const protectedCategory = await seedCategory();
    await signIn(page);
    await openList(page);
    await openDeleteDialog(page, capture);
    const actionRequestPromise = page.waitForRequest(request =>
      request.method() === 'POST' && Boolean(request.headers()['next-action']),
    );
    await confirmDelete(page);
    const captured = await actionRequestPromise;
    const actionId = captured.headers()['next-action'];
    expect(actionId).toBeTruthy();
    const headers = { 'Next-Action': actionId, 'Content-Type': 'text/plain;charset=UTF-8' };
    for (const id of ['invalid-uuid', randomUUID()]) {
      await page.request.post(listPath, { headers, data: JSON.stringify([id]), maxRedirects: 0 });
      expect(await findCategory(protectedCategory.id)).toEqual(protectedCategory);
    }
  });

  test('direct Server Action replay cannot delete as a regular or anonymous user', async ({ page, browser }) => {
    const capture = await seedCategory();
    const target = await seedCategory();
    await signIn(page);
    await openList(page);
    await openDeleteDialog(page, capture);
    const actionRequestPromise = page.waitForRequest(request =>
      request.method() === 'POST' && Boolean(request.headers()['next-action']),
    );
    await confirmDelete(page);
    const captured = await actionRequestPromise;
    const actionId = captured.headers()['next-action'];
    expect(actionId).toBeTruthy();
    const headers = { 'Next-Action': actionId, 'Content-Type': 'text/plain;charset=UTF-8' };
    const payload = JSON.stringify([target.id]);
    const regularContext = await browser.newContext();
    const anonymousContext = await browser.newContext();
    try {
      const regularPage = await regularContext.newPage();
      await signIn(regularPage, 'user');
      await regularPage.request.post(listPath, { headers, data: payload, maxRedirects: 0 });
      expect(await findCategory(target.id)).toEqual(target);
      await anonymousContext.request.post(listPath, { headers, data: payload, maxRedirects: 0 });
      expect(await findCategory(target.id)).toEqual(target);
    } finally {
      await regularContext.close();
      await anonymousContext.close();
    }
  });
});
