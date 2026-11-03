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


test.describe('Forum Management — Edit Forum — Layer 1: Form & Validation', () => {
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

  async function openEdit(page: Page, id: string) {
    await page.goto(editPath(id));
    await expect(page.getByRole('heading', { name: 'Edit Forum', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Update Forum' })).toBeVisible();
  }

  test('populates the existing name, description and selected category', async ({ page }) => {
    const category = await seedCategory('Edit Current', 98000);
    const other = await seedCategory('Edit Other', 98001);
    const forum = await seedForum(category.id, 'Populated', 0, 'Existing forum description');
    await signInAsAdmin(page);
    await openEdit(page, forum.id);
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue(forum.name);
    await expect(page.getByRole('textbox', { name: 'Description' })).toHaveValue('Existing forum description');
    await expect(page.getByRole('combobox', { name: 'Category' })).toContainText(category.name);
    await page.getByRole('combobox', { name: 'Category' }).click();
    await expect(page.getByRole('option', { name: other.name, exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: category.name, exact: true })).toBeVisible();
  });

  test('shows an empty description for a forum with null description', async ({ page }) => {
    const category = await seedCategory('Null Description', 98002);
    const forum = await seedForum(category.id, 'No Description', 0, null);
    await signInAsAdmin(page);
    await openEdit(page, forum.id);
    await expect(page.getByRole('textbox', { name: 'Description' })).toHaveValue('');
  });

  test('Reset restores name, description and category without persisting changes', async ({ page }) => {
    const original = await seedCategory('Original', 98003);
    const alternative = await seedCategory('Alternative', 98004);
    const forum = await seedForum(original.id, 'Reset', 0, 'Original description');
    await signInAsAdmin(page);
    await openEdit(page, forum.id);
    await page.getByRole('textbox', { name: 'Name' }).fill('Unsaved replacement');
    await page.getByRole('textbox', { name: 'Description' }).fill('Unsaved description');
    await page.getByRole('combobox', { name: 'Category' }).click();
    await page.getByRole('option', { name: alternative.name, exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Category' })).toContainText(alternative.name);
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue(forum.name);
    await expect(page.getByRole('textbox', { name: 'Description' })).toHaveValue('Original description');
    await expect(page.getByRole('combobox', { name: 'Category' })).toContainText(original.name);
    const persisted = await database<{ name: string; description: string; categoryId: string }>(
      'SELECT name, description, "categoryId" FROM forum WHERE id = $1', [forum.id]);
    expect(persisted).toMatchObject([{ name: forum.name, description: 'Original description', categoryId: original.id }]);
  });

  test('empty name displays validation feedback and does not submit', async ({ page }) => {
    const category = await seedCategory('Required', 98005);
    const forum = await seedForum(category.id, 'Required', 0);
    await signInAsAdmin(page);
    await openEdit(page, forum.id);
    await page.getByRole('textbox', { name: 'Name' }).fill('');
    await page.getByRole('button', { name: 'Update Forum' }).click();
    await expect(page.getByText('Name is required')).toBeVisible();
    await expect(page).toHaveURL(editPath(forum.id));
  });

  test('whitespace-only name is rejected', async ({ page }) => {
    const category = await seedCategory('Whitespace', 98006);
    const forum = await seedForum(category.id, 'Whitespace', 0);
    await signInAsAdmin(page);
    await openEdit(page, forum.id);
    await page.getByRole('textbox', { name: 'Name' }).fill('   ');
    await page.getByRole('button', { name: 'Update Forum' }).click();
    await expect(page.getByText('Name is required')).toBeVisible();
  });

  test('name exceeding 100 characters is rejected', async ({ page }) => {
    const category = await seedCategory('Long Name', 98007);
    const forum = await seedForum(category.id, 'Long Name', 0);
    await signInAsAdmin(page);
    await openEdit(page, forum.id);
    await page.getByRole('textbox', { name: 'Name' }).fill('x'.repeat(101));
    await page.getByRole('button', { name: 'Update Forum' }).click();
    await expect(page.getByText('Name must not exceed 100 characters')).toBeVisible();
  });

  test('description exceeding 500 characters is rejected', async ({ page }) => {
    const category = await seedCategory('Long Description', 98008);
    const forum = await seedForum(category.id, 'Long Description', 0);
    await signInAsAdmin(page);
    await openEdit(page, forum.id);
    await page.getByRole('textbox', { name: 'Description' }).fill('x'.repeat(501));
    await page.getByRole('button', { name: 'Update Forum' }).click();
    await expect(page.getByText('Description must not exceed 500 characters')).toBeVisible();
  });

  test('invalid UUID displays the not-found page', async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto(editPath('not-a-uuid'));
    await expect(page.getByRole('heading', { name: 'Edit Forum', exact: true })).toHaveCount(0);
    await expect(page.getByText(/404|not found|could not be found/i).first()).toBeVisible();
  });

  test('nonexistent valid UUID displays the not-found page', async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto(editPath(randomUUID()));
    await expect(page.getByRole('heading', { name: 'Edit Forum', exact: true })).toHaveCount(0);
    await expect(page.getByText(/404|not found|could not be found/i).first()).toBeVisible();
  });
});
