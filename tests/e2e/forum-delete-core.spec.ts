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

test.describe('Forum Management — Delete Forum — Layer 1: Core Deletion Workflow', () => {
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

  test('confirmation names the selected forum and Cancel preserves it', async ({ page }) => {
    const category = await seedCategory();
    const forum = await seedForum(category.id, 0);
    await signInAsAdmin(page);
    await openList(page);
    await openDeleteDialog(page, forum);
    await expect(page.getByRole('alertdialog')).toContainText(
      `Are you sure you want to delete the forum "${forum.name}"?`,
    );
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: `Delete ${forum.name}` })).toBeVisible();
    expect(await findForum(forum.id)).toEqual(forum);
  });

  test('confirming deletion closes the dialog, displays success, and removes the forum', async ({ page }) => {
    const category = await seedCategory();
    const forum = await seedForum(category.id, 0);
    await signInAsAdmin(page);
    await openList(page);
    await openDeleteDialog(page, forum);
    await confirmDelete(page);
    await expect(page.getByText('Forum deleted successfully.')).toBeVisible();
    await expect(page.getByRole('button', { name: `Delete ${forum.name}` })).toHaveCount(0);
    expect(await findForum(forum.id)).toBeUndefined();
  });

  test('deletion persists after reloading the forum listing', async ({ page }) => {
    const category = await seedCategory();
    const forum = await seedForum(category.id, 0);
    await signInAsAdmin(page);
    await openList(page);
    await openDeleteDialog(page, forum);
    await confirmDelete(page);
    await page.reload();
    await expect(page.getByRole('button', { name: `Delete ${forum.name}` })).toHaveCount(0);
    expect(await findForum(forum.id)).toBeUndefined();
  });

  test('deleting the middle forum preserves other forums and their sortOrder gaps', async ({ page }) => {
    const category = await seedCategory();
    const first = await seedForum(category.id, 10);
    const middle = await seedForum(category.id, 20);
    const last = await seedForum(category.id, 30);
    await signInAsAdmin(page);
    await openList(page);
    await openDeleteDialog(page, middle);
    await confirmDelete(page);
    expect(await findForum(middle.id)).toBeUndefined();
    expect(await findForum(first.id)).toEqual(first);
    expect(await findForum(last.id)).toEqual(last);
    await expect(page.getByRole('button', { name: `Delete ${first.name}` })).toBeVisible();
    await expect(page.getByRole('button', { name: `Delete ${last.name}` })).toBeVisible();
  });

  test('deleting one forum does not affect forums in another category', async ({ page }) => {
    const firstCategory = await seedCategory();
    const secondCategory = await seedCategory();
    const target = await seedForum(firstCategory.id, 0);
    const unaffected = await seedForum(secondCategory.id, 0);
    await signInAsAdmin(page);
    await openList(page);
    await openDeleteDialog(page, target);
    await confirmDelete(page);
    expect(await findForum(target.id)).toBeUndefined();
    expect(await findForum(unaffected.id)).toEqual(unaffected);
    await expect(page.getByRole('button', { name: `Delete ${unaffected.name}` })).toBeVisible();
  });
});
