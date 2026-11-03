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

async function signInAsAdmin(page: Page): Promise<void> {
  const email = `commuforge-forum-${randomUUID()}@example.com`;
  const response = await page.request.post('/api/auth/sign-up/email', {
    data: { name: 'Forum E2E', email, password },
  });
  expect(response.ok(), `Account setup returned HTTP ${response.status()}`).toBeTruthy();
  createdUserEmails.add(email);
  const rows = await database<{ id: string }>(
    'UPDATE "user" SET "emailVerified" = true, "role" = $2 WHERE email = $1 RETURNING id',
    [email, 'admin'],
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

test.describe('Forum Management — Create Forum — Layer 1', () => {
  test.afterEach(async () => {
    // Delete child rows before parent rows; never touch unrelated records.
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

  test('admin creates a forum with description and correct category relationship', async ({ page }) => {
    const category = await createCategory();
    await signInAsAdmin(page);
    await openForm(page);
    const name = uniqueName('General');
    await submitForum(page, category, name, 'General community conversations');

    const rows = await forumByName(name);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name,
      description: 'General community conversations',
      categoryId: category.id,
      sortOrder: 0,
    });
  });

  test('forum slug is generated from the name', async ({ page }) => {
    const category = await createCategory();
    await signInAsAdmin(page);
    await openForm(page);
    const name = uniqueName('Programming');
    await submitForum(page, category, name);
    const rows = await forumByName(name);
    expect(rows).toHaveLength(1);
    expect(rows[0].slug).toBe(name.toLowerCase().replaceAll(' ', '-'));
  });

  test('forums in the same category receive consecutive sort orders', async ({ page }) => {
    const category = await createCategory();
    await signInAsAdmin(page);
    const first = uniqueName('First');
    const second = uniqueName('Second');

    await openForm(page);
    await submitForum(page, category, first);
    await openForm(page);
    await submitForum(page, category, second);

    const firstRows = await forumByName(first);
    const secondRows = await forumByName(second);
    expect(firstRows).toHaveLength(1);
    expect(secondRows).toHaveLength(1);
    expect(firstRows[0].sortOrder).toBe(0);
    expect(secondRows[0].sortOrder).toBe(1);
  });

  test('forums in different categories have independent sort orders', async ({ page }) => {
    const categoryA = await createCategory();
    const categoryB = await createCategory();
    await signInAsAdmin(page);
    const nameA = uniqueName('Alpha');
    const nameB = uniqueName('Beta');

    await openForm(page);
    await submitForum(page, categoryA, nameA);
    await openForm(page);
    await submitForum(page, categoryB, nameB);

    const rowsA = await forumByName(nameA);
    const rowsB = await forumByName(nameB);
    expect(rowsA).toHaveLength(1);
    expect(rowsB).toHaveLength(1);
    expect(rowsA[0].categoryId).toBe(categoryA.id);
    expect(rowsB[0].categoryId).toBe(categoryB.id);
    expect(rowsA[0].sortOrder).toBe(0);
    expect(rowsB[0].sortOrder).toBe(0);
  });

  test('forum without description stores null', async ({ page }) => {
    const category = await createCategory();
    await signInAsAdmin(page);
    await openForm(page);
    const name = uniqueName('No Description');
    await submitForum(page, category, name);

    const rows = await forumByName(name);
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBeNull();
  });
});
