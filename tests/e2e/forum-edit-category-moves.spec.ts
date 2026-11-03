import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { expect, test, type Page } from '@playwright/test';

// Match playwright.config.ts: never modify development or production records.
const developmentUrl = process.env.DATABASE_URL;
if (!developmentUrl) throw new Error('Missing DATABASE_URL for Forum Edit E2E tests.');
const dbUrl = new URL(developmentUrl);
if (
  dbUrl.hostname !== '127.0.0.1' ||
  dbUrl.port !== '5434' ||
  dbUrl.pathname !== '/commuforge_dev'
) {
  throw new Error('Forum Edit E2E requires local commuforge_dev at 127.0.0.1:5434.');
}
dbUrl.pathname = '/commuforge_test';

const password = 'SafeTestPassword123!';
const listPath = '/dashboard/forums';
const editPath = (id: string) => `${listPath}/${id}/edit`;
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



type ForumDetails = {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  categoryId: string;
  sortOrder: number;
};

async function forumDetails(id: string): Promise<ForumDetails> {
  const rows = await database<ForumDetails>(
    'SELECT id, name, description, slug, "categoryId", "sortOrder" FROM forum WHERE id = $1',
    [id],
  );
  expect(rows).toHaveLength(1);
  return rows[0];
}

async function openEdit(page: Page, id: string): Promise<void> {
  await page.goto(editPath(id));
  await expect(page.getByRole('heading', { name: 'Edit Forum', exact: true })).toBeVisible();
}

async function submitEdit(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Update Forum' }).click();
  await expect(page).toHaveURL(/\/dashboard\/forums\/?$/);
}


async function selectCategory(page: Page, categoryName: string): Promise<void> {
  await page.getByRole('combobox', { name: 'Category' }).click();
  await page.getByRole('option', { name: categoryName, exact: true }).click();
}

