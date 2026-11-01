import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { expect, test, type Page } from '@playwright/test';

// Match the existing authentication specs: never modify dev or production data.
const developmentUrl = process.env.DATABASE_URL;
if (!developmentUrl) throw new Error('Missing DATABASE_URL for category E2E tests.');
const dbUrl = new URL(developmentUrl);
if (dbUrl.hostname !== '127.0.0.1' || dbUrl.port !== '5434' || dbUrl.pathname !== '/commuforge_dev') {
  throw new Error('Category E2E requires local commuforge_dev at 127.0.0.1:5434.');
}
dbUrl.pathname = '/commuforge_test';

const password = 'SafeTestPassword123!';
const createPath = '/dashboard/categories/create';
const uniqueName = () => `E2E Category ${randomUUID().slice(0, 8)}`;
const createdCategoryNames = new Set<string>();
const createdUserEmails = new Set<string>();

type CategoryRow = { id: string; name: string; description: string | null; slug: string; sortOrder: number };

async function database<T>(sql: string, values: unknown[] = []): Promise<T[]> {
  const client = new Client({ connectionString: dbUrl.toString() });
  await client.connect();
  try {
    return (await client.query(sql, values)).rows as T[];
  } finally {
    await client.end();
  }
}

async function createAccount(page: Page, role: 'admin' | 'user' = 'admin'): Promise<string> {
  const email = `commuforge-category-${randomUUID()}@example.com`;
  const response = await page.request.post('/api/auth/sign-up/email', {
    data: { name: 'Category E2E', email, password },
  });
  expect(response.ok(), `Account setup returned HTTP ${response.status()}`).toBeTruthy();
  createdUserEmails.add(email);
  const rows = await database<{ id: string }>(
    'UPDATE "user" SET "emailVerified" = true, "role" = $2 WHERE email = $1 RETURNING id',
    [email, role],
  );
  expect(rows).toHaveLength(1);
  return email;
}

async function signIn(page: Page, role: 'admin' | 'user' = 'admin'): Promise<void> {
  const email = await createAccount(page, role);
  await page.goto('/sign-in');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  const responsePromise = page.waitForResponse(response =>
    response.url().includes('/api/auth/sign-in/email') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  expect((await responsePromise).ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function openForm(page: Page): Promise<void> {
  await page.goto(createPath);
  await expect(page.getByRole('heading', { name: 'Create Category' })).toBeVisible();
}

async function submitCategory(page: Page, name: string, description?: string): Promise<void> {
  createdCategoryNames.add(name.trim());
  await page.getByRole('textbox', { name: 'Name' }).fill(name);
  if (description !== undefined) {
    await page.getByRole('textbox', { name: 'Description' }).fill(description);
  }
  await page.getByRole('button', { name: 'Create Category' }).click();
}

async function categoryByName(name: string): Promise<CategoryRow[]> {
  return database<CategoryRow>(
    'SELECT id, name, description, slug, "sortOrder" FROM category WHERE name = $1',
    [name],
  );
}

test.describe('Category Management — Create Category', () => {
  test.afterEach(async () => {
    // Only remove records owned by this spec, never other users' categories.
    if (createdCategoryNames.size) {
      await database('DELETE FROM category WHERE name = ANY($1::text[])', [[...createdCategoryNames]]);
      createdCategoryNames.clear();
    }
    if (createdUserEmails.size) {
      await database('DELETE FROM "user" WHERE email = ANY($1::text[])', [[...createdUserEmails]]);
      createdUserEmails.clear();
    }
  });

  test('admin creates a category with description and a persistent slug', async ({ page }) => {
    await signIn(page);
    await openForm(page);
    const name = uniqueName();
    await submitCategory(page, name, 'General community conversations');
    await expect(page).toHaveURL(/\/dashboard\/categories$/);
    const rows = await categoryByName(name);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name, description: 'General community conversations', slug: name.toLowerCase().replaceAll(' ', '-') });
    expect(rows[0].sortOrder).toBeGreaterThanOrEqual(0);
  });

  test('admin creates a category without a description (stored as null)', async ({ page }) => {
    await signIn(page);
    await openForm(page);
    const name = uniqueName();
    await submitCategory(page, name);
    await expect(page).toHaveURL(/\/dashboard\/categories$/);
    const rows = await categoryByName(name);
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBeNull();
  });

  test('empty name cannot be submitted', async ({ page }) => {
    await signIn(page);
    await openForm(page);
    await page.getByRole('button', { name: 'Create Category' }).click();
    await expect(page.getByText('Category name is required')).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/categories\/create$/);
  });

  test('whitespace-only name is rejected', async ({ page }) => {
    await signIn(page);
    await openForm(page);
    await submitCategory(page, '   ');
    await expect(page.getByText('Category name is required')).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/categories\/create$/);
  });

  test('duplicate slug is rejected without creating a second category', async ({ page }) => {
    await signIn(page);
    const name = uniqueName();
    await openForm(page);
    await submitCategory(page, name);
    await expect(page).toHaveURL(/\/dashboard\/categories$/);
    await openForm(page);
    await submitCategory(page, name);
    await expect(page.getByText('A category with this name or URL slug already exists.')).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/categories\/create$/);
    expect(await categoryByName(name)).toHaveLength(1);
  });

  test('punctuation-only name is rejected because it cannot produce a slug', async ({ page }) => {
    await signIn(page);
    await openForm(page);
    await submitCategory(page, '!!!');
    await expect(page.getByText('Category name must contain letters or numbers.')).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/categories\/create$/);
    expect(await categoryByName('!!!')).toHaveLength(0);
  });

  test('Clear resets both form fields', async ({ page }) => {
    await signIn(page);
    await openForm(page);
    await page.getByRole('textbox', { name: 'Name' }).fill(uniqueName());
    await page.getByRole('textbox', { name: 'Description' }).fill('Temporary description');
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('');
    await expect(page.getByRole('textbox', { name: 'Description' })).toHaveValue('');
  });

  test('new categories append after the current maximum sort order', async ({ page }) => {
    await signIn(page);
    const existing = await database<{ max: number | null }>('SELECT MAX("sortOrder") AS max FROM category');
    const name = uniqueName();
    await openForm(page);
    await submitCategory(page, name);
    await expect(page).toHaveURL(/\/dashboard\/categories$/);
    const rows = await categoryByName(name);
    expect(rows).toHaveLength(1);
    expect(rows[0].sortOrder).toBe((existing[0].max ?? -1) + 1);
  });

  test('regular users cannot access the create page', async ({ page }) => {
    await signIn(page, 'user');
    await page.goto(createPath);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Create Category' })).toHaveCount(0);
  });

  test('anonymous visitors are redirected to sign-in', async ({ page }) => {
    await page.goto(createPath);
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole('heading', { name: 'Create Category' })).toHaveCount(0);
  });
});
