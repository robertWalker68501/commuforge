import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { expect, test, type Page } from '@playwright/test';

// Match playwright.config.ts: never modify development or production records.
const developmentUrl = process.env.DATABASE_URL;
if (!developmentUrl) throw new Error('Missing DATABASE_URL for Forum List E2E tests.');
const dbUrl = new URL(developmentUrl);
if (
  dbUrl.hostname !== '127.0.0.1' ||
  dbUrl.port !== '5434' ||
  dbUrl.pathname !== '/commuforge_dev'
) {
  throw new Error('Forum List E2E requires local commuforge_dev at 127.0.0.1:5434.');
}
dbUrl.pathname = '/commuforge_test';

const password = 'SafeTestPassword123!';
const listPath = '/dashboard/forums';
const categoryIds: string[] = [];
const forumIds: string[] = [];
const userEmails: string[] = [];

type Category = { id: string; name: string };
type Forum = { id: string; name: string };

async function database<T>(sql: string, values: unknown[] = []): Promise<T[]> {
  const client = new Client({ connectionString: dbUrl.toString() });
  await client.connect();
  try {
    return (await client.query(sql, values)).rows as T[];
  } finally {
    await client.end();
  }
}

async function seedCategory(label: string, sortOrder: number): Promise<Category> {
  const id = randomUUID();
  const name = `E2E ${label} ${randomUUID().slice(0, 8)}`;
  const rows = await database<Category>(
    `INSERT INTO category (id, name, slug, "sortOrder", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING id, name`,
    [id, name, `e2e-forum-list-${id}`, sortOrder],
  );
  categoryIds.push(id);
  return rows[0];
}

async function seedForum(categoryId: string, label: string, sortOrder: number, description: string | null = null): Promise<Forum> {
  const id = randomUUID();
  const name = `E2E ${label} ${randomUUID().slice(0, 8)}`;
  const rows = await database<Forum>(
    `INSERT INTO forum (id, name, description, slug, "categoryId", "sortOrder", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) RETURNING id, name`,
    [id, name, description, `e2e-forum-list-${id}`, categoryId, sortOrder],
  );
  forumIds.push(id);
  return rows[0];
}

