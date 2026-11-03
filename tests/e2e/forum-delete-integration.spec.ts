import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { expect, test, type Page } from '@playwright/test';

// Use the same isolated local test database boundary as existing CommuForge E2E specs.
const developmentUrl = process.env.DATABASE_URL;
if (!developmentUrl) throw new Error('Missing DATABASE_URL for Forum Delete E2E tests.');
const dbUrl = new URL(developmentUrl);
if (
  dbUrl.hostname !== '127.0.0.1' ||
  dbUrl.port !== '5434' ||
  dbUrl.pathname !== '/commuforge_dev'
) {
  throw new Error('Forum Delete E2E requires local commuforge_dev at 127.0.0.1:5434.');
}
dbUrl.pathname = '/commuforge_test';

const listPath = '/dashboard/forums';
const password = 'SafeTestPassword123!';
const categoryIds: string[] = [];
const forumIds: string[] = [];
const userEmails: string[] = [];

type ForumRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  categoryId: string;
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

async function seedCategory(): Promise<{ id: string; name: string }> {
  const id = randomUUID();
  const suffix = id.slice(0, 8);
  const name = `E2E Delete Category ${suffix}`;
  await database(
    `INSERT INTO category (id, name, slug, "sortOrder", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, NOW(), NOW())`,
    [id, name, `e2e-delete-category-${suffix}`, 48000],
  );
  categoryIds.push(id);
  return { id, name };
}

async function seedForum(categoryId: string, sortOrder: number, description: string | null = 'Forum deletion test'): Promise<ForumRow> {
  const id = randomUUID();
  const suffix = id.slice(0, 8);
  const name = `E2E Delete Forum ${suffix}`;
  const rows = await database<ForumRow>(
    `INSERT INTO forum (id, name, slug, description, "categoryId", "sortOrder", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
     RETURNING id, name, slug, description, "categoryId" AS "categoryId", "sortOrder" AS "sortOrder"`,
    [id, name, `e2e-delete-forum-${suffix}`, description, categoryId, sortOrder],
  );
  forumIds.push(id);
  return rows[0];
}

async function findForum(id: string): Promise<ForumRow | undefined> {
  return (await database<ForumRow>(
    `SELECT id, name, slug, description, "categoryId" AS "categoryId", "sortOrder" AS "sortOrder"
     FROM forum WHERE id = $1`,
    [id],
  ))[0];
}

async function signInAsAdmin(page: Page): Promise<void> {
  const email = `commuforge-forum-delete-${randomUUID()}@example.com`;
  const response = await page.request.post('/api/auth/sign-up/email', {
    data: { name: 'Forum Delete E2E', email, password },
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
  const signInResponse = page.waitForResponse(r =>
    r.url().includes('/api/auth/sign-in/email') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  expect((await signInResponse).ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function openList(page: Page): Promise<void> {
  await page.goto(listPath);
  await expect(page.getByRole('heading', { name: 'Forums', exact: true })).toBeVisible();
}

async function openDeleteDialog(page: Page, forum: ForumRow): Promise<void> {
  await page.getByRole('button', { name: `Delete ${forum.name}`, exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: `Delete ${forum.name}?`, exact: true })).toBeVisible();
}

async function confirmDelete(page: Page): Promise<void> {
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete Forum' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
}

test.describe('Forum Management — Delete Forum — Layer 3: Integration & Edge Cases', () => {
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

  test('forum deleted after confirmation dialog opens returns an error without recreating it', async ({ page }) => {
    const category = await seedCategory();
    const forum = await seedForum(category.id, 0);
    await signInAsAdmin(page);
    await openList(page);
    await openDeleteDialog(page, forum);

    // Simulate a second administrator deleting the forum before confirmation.
    await database('DELETE FROM forum WHERE id = $1', [forum.id]);
    await confirmDelete(page);
    await expect(page.getByText('Forum does not exist.', { exact: true })).toBeVisible();
    expect(await findForum(forum.id)).toBeUndefined();
    expect((await database('SELECT id FROM category WHERE id = $1', [category.id]))).toHaveLength(1);
  });

  test('two open confirmation dialogs cannot delete the same forum twice', async ({ page, context }) => {
    const category = await seedCategory();
    const forum = await seedForum(category.id, 0);
    await signInAsAdmin(page);
    const other = await context.newPage();
    await openList(page);
    await openList(other);
    await openDeleteDialog(page, forum);
    await openDeleteDialog(other, forum);

    await confirmDelete(page);
    await expect(page.getByText('Forum deleted successfully.', { exact: true })).toBeVisible();
    await confirmDelete(other);
    await expect(other.getByText('Forum does not exist.', { exact: true })).toBeVisible();
    expect(await findForum(forum.id)).toBeUndefined();
  });

  test('deleting a forum preserves unrelated categories and their forums', async ({ page }) => {
    const first = await seedCategory();
    const second = await seedCategory();
    const deleted = await seedForum(first.id, 5);
    const keptInFirst = await seedForum(first.id, 12);
    const keptInSecond = await seedForum(second.id, 3);
    await signInAsAdmin(page);
    await openList(page);
    await openDeleteDialog(page, deleted);
    await confirmDelete(page);

    expect(await findForum(deleted.id)).toBeUndefined();
    expect(await findForum(keptInFirst.id)).toEqual(keptInFirst);
    expect(await findForum(keptInSecond.id)).toEqual(keptInSecond);
    const categories = await database<{ id: string }>(
      'SELECT id FROM category WHERE id = ANY($1::text[])', [[first.id, second.id]],
    );
    expect(categories).toHaveLength(2);
    await expect(page.getByText(keptInFirst.name, { exact: true })).toBeVisible();
    await expect(page.getByText(keptInSecond.name, { exact: true })).toBeVisible();
  });

  test('deleting the last forum retains its category and displays its empty state', async ({ page }) => {
    const category = await seedCategory();
    const forum = await seedForum(category.id, 0);
    await signInAsAdmin(page);
    await openList(page);
    await openDeleteDialog(page, forum);
    await confirmDelete(page);
    await page.reload();

    await expect(page.getByText(category.name, { exact: true })).toBeVisible();
    const categoryRow = page.getByRole('row').filter({ hasText: category.name });
    await expect(
      categoryRow.getByRole('cell', { name: 'No forums have been created in this category.' }),
    ).toBeVisible();
    expect(await findForum(forum.id)).toBeUndefined();
    expect((await database('SELECT id FROM category WHERE id = $1', [category.id]))).toHaveLength(1);
  });

  test('Category Management remains accessible and categories are unchanged after forum deletion', async ({ page }) => {
    const category = await seedCategory();
    const forum = await seedForum(category.id, 0);
    await signInAsAdmin(page);
    await openList(page);
    await openDeleteDialog(page, forum);
    await confirmDelete(page);

    await page.goto('/dashboard/categories');
    await expect(page.getByText(category.name, { exact: true })).toBeVisible();
    expect((await database('SELECT id FROM category WHERE id = $1', [category.id]))).toHaveLength(1);
    expect(await findForum(forum.id)).toBeUndefined();
  });
});
