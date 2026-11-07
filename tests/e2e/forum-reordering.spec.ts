import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { expect, test, type Page } from '@playwright/test';

// Match playwright.config.ts: only access the isolated local test database.
const developmentUrl = process.env.DATABASE_URL;
if (!developmentUrl) throw new Error('DATABASE_URL is missing.');
const dbUrl = new URL(developmentUrl);
if (
  dbUrl.hostname !== '127.0.0.1' ||
  dbUrl.port !== '5434' ||
  dbUrl.pathname !== '/commuforge_dev'
) {
  throw new Error('Forum Reordering E2E requires local commuforge_dev at 127.0.0.1:5434.');
}
dbUrl.pathname = '/commuforge_test';

const password = 'SafeTestPassword123!';
const listPath = '/dashboard/forums';
const categoryIds: string[] = [];
const forumIds: string[] = [];
const userEmails: string[] = [];

type RecordRow = { id: string; name: string };
type OrderedForum = { id: string; sortOrder: number };

async function database<T>(sql: string, values: unknown[] = []): Promise<T[]> {
  const client = new Client({ connectionString: dbUrl.toString() });
  await client.connect();
  try {
    return (await client.query(sql, values)).rows as T[];
  } finally {
    await client.end();
  }
}

async function seedCategory(label: string): Promise<RecordRow> {
  const id = randomUUID();
  const rows = await database<RecordRow>(
    `INSERT INTO category (id, name, slug, "sortOrder", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING id, name`,
    [id, `E2E Reorder ${label} ${id.slice(0, 8)}`, `e2e-reorder-${id}`, 98000],
  );
  categoryIds.push(id);
  return rows[0];
}

async function seedForum(categoryId: string, label: string, sortOrder: number): Promise<RecordRow> {
  const id = randomUUID();
  const rows = await database<RecordRow>(
    `INSERT INTO forum (id, name, slug, "categoryId", "sortOrder", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) RETURNING id, name`,
    [id, `E2E Reorder ${label} ${id.slice(0, 8)}`, `e2e-reorder-${id}`, categoryId, sortOrder],
  );
  forumIds.push(id);
  return rows[0];
}

async function orderedForums(categoryId: string): Promise<OrderedForum[]> {
  return database<OrderedForum>(
    'SELECT id, "sortOrder" FROM forum WHERE "categoryId" = $1 ORDER BY "sortOrder" ASC, id ASC',
    [categoryId],
  );
}

async function signInAsAdmin(page: Page): Promise<void> {
  const email = `commuforge-reorder-${randomUUID()}@example.com`;
  const response = await page.request.post('/api/auth/sign-up/email', {
    data: { name: 'Forum Reordering E2E', email, password },
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
  const responsePromise = page.waitForResponse(
    r => r.url().includes('/api/auth/sign-in/email') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  expect((await responsePromise).ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function openList(page: Page): Promise<void> {
  await page.goto(listPath);
  await expect(page.getByRole('heading', { name: 'Forums', exact: true })).toBeVisible();
}

// Returns the order of only the supplied forums, ignoring unrelated test records.
async function visibleAdminOrder(page: Page, names: string[]): Promise<string[]> {
  const cells = await page.locator('tbody tr td:first-child').allTextContents();
  return cells.flatMap(cell => names.filter(name => cell.includes(name)));
}

test.describe('Forum Reordering — Layer 1: Core Workflow', () => {
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

  test('moves a forum up within its category', async ({ page }) => {
    const category = await seedCategory('Move Up');
    const first = await seedForum(category.id, 'React', 0);
    const second = await seedForum(category.id, 'Next', 1);
    const third = await seedForum(category.id, 'TypeScript', 2);
    await signInAsAdmin(page);
    await openList(page);

    await page.getByRole('button', { name: `Move ${second.name} up` }).click();

    await expect.poll(() => visibleAdminOrder(page, [first.name, second.name, third.name]))
      .toEqual([second.name, first.name, third.name]);
    await expect(page.getByRole('button', { name: `Move ${second.name} up` })).toBeDisabled();
    await expect.poll(async () => (await orderedForums(category.id)).map(f => f.id))
      .toEqual([second.id, first.id, third.id]);
  });

  test('moves a forum down within its category', async ({ page }) => {
    const category = await seedCategory('Move Down');
    const first = await seedForum(category.id, 'React', 0);
    const second = await seedForum(category.id, 'Next', 1);
    const third = await seedForum(category.id, 'TypeScript', 2);
    await signInAsAdmin(page);
    await openList(page);

    await page.getByRole('button', { name: `Move ${second.name} down` }).click();

    await expect.poll(() => visibleAdminOrder(page, [first.name, second.name, third.name]))
      .toEqual([first.name, third.name, second.name]);
    await expect(page.getByRole('button', { name: `Move ${second.name} down` })).toBeDisabled();
    await expect.poll(async () => (await orderedForums(category.id)).map(f => f.id))
      .toEqual([first.id, third.id, second.id]);
  });

  test('keeps the new order after refreshing the administrative page', async ({ page }) => {
    const category = await seedCategory('Persistence');
    const first = await seedForum(category.id, 'React', 0);
    const second = await seedForum(category.id, 'Next', 1);
    const third = await seedForum(category.id, 'TypeScript', 2);
    await signInAsAdmin(page);
    await openList(page);

    await page.getByRole('button', { name: `Move ${third.name} up` }).click();
    await expect.poll(() => visibleAdminOrder(page, [first.name, second.name, third.name]))
      .toEqual([first.name, third.name, second.name]);

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Forums', exact: true })).toBeVisible();
    await expect.poll(() => visibleAdminOrder(page, [first.name, second.name, third.name]))
      .toEqual([first.name, third.name, second.name]);
    expect((await orderedForums(category.id)).map(f => f.id))
      .toEqual([first.id, third.id, second.id]);
  });

  test('reflects the reordered forums on the public /forums page', async ({ page }) => {
    const category = await seedCategory('Public Index');
    const first = await seedForum(category.id, 'React', 0);
    const second = await seedForum(category.id, 'Next', 1);
    const third = await seedForum(category.id, 'TypeScript', 2);
    await signInAsAdmin(page);
    await openList(page);

    await page.getByRole('button', { name: `Move ${third.name} up` }).click();
    await expect.poll(() => visibleAdminOrder(page, [first.name, second.name, third.name]))
      .toEqual([first.name, third.name, second.name]);

    await page.goto('/forums');
    await expect(page.getByRole('heading', { name: 'Forum List', exact: true })).toBeVisible();
    const card = page.locator('[data-slot="card"]').filter({
      has: page.locator('[data-slot="card-title"]').getByText(category.name, { exact: true }),
    });
    await expect(card).toHaveCount(1);
    await expect.poll(() => card.locator('[data-slot="item-title"]').allTextContents())
      .toEqual([first.name, third.name, second.name]);
  });
});
