import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { expect, test, type Page } from '@playwright/test';

// Mirror playwright.config.ts: E2E data must stay in the local test database.
const developmentUrl = process.env.DATABASE_URL;
if (!developmentUrl) throw new Error('Missing DATABASE_URL for category list E2E tests.');
const dbUrl = new URL(developmentUrl);
if (
  dbUrl.hostname !== '127.0.0.1' ||
  dbUrl.port !== '5434' ||
  dbUrl.pathname !== '/commuforge_dev'
) {
  throw new Error('Category list E2E requires local commuforge_dev at 127.0.0.1:5434.');
}
dbUrl.pathname = '/commuforge_test';

const listPath = '/dashboard/categories';
const password = 'SafeTestPassword123!';
const ownedCategoryIds: string[] = [];
const ownedEmails: string[] = [];

type CategoryRow = {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
};

async function database<T>(sql: string, values: unknown[] = []): Promise<T[]> {
  const client = new Client({ connectionString: dbUrl.toString() });
  await client.connect();
  try {
    return (await client.query(sql, values)).rows as T[];
  } finally {
    await client.end();
  }
}

async function signIn(page: Page, role: 'admin' | 'user' = 'admin'): Promise<void> {
  const email = `commuforge-category-list-${randomUUID()}@example.com`;
  const response = await page.request.post('/api/auth/sign-up/email', {
    data: { name: 'Category List E2E', email, password },
  });
  expect(response.ok(), `Sign-up returned HTTP ${response.status()}`).toBeTruthy();
  ownedEmails.push(email);

  const updated = await database<{ id: string }>(
    'UPDATE "user" SET "emailVerified" = true, "role" = $2 WHERE email = $1 RETURNING id',
    [email, role],
  );
  expect(updated).toHaveLength(1);

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

async function seedCategory(
  name: string,
  description: string | null,
  sortOrder: number,
): Promise<CategoryRow> {
  const id = randomUUID();
  const slug = `e2e-category-list-${randomUUID()}`;
  const rows = await database<CategoryRow>(
    `INSERT INTO category (id, name, description, slug, "sortOrder", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     RETURNING id, name, description, "sortOrder"`,
    [id, name, description, slug, sortOrder],
  );
  ownedCategoryIds.push(id);
  return rows[0];
}

async function openList(page: Page): Promise<void> {
  await page.goto(listPath);
  await expect(page.getByRole('heading', { name: 'Category List' })).toBeVisible();
}

test.describe('Category Management — List Categories', () => {
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

  test('admin sees categories and their descriptions from PostgreSQL', async ({ page }) => {
    await signIn(page);
    const suffix = randomUUID().slice(0, 8);
    const named = await seedCategory(`E2E General ${suffix}`, 'General community conversations.', 10000);
    const unnamed = await seedCategory(`E2E Technology ${suffix}`, null, 10001);

    await openList(page);
    const rows = page.locator('tbody tr');
    const first = rows.filter({ hasText: named.name });
    const second = rows.filter({ hasText: unnamed.name });

    await expect(first).toHaveCount(1);
    await expect(first.getByText(named.description!)).toBeVisible();
    await expect(second).toHaveCount(1);
    await expect(second.getByText(unnamed.name)).toBeVisible();
    await expect(second).not.toContainText('General community conversations.');
  });

  test('categories are displayed in ascending sortOrder, regardless of insertion order', async ({ page }) => {
    await signIn(page);
    const suffix = randomUUID().slice(0, 8);
    const last = await seedCategory(`E2E Last ${suffix}`, null, 20002);
    const first = await seedCategory(`E2E First ${suffix}`, null, 20000);
    const middle = await seedCategory(`E2E Middle ${suffix}`, null, 20001);

    await openList(page);
    const displayedNames = await page.locator('tbody tr td:first-child span.font-medium').allTextContents();
    const indexes = [first, middle, last].map(category => displayedNames.indexOf(category.name));
    expect(indexes.every(index => index >= 0)).toBeTruthy();
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  });

  test('categories with equal sortOrder are ordered by id', async ({ page }) => {
    await signIn(page);
    const suffix = randomUUID().slice(0, 8);
    const one = await seedCategory(`E2E Tie A ${suffix}`, null, 30000);
    const two = await seedCategory(`E2E Tie B ${suffix}`, null, 30000);

    await openList(page);
    const displayedNames = await page.locator('tbody tr td:first-child span.font-medium').allTextContents();
    const expected = [one, two].sort((a, b) => a.id.localeCompare(b.id));
    expect(displayedNames.indexOf(expected[0].name)).toBeLessThan(displayedNames.indexOf(expected[1].name));
  });

  test('Create New Category navigates to the creation page', async ({ page }) => {
    await signIn(page);
    await openList(page);
    await page.getByRole('link', { name: 'Create New Category' }).click();
    await expect(page).toHaveURL(/\/dashboard\/categories\/create$/);
    await expect(page.getByRole('heading', { name: 'Create Category' })).toBeVisible();
  });

  test('shows the empty-state message when the test database has no categories', async ({ page }) => {
    const existing = await database<{ count: string }>('SELECT COUNT(*)::text AS count FROM category');
    test.skip(Number(existing[0].count) !== 0, 'Test database contains existing categories; do not delete unrelated data.');

    await signIn(page);
    await openList(page);
    await expect(page.getByText('No categories have been created yet.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create New Category' })).toBeVisible();
  });

  test('regular users cannot access the category list', async ({ page }) => {
    await signIn(page, 'user');
    await page.goto(listPath);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Category List' })).toHaveCount(0);
  });

  test('anonymous visitors are redirected to sign-in', async ({ page }) => {
    await page.goto(listPath);
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole('heading', { name: 'Category List' })).toHaveCount(0);
  });
});
