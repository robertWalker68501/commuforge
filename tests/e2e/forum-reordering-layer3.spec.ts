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


type CapturedAction = { url: string; headers: Record<string, string>; body: string };

async function captureMoveAction(page: Page, forumName: string): Promise<CapturedAction> {
  const requestPromise = page.waitForRequest(request =>
    request.method() === 'POST' &&
    Boolean(request.headers()['next-action']) &&
    (request.postData() ?? '').includes('"direction"'),
  );
  await page.getByRole('button', { name: `Move ${forumName} up` }).click();
  const request = await requestPromise;
  const headers = request.headers();
  // Reuse the actual action ID and serialized body. Do not guess Next.js internals.
  return {
    url: request.url(),
    headers: {
      'next-action': headers['next-action'],
      'content-type': headers['content-type'] ?? 'text/plain;charset=UTF-8',
      origin: new URL(request.url()).origin,
    },
    body: request.postData() ?? '',
  };
}

function alteredActionBody(original: string, changes: { id?: string; direction?: string }): string {
  // React serializes ordinary Server Action arguments as a JSON array.
  const args: unknown = JSON.parse(original);
  if (!Array.isArray(args) || !args[0] || typeof args[0] !== 'object') {
    throw new Error('Unexpected Server Action argument format; inspect captured request.');
  }
  const input = args[0] as Record<string, unknown>;
  if (changes.id !== undefined) input.id = changes.id;
  if (changes.direction !== undefined) input.direction = changes.direction;
  return JSON.stringify(args);
}

async function replayAction(
  page: Page,
  action: CapturedAction,
  changes: { id?: string; direction?: string } = {},
) {
  return page.request.post(action.url, {
    headers: action.headers,
    data: alteredActionBody(action.body, changes),
    maxRedirects: 0,
  });
}

test.describe('Forum Reordering — Layer 3: Server Action Security & Concurrency', () => {
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

  test('rejects an invalid direction without changing forum order', async ({ page }) => {
    const category = await seedCategory('Invalid Direction');
    const first = await seedForum(category.id, 'First', 0);
    const second = await seedForum(category.id, 'Second', 1);
    await signInAsRole(page, 'admin');
    await openList(page);

    // First capture a legitimate action, then restore its initial order.
    const action = await captureMoveAction(page, second.name);
    await expect.poll(async () => (await orderedForums(category.id)).map(x => x.id))
      .toEqual([second.id, first.id]);
    const before = await orderedForums(category.id);

    const response = await replayAction(page, action, { direction: 'sideways' });
    expect(response.status()).toBeLessThan(500);
    expect(await orderedForums(category.id)).toEqual(before);
  });

  test('rejects malformed and nonexistent forum IDs without mutation', async ({ page }) => {
    const category = await seedCategory('Invalid IDs');
    const first = await seedForum(category.id, 'First', 0);
    const second = await seedForum(category.id, 'Second', 1);
    await signInAsRole(page, 'admin');
    await openList(page);

    const action = await captureMoveAction(page, second.name);
    await expect.poll(async () => (await orderedForums(category.id)).map(x => x.id))
      .toEqual([second.id, first.id]);
    const before = await orderedForums(category.id);

    for (const id of ['not-a-uuid', randomUUID()]) {
      const response = await replayAction(page, action, { id });
      expect(response.status()).toBeLessThan(500);
      expect(await orderedForums(category.id)).toEqual(before);
    }
  });

  test('rejects a direct Server Action request from a regular user', async ({ browser }) => {
    const category = await seedCategory('User Action');
    const first = await seedForum(category.id, 'First', 0);
    const second = await seedForum(category.id, 'Second', 1);
    const adminContext = await browser.newContext();
    const userContext = await browser.newContext();
    try {
      const adminPage = await adminContext.newPage();
      await signInAsRole(adminPage, 'admin');
      await openList(adminPage);
      const action = await captureMoveAction(adminPage, second.name);
      await expect.poll(async () => (await orderedForums(category.id)).map(x => x.id))
        .toEqual([second.id, first.id]);
      const before = await orderedForums(category.id);

      const userPage = await userContext.newPage();
      await signInAsRole(userPage, 'user');
      const response = await replayAction(userPage, action);
      // Authorization may respond with a redirect or an RSC redirect payload.
      expect(response.status()).toBeLessThan(500);
      expect(await orderedForums(category.id)).toEqual(before);
    } finally {
      await adminContext.close();
      await userContext.close();
    }
  });

  test('rejects a direct Server Action request without a session', async ({ browser }) => {
    const category = await seedCategory('Anonymous Action');
    const first = await seedForum(category.id, 'First', 0);
    const second = await seedForum(category.id, 'Second', 1);
    const adminContext = await browser.newContext();
    const guestContext = await browser.newContext();
    try {
      const adminPage = await adminContext.newPage();
      await signInAsRole(adminPage, 'admin');
      await openList(adminPage);
      const action = await captureMoveAction(adminPage, second.name);
      await expect.poll(async () => (await orderedForums(category.id)).map(x => x.id))
        .toEqual([second.id, first.id]);
      const before = await orderedForums(category.id);

      const guestPage = await guestContext.newPage();
      const response = await replayAction(guestPage, action);
      expect(response.status()).toBeLessThan(500);
      expect(await orderedForums(category.id)).toEqual(before);
    } finally {
      await adminContext.close();
      await guestContext.close();
    }
  });

  test('concurrent requests preserve a valid category ordering', async ({ page, context }) => {
    const category = await seedCategory('Concurrent');
    const first = await seedForum(category.id, 'First', 0);
    const second = await seedForum(category.id, 'Second', 1);
    const third = await seedForum(category.id, 'Third', 2);
    const fourth = await seedForum(category.id, 'Fourth', 3);
    await signInAsRole(page, 'admin');
    await openList(page);

    const secondPage = await context.newPage();
    try {
      await openList(secondPage);
      // Both clicks are issued without awaiting the other's completion.
      // One request may win, or one may be rejected after bounded retries.
      const firstResponse = page.waitForResponse(r =>
        r.request().method() === 'POST' && Boolean(r.request().headers()['next-action'])
      );
      const secondResponse = secondPage.waitForResponse(r =>
        r.request().method() === 'POST' && Boolean(r.request().headers()['next-action'])
      );
      await Promise.all([
        page.getByRole('button', { name: `Move ${second.name} up` }).click(),
        secondPage.getByRole('button', { name: `Move ${third.name} up` }).click(),
      ]);
      await Promise.all([firstResponse, secondResponse]);

      await expect.poll(async () => {
        const forums = await orderedForums(category.id);
        return {
          ids: [...forums.map(f => f.id)].sort(),
          uniqueSortOrders: new Set(forums.map(f => f.sortOrder)).size,
        };
      }).toEqual({
        ids: [first.id, second.id, third.id, fourth.id].sort(),
        uniqueSortOrders: 4,
      });

      // Repeated reads must yield the same stable order after both actions settle.
      await page.reload();
      await secondPage.reload();
      const databaseOrder = (await orderedForums(category.id)).map(f => f.id);
      await expect.poll(() =>
        visibleAdminOrder(page, [first.name, second.name, third.name, fourth.name])
      ).toEqual(databaseOrder.map(id =>
        [first, second, third, fourth].find(f => f.id === id)!.name
      ));
    } finally {
      await secondPage.close();
    }
  });
});
