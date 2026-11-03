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

async function signInAsRole(page: Page, role: 'admin' | 'owner' | 'user'): Promise<void> {
  const email = `commuforge-forum-list-${randomUUID()}@example.com`;
  const response = await page.request.post('/api/auth/sign-up/email', {
    data: { name: 'Forum List E2E', email, password },
  });
  expect(response.ok(), `Sign-up returned HTTP ${response.status()}`).toBeTruthy();
  userEmails.push(email);
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
  await expect(page.getByRole('heading', { name: 'Forums', exact: true })).toBeVisible();
}


test.describe('Forum Management — List Forums — Layer 2: Authorization & Integration', () => {
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

  test('admin can access the listing and see its seeded forum', async ({ page }) => {
    const category = await seedCategory('Admin Access', 98000);
    const forum = await seedForum(category.id, 'Admin Visible', 0);
    await signInAsRole(page, 'admin');
    await openList(page);
    const row = page.locator('tbody tr').filter({ hasText: forum.name });
    await expect(row).toHaveCount(1);
    await expect(row.locator('td').nth(1)).toHaveText(category.name);
  });

  test('owner can access the listing and see its seeded forum', async ({ page }) => {
    const category = await seedCategory('Owner Access', 98001);
    const forum = await seedForum(category.id, 'Owner Visible', 0);
    await signInAsRole(page, 'owner');
    await openList(page);
    await expect(page.locator('tbody tr').filter({ hasText: forum.name })).toBeVisible();
  });

  test('regular user is redirected away from the administrative listing', async ({ page }) => {
    const category = await seedCategory('Restricted', 98002);
    const forum = await seedForum(category.id, 'Hidden From User', 0);
    await signInAsRole(page, 'user');
    await page.goto(listPath);
    await expect(page).toHaveURL(/\/dashboard\/?$/);
    await expect(page.getByRole('heading', { name: 'Forums', exact: true })).toHaveCount(0);
    await expect(page.getByText(forum.name, { exact: true })).toHaveCount(0);
  });

  test('unauthenticated visitor is redirected to sign-in', async ({ page }) => {
    await page.goto(listPath);
    await expect(page).toHaveURL(/\/sign-in\/?$/);
    await expect(page.getByRole('heading', { name: 'Forums', exact: true })).toHaveCount(0);
  });

  test('newly created forum appears in the correct category after navigation back', async ({ page }) => {
    const category = await seedCategory('New Forum', 98003);
    const otherCategory = await seedCategory('Other', 98004);
    await signInAsRole(page, 'admin');
    await openList(page);
    await page.getByRole('link', { name: 'Create Forum' }).click();
    await expect(page.getByRole('heading', { name: 'Create Forum' })).toBeVisible();

    const name = `E2E Created Forum ${randomUUID().slice(0, 8)}`;
    await page.getByRole('textbox', { name: 'Name' }).fill(name);
    await page.getByRole('textbox', { name: 'Description' }).fill('Created through the real form');
    await page.getByRole('combobox', { name: 'Category' }).click();
    await page.getByRole('option', { name: category.name, exact: true }).click();
    await page.getByRole('button', { name: 'Create Forum' }).click();
    await expect(page).toHaveURL(/\/dashboard\/forums\/?$/);

    const created = await database<{ id: string; categoryId: string; description: string }>(
      'SELECT id, "categoryId", description FROM forum WHERE name = $1',
      [name],
    );
    expect(created).toHaveLength(1);
    forumIds.push(created[0].id);
    expect(created[0].categoryId).toBe(category.id);
    expect(created[0].description).toBe('Created through the real form');

    // Refresh the listing to verify persisted data, not optimistic client state.
    await openList(page);
    const row = page.locator('tbody tr').filter({ hasText: name });
    await expect(row).toHaveCount(1);
    await expect(row.locator('td').first()).toContainText('Created through the real form');
    await expect(row.locator('td').nth(1)).toHaveText(category.name);
    await expect(page.locator('tbody tr').filter({ hasText: otherCategory.name })).toBeVisible();
  });

  test('forum creation does not disturb existing forums or category relationships', async ({ page }) => {
    const firstCategory = await seedCategory('First Relationship', 98005);
    const secondCategory = await seedCategory('Second Relationship', 98006);
    const firstForum = await seedForum(firstCategory.id, 'First Existing', 0, 'Unchanged A');
    const secondForum = await seedForum(secondCategory.id, 'Second Existing', 0, 'Unchanged B');

    await signInAsRole(page, 'admin');
    await openList(page);
    for (const [forum, category] of [[firstForum, firstCategory], [secondForum, secondCategory]] as const) {
      const row = page.locator('tbody tr').filter({ hasText: forum.name });
      await expect(row).toHaveCount(1);
      await expect(row.locator('td').nth(1)).toHaveText(category.name);
    }
    const persisted = await database<{ id: string; categoryId: string }>(
      'SELECT id, "categoryId" FROM forum WHERE id = ANY($1::text[])',
      [[firstForum.id, secondForum.id]],
    );
    expect(persisted).toHaveLength(2);
    expect(persisted.find(f => f.id === firstForum.id)?.categoryId).toBe(firstCategory.id);
    expect(persisted.find(f => f.id === secondForum.id)?.categoryId).toBe(secondCategory.id);
  });

  test('Category Management remains accessible and the forum listing remains intact', async ({ page }) => {
    const category = await seedCategory('Category Integration', 98007);
    const forum = await seedForum(category.id, 'Forum Integration', 0);
    await signInAsRole(page, 'admin');
    await openList(page);
    await expect(page.locator('tbody tr').filter({ hasText: forum.name })).toBeVisible();

    await page.goto('/dashboard/categories');
    await expect(page.getByRole('heading', { name: 'Category List' })).toBeVisible();
    await expect(page.getByText(category.name, { exact: true })).toBeVisible();

    await openList(page);
    const row = page.locator('tbody tr').filter({ hasText: forum.name });
    await expect(row).toHaveCount(1);
    await expect(row.locator('td').nth(1)).toHaveText(category.name);
  });

  test('renaming a category is reflected in the forum listing without changing its forum relationship', async ({ page }) => {
    const category = await seedCategory('Before Rename', 98008);
    const forum = await seedForum(category.id, 'Rename Integration', 0);
    await signInAsRole(page, 'admin');
    await openList(page);
    const renamed = `E2E Renamed Category ${randomUUID().slice(0, 8)}`;
    await database('UPDATE category SET name = $2, "updatedAt" = NOW() WHERE id = $1', [category.id, renamed]);
    await openList(page);

    const row = page.locator('tbody tr').filter({ hasText: forum.name });
    await expect(row.locator('td').nth(1)).toHaveText(renamed);
    const relation = await database<{ categoryId: string }>(
      'SELECT "categoryId" FROM forum WHERE id = $1',
      [forum.id],
    );
    expect(relation).toHaveLength(1);
    expect(relation[0].categoryId).toBe(category.id);
  });
});