async function expectEditError(page: Page, text: string): Promise<void> {
  await page.getByRole('button', { name: 'Update Forum' }).click();
  await expect(page.getByText(text, { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\/forums\/[^/]+\/edit\/?$/);
}

test.describe('Forum Management — Edit Forum — Layer 3: Category Moves', () => {
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

  test('moving to a populated category appends after its highest sortOrder, preserving the slug and fields', async ({ page }) => {
    const source = await seedCategory('Move Source', 98101);
    const destination = await seedCategory('Move Destination', 98102);
    const forum = await seedForum(source.id, 'Move Target', 4, 'Original description');
    const existing1 = await seedForum(destination.id, 'Destination One', 2);
    const existing2 = await seedForum(destination.id, 'Destination Two', 15);
    const before = await forumDetails(forum.id);
    await signInAsAdmin(page);
    await openEdit(page, forum.id);
    await selectCategory(page, destination.name);
    await submitEdit(page);

    const after = await forumDetails(forum.id);
    expect(after.categoryId).toBe(destination.id);
    expect(after.sortOrder).toBe(16);
    expect(after.slug).toBe(before.slug);
    expect(after.name).toBe(before.name);
    expect(after.description).toBe(before.description);
    expect((await forumDetails(existing1.id)).sortOrder).toBe(2);
    expect((await forumDetails(existing2.id)).sortOrder).toBe(15);
  });

  test('moving to an empty category assigns sortOrder zero', async ({ page }) => {
    const source = await seedCategory('Empty Source', 98103);
    const destination = await seedCategory('Empty Destination', 98104);
    const forum = await seedForum(source.id, 'Empty Move', 12);
    await signInAsAdmin(page);
    await openEdit(page, forum.id);
    await selectCategory(page, destination.name);
    await submitEdit(page);
    const after = await forumDetails(forum.id);
    expect(after.categoryId).toBe(destination.id);
    expect(after.sortOrder).toBe(0);
  });

  test('moving leaves source category sortOrder gaps and remaining forum records unchanged', async ({ page }) => {
    const source = await seedCategory('Gap Source', 98105);
    const destination = await seedCategory('Gap Destination', 98106);
    const first = await seedForum(source.id, 'Source First', 1);
    const moved = await seedForum(source.id, 'Source Middle', 9);
    const last = await seedForum(source.id, 'Source Last', 27);
    const beforeFirst = await forumDetails(first.id);
    const beforeLast = await forumDetails(last.id);
    await signInAsAdmin(page);
    await openEdit(page, moved.id);
    await selectCategory(page, destination.name);
    await submitEdit(page);
    expect(await forumDetails(first.id)).toEqual(beforeFirst);
    expect(await forumDetails(last.id)).toEqual(beforeLast);
    expect((await forumDetails(moved.id)).sortOrder).toBe(0);
  });

  test('moving and editing name and description together persists all changes while preserving slug', async ({ page }) => {
    const source = await seedCategory('Fields Source', 98107);
    const destination = await seedCategory('Fields Destination', 98108);
    const forum = await seedForum(source.id, 'Fields Move', 3, 'Before');
    const before = await forumDetails(forum.id);
    const renamed = `E2E Moved and Renamed ${randomUUID().slice(0, 8)}`;
    await signInAsAdmin(page);
    await openEdit(page, forum.id);
    await page.getByRole('textbox', { name: 'Name' }).fill(renamed);
    await page.getByRole('textbox', { name: 'Description' }).fill('After move');
    await selectCategory(page, destination.name);
    await submitEdit(page);
    const after = await forumDetails(forum.id);
    expect(after).toMatchObject({ name: renamed, description: 'After move', slug: before.slug, categoryId: destination.id, sortOrder: 0 });
  });

  test('moving to a category deleted after the edit page loads fails without modifying the forum', async ({ page }) => {
    const source = await seedCategory('Deleted Source', 98109);
    const destination = await seedCategory('Deleted Destination', 98110);
    const forum = await seedForum(source.id, 'Deleted Destination Move', 6, 'Keep me');
    const before = await forumDetails(forum.id);
    await signInAsAdmin(page);
    await openEdit(page, forum.id);
    await selectCategory(page, destination.name);
    await database('DELETE FROM category WHERE id = $1', [destination.id]);
    await expectEditError(page, 'Category does not exist.');
    expect(await forumDetails(forum.id)).toEqual(before);
  });

  test('the moved forum appears under the new category in the forum list and edit form', async ({ page }) => {
    const source = await seedCategory('List Source', 98111);
    const destination = await seedCategory('List Destination', 98112);
    const forum = await seedForum(source.id, 'List Move', 1, 'List description');
    await signInAsAdmin(page);
    await openEdit(page, forum.id);
    await selectCategory(page, destination.name);
    await submitEdit(page);
    const row = page.locator('tbody tr').filter({ hasText: forum.name });
    await expect(row).toHaveCount(1);
    await expect(row.locator('td').nth(1)).toHaveText(destination.name);
    await openEdit(page, forum.id);
    await expect(page.getByRole('combobox', { name: 'Category' })).toContainText(destination.name);
  });

  test('two concurrent moves to the same destination receive distinct append positions', async ({ page, context }) => {
    const source = await seedCategory('Concurrent Source', 98113);
    const destination = await seedCategory('Concurrent Destination', 98114);
    await seedForum(destination.id, 'Existing Destination', 8);
    const first = await seedForum(source.id, 'Concurrent First', 1);
    const second = await seedForum(source.id, 'Concurrent Second', 2);
    await signInAsAdmin(page);
    const otherPage = await context.newPage();
    try {
      await Promise.all([openEdit(page, first.id), openEdit(otherPage, second.id)]);
      await Promise.all([selectCategory(page, destination.name), selectCategory(otherPage, destination.name)]);
      await Promise.all([submitEdit(page), submitEdit(otherPage)]);
      const firstAfter = await forumDetails(first.id);
      const secondAfter = await forumDetails(second.id);
      expect(firstAfter.categoryId).toBe(destination.id);
      expect(secondAfter.categoryId).toBe(destination.id);
      expect([firstAfter.sortOrder, secondAfter.sortOrder].sort((a, b) => a - b)).toEqual([9, 10]);
    } finally {
      await otherPage.close();
    }
  });
});
