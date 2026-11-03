import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { expect, test, type Page } from '@playwright/test';

// Match the existing Category E2E safety boundary.
const developmentUrl = process.env.DATABASE_URL;
if (!developmentUrl) throw new Error('Missing DATABASE_URL for Forum E2E tests.');
const dbUrl = new URL(developmentUrl);
if (
  dbUrl.hostname !== '127.0.0.1' ||
  dbUrl.port !== '5434' ||
  dbUrl.pathname !== '/commuforge_dev'
) {
  throw new Error('Forum E2E requires local commuforge_dev at 127.0.0.1:5434.');
}
dbUrl.pathname = '/commuforge_test';

const password = 'SafeTestPassword123!';
const createPath = '/dashboard/forums/create';
const createdForumNames = new Set<string>();
const createdCategoryIds = new Set<string>();
const createdUserEmails = new Set<string>();
const uniqueName = (kind: string) => `E2E ${kind} ${randomUUID().slice(0, 8)}`;

type ForumRow = {
  id: string;
  name: string;
  description: string | null;
  slug: string;
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

async function createCategory(): Promise<{ id: string; name: string }> {
  const id = randomUUID();
  const name = uniqueName('Category');
  const slug = name.toLowerCase().replaceAll(' ', '-');
  const rows = await database<{ id: string; name: string }>(
    `INSERT INTO category (id, name, slug, "sortOrder", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 0, NOW(), NOW()) RETURNING id, name`,
    [id, name, slug],
  );
  createdCategoryIds.add(id);
  return rows[0];
}

async function signInAsRole(page: Page, role: 'admin' | 'owner' | 'user'): Promise<void> {
  const email = `commuforge-forum-${randomUUID()}@example.com`;
  const response = await page.request.post('/api/auth/sign-up/email', {
    data: { name: 'Forum E2E', email, password },
  });
  expect(response.ok(), `Account setup returned HTTP ${response.status()}`).toBeTruthy();
  createdUserEmails.add(email);
  const rows = await database<{ id: string }>(
    'UPDATE "user" SET "emailVerified" = true, "role" = $2 WHERE email = $1 RETURNING id',
    [email, role],
  );
  expect(rows).toHaveLength(1);

  await page.goto('/sign-in');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  const responsePromise = page.waitForResponse(response =>
    response.url().includes('/api/auth/sign-in/email') &&
    response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  expect((await responsePromise).ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function openForm(page: Page): Promise<void> {
  await page.goto(createPath);
  await expect(page.getByRole('heading', { name: 'Create Forum', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create Forum' })).toBeVisible();
}

async function submitForum(
  page: Page,
  category: { id: string; name: string },
  name: string,
  description?: string,
): Promise<void> {
  createdForumNames.add(name);
  await page.getByRole('textbox', { name: 'Name' }).fill(name);
  await page.getByRole('combobox', { name: 'Category' }).click();
  await page.getByRole('option', { name: category.name, exact: true }).click();
  if (description !== undefined) {
    await page.getByRole('textbox', { name: 'Description' }).fill(description);
  }
  await page.getByRole('button', { name: 'Create Forum' }).click();
  // The Forum listing page is not implemented yet; its URL may show a 404.
  await expect(page).toHaveURL(/\/dashboard\/forums\/?$/);
}

async function forumByName(name: string): Promise<ForumRow[]> {
  return database<ForumRow>(
    'SELECT id, name, description, slug, "categoryId" AS "categoryId", "sortOrder" AS "sortOrder" FROM forum WHERE name = $1',
    [name],
  );
}


async function chooseCategory(page: Page, category: { id: string; name: string }): Promise<void> {
  await page.getByRole('combobox', { name: 'Category' }).click();
  await page.getByRole('option', { name: category.name, exact: true }).click();
}

async function forumsForCategory(categoryId: string): Promise<ForumRow[]> {
  return database<ForumRow>(
    'SELECT id, name, description, slug, "categoryId", "sortOrder" FROM forum WHERE "categoryId" = $1',
    [categoryId],
  );
}


test.describe('Forum Management — Create Forum — Layer 2', () => {
  test.afterEach(async () => {
    if (createdForumNames.size) {
      await database('DELETE FROM forum WHERE name = ANY($1::text[])', [[...createdForumNames]]);
      createdForumNames.clear();
    }
    if (createdCategoryIds.size) {
      await database('DELETE FROM category WHERE id = ANY($1::text[])', [[...createdCategoryIds]]);
      createdCategoryIds.clear();
    }
    if (createdUserEmails.size) {
      await database('DELETE FROM "user" WHERE email = ANY($1::text[])', [[...createdUserEmails]]);
      createdUserEmails.clear();
    }
  });

  test('owner can access the Create Forum page', async ({ page }) => {
    const category = await createCategory();
    await signInAsRole(page, 'owner');
    await openForm(page);
    await expect(page.getByRole('option', { name: category.name, exact: true })).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Category' }).click();
    await expect(page.getByRole('option', { name: category.name, exact: true })).toBeVisible();
  });

  test('regular user is redirected away from Create Forum', async ({ page }) => {
    await createCategory();
    await signInAsRole(page, 'user');
    await page.goto(createPath);
    await expect(page).toHaveURL(/\/dashboard\/?$/);
    await expect(page.getByRole('button', { name: 'Create Forum' })).toHaveCount(0);
  });

  test('unauthenticated visitor is redirected to sign-in', async ({ page }) => {
    await page.goto(createPath);
    await expect(page).toHaveURL(/\/sign-in\/?$/);
    await expect(page.getByRole('button', { name: 'Create Forum' })).toHaveCount(0);
  });

  test('empty name is rejected without inserting a forum', async ({ page }) => {
    const category = await createCategory();
    await signInAsRole(page, 'admin');
    await openForm(page);
    await chooseCategory(page, category);
    await page.getByRole('button', { name: 'Create Forum' }).click();
    await expect(page.getByText('Name is required')).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/forums\/create\/?$/);
    expect(await forumsForCategory(category.id)).toHaveLength(0);
  });

  test('whitespace-only name is rejected', async ({ page }) => {
    const category = await createCategory();
    await signInAsRole(page, 'admin');
    await openForm(page);
    await page.getByRole('textbox', { name: 'Name' }).fill('   ');
    await chooseCategory(page, category);
    await page.getByRole('button', { name: 'Create Forum' }).click();
    await expect(page.getByText('Name is required')).toBeVisible();
    expect(await forumsForCategory(category.id)).toHaveLength(0);
  });

  test('missing category is rejected', async ({ page }) => {
    await createCategory();
    await signInAsRole(page, 'admin');
    await openForm(page);
    await page.getByRole('textbox', { name: 'Name' }).fill(uniqueName('Missing Category'));
    await page.getByRole('button', { name: 'Create Forum' }).click();
    await expect(page.getByText('Please select a category.')).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/forums\/create\/?$/);
  });

  test('name longer than 100 characters is rejected', async ({ page }) => {
    const category = await createCategory();
    await signInAsRole(page, 'admin');
    await openForm(page);
    await page.getByRole('textbox', { name: 'Name' }).fill('A'.repeat(101));
    await chooseCategory(page, category);
    await page.getByRole('button', { name: 'Create Forum' }).click();
    await expect(page.getByText('Name must not exceed 100 characters')).toBeVisible();
    expect(await forumsForCategory(category.id)).toHaveLength(0);
  });

  test('description longer than 500 characters is rejected', async ({ page }) => {
    const category = await createCategory();
    await signInAsRole(page, 'admin');
    await openForm(page);
    await page.getByRole('textbox', { name: 'Name' }).fill(uniqueName('Long Description'));
    await chooseCategory(page, category);
    await page.getByRole('textbox', { name: 'Description' }).fill('D'.repeat(501));
    await page.getByRole('button', { name: 'Create Forum' }).click();
    await expect(page.getByText('Description must not exceed 500 characters')).toBeVisible();
    expect(await forumsForCategory(category.id)).toHaveLength(0);
  });

  test('duplicate global slug is rejected, including across categories', async ({ page }) => {
    const firstCategory = await createCategory();
    const secondCategory = await createCategory();
    const name = uniqueName('Duplicate');
    const slug = name.toLowerCase().replaceAll(' ', '-');
    // Seed an existing forum to isolate the global uniqueness constraint.
    const existingId = randomUUID();
    await database(
      `INSERT INTO forum (id, name, slug, "categoryId", "sortOrder", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 0, NOW(), NOW())`,
      [existingId, name, slug, firstCategory.id],
    );
    createdForumNames.add(name);
    await signInAsRole(page, 'admin');
    await openForm(page);
    await page.getByRole('textbox', { name: 'Name' }).fill(name);
    await chooseCategory(page, secondCategory);
    await page.getByRole('button', { name: 'Create Forum' }).click();
    await expect(page.getByText('A forum with this name or URL slug already exists.')).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/forums\/create\/?$/);
    expect(await forumByName(name)).toHaveLength(1);
    expect(await forumsForCategory(secondCategory.id)).toHaveLength(0);
  });

  test('punctuation-only name is rejected because it generates an empty slug', async ({ page }) => {
    const category = await createCategory();
    await signInAsRole(page, 'admin');
    await openForm(page);
    await page.getByRole('textbox', { name: 'Name' }).fill('!!!');
    await chooseCategory(page, category);
    await page.getByRole('button', { name: 'Create Forum' }).click();
    await expect(page.getByText('Forum name must contain letters or numbers.')).toBeVisible();
    expect(await forumsForCategory(category.id)).toHaveLength(0);
  });
});
