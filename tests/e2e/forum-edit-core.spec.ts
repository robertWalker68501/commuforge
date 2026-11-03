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

test.describe('Forum Management — Edit Forum — Layer 2: Core Editing Workflow', () => {
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

  test('renaming a forum persists the new name while preserving its original slug', async ({ page }) => {
    const category = await seedCategory('Rename', 98010);
    const forum = await seedForum(category.id, 'Original', 3, 'Keep this description');
    const before = await forumDetails(forum.id);
    const newName = `E2E Renamed Forum ${randomUUID().slice(0, 8)}`;
    await signInAsAdmin(page);
    await openEdit(page, forum.id);
    await page.getByRole('textbox', { name: 'Name' }).fill(newName);
    await submitEdit(page);

    const after = await forumDetails(forum.id);
    expect(after.name).toBe(newName);
    expect(after.slug).toBe(before.slug);
    expect(after.description).toBe(before.description);
    expect(after.categoryId).toBe(category.id);
    expect(after.sortOrder).toBe(before.sortOrder);
  });

  test('updating a forum description persists without modifying its name or slug', async ({ page }) => {
    const category = await seedCategory('Description', 98011);
    const forum = await seedForum(category.id, 'Description Update', 4, 'Old description');
    const before = await forumDetails(forum.id);
    await signInAsAdmin(page);
    await openEdit(page, forum.id);
    await page.getByRole('textbox', { name: 'Description' }).fill('Updated forum description');
    await submitEdit(page);

    const after = await forumDetails(forum.id);
    expect(after.description).toBe('Updated forum description');
    expect(after.name).toBe(before.name);
    expect(after.slug).toBe(before.slug);
    expect(after.categoryId).toBe(before.categoryId);
    expect(after.sortOrder).toBe(before.sortOrder);
  });

  test('clearing the description persists null, not an empty string', async ({ page }) => {
    const category = await seedCategory('Clear Description', 98012);
    const forum = await seedForum(category.id, 'Clear', 0, 'Remove me');
    await signInAsAdmin(page);
    await openEdit(page, forum.id);
    const description = page.getByRole('textbox', { name: 'Description' });
    await expect(description).toHaveValue('Remove me');
    await description.click();
    await description.press('ControlOrMeta+A');
    await description.press('Backspace');
    await expect(description).toHaveValue('');
    await submitEdit(page);
    expect((await forumDetails(forum.id)).description).toBeNull();
  });

  test('whitespace-only description is normalized to null', async ({ page }) => {
    const category = await seedCategory('Whitespace Description', 98013);
    const forum = await seedForum(category.id, 'Whitespace', 0, 'Remove me too');
    await signInAsAdmin(page);
    await openEdit(page, forum.id);
    await page.getByRole('textbox', { name: 'Description' }).fill('   ');
    await submitEdit(page);
    expect((await forumDetails(forum.id)).description).toBeNull();
  });

  test('editing in the same category preserves categoryId and sortOrder, including gaps', async ({ page }) => {
    const category = await seedCategory('Stable Ordering', 98014);
    const first = await seedForum(category.id, 'Earlier', 2, null);
    const edited = await seedForum(category.id, 'Edited', 17, null);
    const last = await seedForum(category.id, 'Later', 39, null);
    await signInAsAdmin(page);
    await openEdit(page, edited.id);
    await page.getByRole('textbox', { name: 'Name' }).fill('Edited without moving');
    await submitEdit(page);

    const rows = await Promise.all([first, edited, last].map(f => forumDetails(f.id)));
    expect(rows.map(r => r.categoryId)).toEqual([category.id, category.id, category.id]);
    expect(rows.map(r => r.sortOrder)).toEqual([2, 17, 39]);
  });

  test('saved edits appear in List Forums and persist when reopening the edit page', async ({ page }) => {
    const category = await seedCategory('Persistence', 98015);
    const forum = await seedForum(category.id, 'Persistence', 0, 'Before');
    const newName = `E2E Persisted ${randomUUID().slice(0, 8)}`;
    await signInAsAdmin(page);
    await openEdit(page, forum.id);
    await page.getByRole('textbox', { name: 'Name' }).fill(newName);
    await page.getByRole('textbox', { name: 'Description' }).fill('After saving');
    await submitEdit(page);

    const row = page.locator('tbody tr').filter({ hasText: newName });
    await expect(row).toHaveCount(1);
    await expect(row.locator('td').first()).toContainText('After saving');
    await expect(row.locator('td').nth(1)).toHaveText(category.name);

    await openEdit(page, forum.id);
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue(newName);
    await expect(page.getByRole('textbox', { name: 'Description' })).toHaveValue('After saving');
    await expect(page.getByRole('combobox', { name: 'Category' })).toContainText(category.name);
  });
});
