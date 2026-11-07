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

async function signInAsRole(page: Page, role: 'admin' | 'owner' | 'user'): Promise<void> {
  const email = `commuforge-reorder-${randomUUID()}@example.com`;
  const response = await page.request.post('/api/auth/sign-up/email', {
    data: { name: 'Forum Reordering E2E', email, password },
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

test.describe('Forum Reordering — Layer 2: Authorization, Boundaries & Category Isolation', () => {
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

  test('reordering one category does not change another category', async ({ page }) => {
    const categoryA = await seedCategory('Isolation A');
    const a1 = await seedForum(categoryA.id, 'A First', 0);
    const a2 = await seedForum(categoryA.id, 'A Second', 1);
    const categoryB = await seedCategory('Isolation B');
    const b1 = await seedForum(categoryB.id, 'B First', 0);
    const b2 = await seedForum(categoryB.id, 'B Second', 1);
    const beforeB = await orderedForums(categoryB.id);

    await signInAsRole(page, 'admin');
    await openList(page);
    await page.getByRole('button', { name: `Move ${a2.name} up` }).click();

    await expect.poll(async () => (await orderedForums(categoryA.id)).map(f => f.id))
      .toEqual([a2.id, a1.id]);
    expect(await orderedForums(categoryB.id)).toEqual(beforeB);
    await expect.poll(() => visibleAdminOrder(page, [b1.name, b2.name]))
      .toEqual([b1.name, b2.name]);
  });

  test('first and last forums have the correct disabled movement buttons', async ({ page }) => {
    const category = await seedCategory('Boundaries');
    const first = await seedForum(category.id, 'First', 0);
    const middle = await seedForum(category.id, 'Middle', 1);
    const last = await seedForum(category.id, 'Last', 2);

    await signInAsRole(page, 'admin');
    await openList(page);
    await expect(page.getByRole('button', { name: `Move ${first.name} up` })).toBeDisabled();
    await expect(page.getByRole('button', { name: `Move ${first.name} down` })).toBeEnabled();
    await expect(page.getByRole('button', { name: `Move ${middle.name} up` })).toBeEnabled();
    await expect(page.getByRole('button', { name: `Move ${middle.name} down` })).toBeEnabled();
    await expect(page.getByRole('button', { name: `Move ${last.name} up` })).toBeEnabled();
    await expect(page.getByRole('button', { name: `Move ${last.name} down` })).toBeDisabled();

    await page.getByRole('button', { name: `Move ${middle.name} up` }).click();
    await expect.poll(async () => (await orderedForums(category.id)).map(f => f.id))
      .toEqual([middle.id, first.id, last.id]);
    await expect(page.getByRole('button', { name: `Move ${middle.name} up` })).toBeDisabled();
    await expect(page.getByRole('button', { name: `Move ${first.name} up` })).toBeEnabled();
  });

  test('a category containing one forum disables both directions', async ({ page }) => {
    const category = await seedCategory('Single Forum');
    const forum = await seedForum(category.id, 'Only Forum', 0);
    await signInAsRole(page, 'admin');
    await openList(page);

    await expect(page.getByRole('button', { name: `Move ${forum.name} up` })).toBeDisabled();
    await expect(page.getByRole('button', { name: `Move ${forum.name} down` })).toBeDisabled();
    expect((await orderedForums(category.id)).map(f => f.id)).toEqual([forum.id]);
  });

  test('owner can reorder forums', async ({ page }) => {
    const category = await seedCategory('Owner');
    const first = await seedForum(category.id, 'First', 0);
    const second = await seedForum(category.id, 'Second', 1);
    await signInAsRole(page, 'owner');
    await openList(page);

    await page.getByRole('button', { name: `Move ${second.name} up` }).click();
    await expect.poll(async () => (await orderedForums(category.id)).map(f => f.id))
      .toEqual([second.id, first.id]);
  });

  test('regular user cannot access the administrative reordering interface', async ({ page }) => {
    const category = await seedCategory('Regular User');
    const first = await seedForum(category.id, 'First', 0);
    const second = await seedForum(category.id, 'Second', 1);
    await signInAsRole(page, 'user');

    await page.goto(listPath);
    await expect(page).toHaveURL(/\/dashboard\/?$/);
    await expect(page.getByRole('button', { name: `Move ${second.name} up` })).toHaveCount(0);
    expect((await orderedForums(category.id)).map(f => f.id)).toEqual([first.id, second.id]);
  });

  test('unauthenticated visitor cannot access the reordering interface', async ({ page }) => {
    await page.goto(listPath);
    await expect(page).toHaveURL(/\/sign-in\/?$/);
    await expect(page.getByRole('button', { name: /^Move .* (up|down)$/ })).toHaveCount(0);
  });

  test('duplicate sort orders are normalized when a forum is moved', async ({ page }) => {
    const category = await seedCategory('Duplicate Sort Orders');
    const first = await seedForum(category.id, 'First', 0);
    const second = await seedForum(category.id, 'Second', 0);
    const third = await seedForum(category.id, 'Third', 5);
    const initial = await orderedForums(category.id);
    const currentFirst = initial[0].id === first.id ? first : second;
    const currentSecond = initial[1].id === first.id ? first : second;

    await signInAsRole(page, 'admin');
    await openList(page);
    await page.getByRole('button', { name: `Move ${currentSecond.name} up` }).click();

    await expect.poll(async () => await orderedForums(category.id)).toEqual([
      { id: currentSecond.id, sortOrder: 0 },
      { id: currentFirst.id, sortOrder: 1 },
      { id: third.id, sortOrder: 2 },
    ]);
    await expect.poll(() => visibleAdminOrder(page, [first.name, second.name, third.name]))
      .toEqual([currentSecond.name, currentFirst.name, third.name]);
  });
});