async function signInAsAdmin(page: Page): Promise<void> {
  const email = `commuforge-forum-list-${randomUUID()}@example.com`;
  const response = await page.request.post('/api/auth/sign-up/email', {
    data: { name: 'Forum List E2E', email, password },
  });
  expect(response.ok(), `Sign-up returned HTTP ${response.status()}`).toBeTruthy();
  userEmails.push(email);
  const rows = await database<{ id: string }>(
    'UPDATE "user" SET "emailVerified" = true, "role" = $2 WHERE email = $1 RETURNING id',
    [email, 'admin'],
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
  await expect(page.getByRole('heading', { name: 'Forums', exact: true })).toBeVisible();
}

test.describe('Forum Management — List Forums — Layer 1: Listing & Data Integrity', () => {
  test.afterEach(async () => {
    if (forumIds.length) {
      await database('DELETE FROM forum WHERE id = ANY($1::text[])', [[...forumIds]]);
      forumIds.length = 0;
    }
    if (categoryIds.length) {
      await database('DELETE FROM category WHERE id = ANY($1::text[])', [[...categoryIds]]);
      categoryIds.length = 0;
    }
    if (userEmails.length) {
      await database('DELETE FROM "user" WHERE email = ANY($1::text[])', [[...userEmails]]);
      userEmails.length = 0;
    }
  });

  test('displays forum names and descriptions with Forum before Category', async ({ page }) => {
    const category = await seedCategory('General', 90000);
    const forum = await seedForum(category.id, 'Introductions', 0, 'Welcome to the community.');
    await signInAsAdmin(page);
    await openList(page);

    const row = page.locator('tbody tr').filter({ hasText: forum.name });
    await expect(row).toHaveCount(1);
    const cells = row.locator('td');
    await expect(cells).toHaveCount(3);
    await expect(cells.nth(0)).toContainText(forum.name);
    await expect(cells.nth(0)).toContainText('Welcome to the community.');
    await expect(cells.nth(1)).toHaveText(category.name);
    await expect(cells.nth(2)).toBeEmpty();
  });

  test('shows multiple forums under one merged Category cell', async ({ page }) => {
    const category = await seedCategory('Software', 90001);
    const first = await seedForum(category.id, 'Editors', 0, 'Code editors.');
    const second = await seedForum(category.id, 'Frameworks', 1, 'Web frameworks.');
    await signInAsAdmin(page);
    await openList(page);

    const firstRow = page.locator('tbody tr').filter({ hasText: first.name });
    const secondRow = page.locator('tbody tr').filter({ hasText: second.name });
    await expect(firstRow.locator('td')).toHaveCount(3);
    await expect(firstRow.locator('td').nth(1)).toHaveAttribute('rowspan', '2');
    await expect(firstRow.locator('td').nth(1)).toHaveText(category.name);
    await expect(secondRow.locator('td')).toHaveCount(2);
    await expect(secondRow.locator('td').first()).toContainText(second.name);
    await expect(page.locator('tbody td').getByText(category.name, { exact: true })).toHaveCount(1);
  });

  test('categories are ordered by sortOrder, not by insertion order', async ({ page }) => {
    const last = await seedCategory('Last', 91002);
    const first = await seedCategory('First', 91000);
    const middle = await seedCategory('Middle', 91001);
    await seedForum(last.id, 'Last Forum', 0);
    await seedForum(first.id, 'First Forum', 0);
    await seedForum(middle.id, 'Middle Forum', 0);
    await signInAsAdmin(page);
    await openList(page);

    const names = await page.locator('tbody td[rowspan], tbody tr td:nth-child(2)').allTextContents();
    const positions = [first, middle, last].map(c => names.indexOf(c.name));
    expect(positions.every(i => i >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  test('forums within a category are ordered by sortOrder', async ({ page }) => {
    const category = await seedCategory('Ordering', 92000);
    const last = await seedForum(category.id, 'Last', 20);
    const first = await seedForum(category.id, 'First', 0);
    const middle = await seedForum(category.id, 'Middle', 10);
    await signInAsAdmin(page);
    await openList(page);

    const names = await page.locator('tbody tr td:first-child').allTextContents();
    const positions = [first, middle, last].map(f => names.findIndex(n => n.includes(f.name)));
    expect(positions.every(i => i >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  test('categories with equal sortOrder use id as tie-breaker', async ({ page }) => {
    const a = await seedCategory('Tie A', 93000);
    const b = await seedCategory('Tie B', 93000);
    await seedForum(a.id, 'A', 0);
    await seedForum(b.id, 'B', 0);
    await signInAsAdmin(page);
    await openList(page);

    const names = await page.locator('tbody tr td:nth-child(2)').allTextContents();
    const expected = [a, b].sort((x, y) => x.id.localeCompare(y.id));
    expect(names.indexOf(expected[0].name)).toBeLessThan(names.indexOf(expected[1].name));
  });

  test('forums with equal sortOrder use id as tie-breaker', async ({ page }) => {
    const category = await seedCategory('Forum Tie', 94000);
    const a = await seedForum(category.id, 'Tie A', 5);
    const b = await seedForum(category.id, 'Tie B', 5);
    await signInAsAdmin(page);
    await openList(page);

    const names = await page.locator('tbody tr td:first-child').allTextContents();
    const expected = [a, b].sort((x, y) => x.id.localeCompare(y.id));
    const indexA = names.findIndex(n => n.includes(expected[0].name));
    const indexB = names.findIndex(n => n.includes(expected[1].name));
    expect(indexA).toBeGreaterThanOrEqual(0);
    expect(indexB).toBeGreaterThanOrEqual(0);
    expect(indexA).toBeLessThan(indexB);
  });

  test('category without forums displays its name and empty-state message', async ({ page }) => {
    const category = await seedCategory('Empty', 95000);
    await signInAsAdmin(page);
    await openList(page);

    const row = page.locator('tbody tr').filter({ hasText: category.name });
    await expect(row).toHaveCount(1);
    await expect(row.locator('td').first()).toHaveText('No forums have been created in this category.');
    await expect(row.locator('td').nth(1)).toHaveText(category.name);
  });

  test('forum without description displays only its name', async ({ page }) => {
    const category = await seedCategory('No Description', 96000);
    const forum = await seedForum(category.id, 'Undescribed', 0);
    await signInAsAdmin(page);
    await openList(page);

    const cell = page.locator('tbody tr').filter({ hasText: forum.name }).locator('td').first();
    await expect(cell).toHaveText(forum.name);
  });

  test('Create Forum link navigates to the creation page', async ({ page }) => {
    await seedCategory('Navigation', 97000);
    await signInAsAdmin(page);
    await openList(page);
    await page.getByRole('link', { name: 'Create Forum' }).click();
    await expect(page).toHaveURL(/\/dashboard\/forums\/create\/?$/);
    await expect(page.getByRole('heading', { name: 'Create Forum' })).toBeVisible();
  });

  test('shows no-categories empty state only when test database has no categories', async ({ page }) => {
    const existing = await database<{ count: string }>('SELECT COUNT(*)::text AS count FROM category');
    test.skip(Number(existing[0].count) !== 0, 'Test database contains categories; preserve unrelated records.');

    await signInAsAdmin(page);
    await openList(page);
    await expect(page.getByText('No categories have been created. Create a category before adding a forum.')).toBeVisible();
  });
});
