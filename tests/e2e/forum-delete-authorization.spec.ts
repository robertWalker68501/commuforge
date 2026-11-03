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

async function signIn(page: Page, role: 'admin' | 'owner' | 'user' | 'moderator' = 'admin'): Promise<void> {
  const email = `commuforge-forum-delete-${randomUUID()}@example.com`;
  const response = await page.request.post('/api/auth/sign-up/email', {
    data: { name: 'Forum Delete E2E', email, password },
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


test.describe('Forum Management — Delete Forum — Layer 2: Authorization & Security', () => {
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

  test('admin can delete a forum through the confirmation dialog', async ({ page }) => {
    const category = await seedCategory();
    const forum = await seedForum(category.id, 0);
    await signIn(page, 'admin');
    await openList(page);
    await openDeleteDialog(page, forum);
    await confirmDelete(page);
    expect(await findForum(forum.id)).toBeUndefined();
  });

  test('owner can delete a forum through the confirmation dialog', async ({ page }) => {
    const category = await seedCategory();
    const forum = await seedForum(category.id, 0);
    await signIn(page, 'owner');
    await openList(page);
    await openDeleteDialog(page, forum);
    await confirmDelete(page);
    expect(await findForum(forum.id)).toBeUndefined();
  });

  test('regular user cannot access the forum administration listing or deletion controls', async ({ page }) => {
    const category = await seedCategory();
    const forum = await seedForum(category.id, 0);
    await signIn(page, 'user');
    await page.goto(listPath);
    await expect(page).toHaveURL(/\/dashboard\/?$/);
    await expect(page.getByRole('button', { name: `Delete ${forum.name}` })).toHaveCount(0);
    expect(await findForum(forum.id)).toEqual(forum);
  });

  test('moderator cannot access the forum administration listing or deletion controls', async ({ page }) => {
    const category = await seedCategory();
    const forum = await seedForum(category.id, 0);
    await signIn(page, 'moderator');
    await page.goto(listPath);
    await expect(page).toHaveURL(/\/dashboard\/?$/);
    await expect(page.getByRole('button', { name: `Delete ${forum.name}` })).toHaveCount(0);
    expect(await findForum(forum.id)).toEqual(forum);
  });

  test('anonymous visitor is redirected to sign-in without deletion controls', async ({ page }) => {
    const category = await seedCategory();
    const forum = await seedForum(category.id, 0);
    await page.goto(listPath);
    await expect(page).toHaveURL(/\/sign-in\/?$/);
    await expect(page.getByRole('button', { name: `Delete ${forum.name}` })).toHaveCount(0);
    expect(await findForum(forum.id)).toEqual(forum);
  });

  test('malformed and nonexistent UUIDs cannot delete a forum through the Server Action', async ({ page }) => {
    const category = await seedCategory();
    const capture = await seedForum(category.id, 0);
    const protectedForum = await seedForum(category.id, 1);
    await signIn(page, 'admin');
    await openList(page);
    await openDeleteDialog(page, capture);
    const actionRequest = page.waitForRequest(request =>
      request.method() === 'POST' && Boolean(request.headers()['next-action']),
    );
    await confirmDelete(page);
    const captured = await actionRequest;
    const actionId = captured.headers()['next-action'];
    expect(actionId).toBeTruthy();

    const headers = { 'Next-Action': actionId, 'Content-Type': 'text/plain;charset=UTF-8' };
    for (const invalidId of ['invalid-uuid', randomUUID()]) {
      await page.request.post(listPath, {
        headers,
        data: JSON.stringify([invalidId]),
        maxRedirects: 0,
      });
      expect(await findForum(protectedForum.id)).toEqual(protectedForum);
    }
  });

  test('regular user, moderator, and anonymous requests cannot replay the delete Server Action', async ({ page, browser }) => {
    const category = await seedCategory();
    const capture = await seedForum(category.id, 0);
    const target = await seedForum(category.id, 1);
    await signIn(page, 'admin');
    await openList(page);
    await openDeleteDialog(page, capture);
    const actionRequest = page.waitForRequest(request =>
      request.method() === 'POST' && Boolean(request.headers()['next-action']),
    );
    await confirmDelete(page);
    const captured = await actionRequest;
    const actionId = captured.headers()['next-action'];
    expect(actionId).toBeTruthy();

    const headers = { 'Next-Action': actionId, 'Content-Type': 'text/plain;charset=UTF-8' };
    const payload = JSON.stringify([target.id]);

    for (const role of ['user', 'moderator'] as const) {
      const context = await browser.newContext();
      try {
        const otherPage = await context.newPage();
        await signIn(otherPage, role);
        await otherPage.request.post(listPath, { headers, data: payload, maxRedirects: 0 });
        expect(await findForum(target.id)).toEqual(target);
      } finally {
        await context.close();
      }
    }

    const anonymousContext = await browser.newContext();
    try {
      await anonymousContext.request.post(listPath, {
        headers,
        data: payload,
        maxRedirects: 0,
      });
      expect(await findForum(target.id)).toEqual(target);
    } finally {
      await anonymousContext.close();
    }
  });

  test('revoking admin privileges before confirmation prevents deletion', async ({ page }) => {
    const category = await seedCategory();
    const target = await seedForum(category.id, 0);
    await signIn(page, 'admin');
    await openList(page);
    await openDeleteDialog(page, target);

    // Authorization must be checked by the action, not only when rendering the page.
    await database('UPDATE "user" SET role = $2 WHERE email = $1', [userEmails[userEmails.length - 1], 'user']);
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete Forum' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    expect(await findForum(target.id)).toEqual(target);
  });
});
