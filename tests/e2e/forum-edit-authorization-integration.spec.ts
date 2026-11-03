import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { expect, test, type Page } from '@playwright/test';

// Mirror playwright.config.ts: tests may only access the dedicated local test DB.
const developmentUrl = process.env.DATABASE_URL;
if (!developmentUrl) throw new Error('Missing DATABASE_URL for Forum Edit E2E tests.');
const dbUrl = new URL(developmentUrl);
if (dbUrl.hostname !== '127.0.0.1' || dbUrl.port !== '5434' || dbUrl.pathname !== '/commuforge_dev') {
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
type ForumDetails = {
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

async function seedCategory(label: string): Promise<Category> {
  const id = randomUUID();
  const name = `E2E ${label} ${randomUUID().slice(0, 8)}`;
  const rows = await database<Category>(
    `INSERT INTO category (id, name, slug, "sortOrder", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING id, name`,
    [id, name, `e2e-forum-edit-${id}`, 98500],
  );
  categoryIds.push(id);
  return rows[0];
}

async function seedForum(categoryId: string, label: string): Promise<Forum> {
  const id = randomUUID();
  const name = `E2E ${label} ${randomUUID().slice(0, 8)}`;
  const rows = await database<Forum>(
    `INSERT INTO forum (id, name, description, slug, "categoryId", "sortOrder", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) RETURNING id, name`,
    [id, name, 'Original description', `e2e-forum-edit-${id}`, categoryId, 7],
  );
  forumIds.push(id);
  return rows[0];
}

async function forumDetails(id: string): Promise<ForumDetails> {
  const rows = await database<ForumDetails>(
    'SELECT id, name, description, slug, "categoryId", "sortOrder" FROM forum WHERE id = $1',
    [id],
  );
  expect(rows).toHaveLength(1);
  return rows[0];
}

async function signIn(page: Page, role: 'user' | 'moderator' | 'admin' | 'owner'): Promise<void> {
  const email = `commuforge-edit-${randomUUID()}@example.com`;
  const response = await page.request.post('/api/auth/sign-up/email', {
    data: { name: 'Forum Edit E2E', email, password },
  });
  expect(response.ok(), `Sign-up returned HTTP ${response.status()}`).toBeTruthy();
  userEmails.push(email);
  const updated = await database<{ id: string }>(
    'UPDATE "user" SET "emailVerified" = true, "role" = $2 WHERE email = $1 RETURNING id',
    [email, role],
  );
  expect(updated).toHaveLength(1);
  await page.goto('/sign-in');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  const responsePromise = page.waitForResponse(r =>
    r.url().includes('/api/auth/sign-in/email') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  expect((await responsePromise).ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/dashboard\/?$/);
}

async function openEdit(page: Page, id: string): Promise<void> {
  await page.goto(editPath(id));
  await expect(page.getByRole('heading', { name: 'Edit Forum', exact: true })).toBeVisible();
}

async function submitEdit(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Update Forum' }).click();
  await expect(page).toHaveURL(/\/dashboard\/forums\/?$/);
}

test.describe('Forum Management — Edit Forum — Layer 4: Authorization & Integration', () => {
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

  test('guest is redirected to sign-in and cannot access the edit form', async ({ page }) => {
    const category = await seedCategory('Guest');
    const forum = await seedForum(category.id, 'Guest');
    const before = await forumDetails(forum.id);
    await page.goto(editPath(forum.id));
    await expect(page).toHaveURL(/\/sign-in(?:\?.*)?$/);
    await expect(page.getByRole('button', { name: 'Update Forum' })).toHaveCount(0);
    expect(await forumDetails(forum.id)).toEqual(before);
  });

  for (const role of ['user', 'moderator'] as const) {
    test(`${role} cannot access the edit page or modify its forum`, async ({ page }) => {
      const category = await seedCategory(`Denied ${role}`);
      const forum = await seedForum(category.id, `Denied ${role}`);
      const before = await forumDetails(forum.id);
      await signIn(page, role);
      await page.goto(editPath(forum.id));
      await expect(page).toHaveURL(/\/dashboard\/?$/);
      await expect(page.getByRole('button', { name: 'Update Forum' })).toHaveCount(0);
      expect(await forumDetails(forum.id)).toEqual(before);
    });
  }

  for (const role of ['admin', 'owner'] as const) {
    test(`${role} can edit a forum and see the updated record in the listing`, async ({ page }) => {
      const category = await seedCategory(`Allowed ${role}`);
      const forum = await seedForum(category.id, `Allowed ${role}`);
      const before = await forumDetails(forum.id);
      await signIn(page, role);
      await openEdit(page, forum.id);
      const newName = `E2E Updated by ${role} ${randomUUID().slice(0, 8)}`;
      await page.getByRole('textbox', { name: 'Name' }).fill(newName);
      await submitEdit(page);
      expect(await forumDetails(forum.id)).toMatchObject({
        name: newName,
        slug: before.slug,
        categoryId: before.categoryId,
        sortOrder: before.sortOrder,
      });
      const row = page.locator('tbody tr').filter({ hasText: newName });
      await expect(row).toHaveCount(1);
    });
  }

  test('invalid forum ID produces a not-found page without changing data', async ({ page }) => {
    const category = await seedCategory('Invalid ID');
    const forum = await seedForum(category.id, 'Invalid ID');
    const before = await forumDetails(forum.id);
    await signIn(page, 'admin');
    await page.goto(editPath('not-a-uuid'));
    await expect(page.getByRole('heading', { name: 'Edit Forum', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Update Forum' })).toHaveCount(0);
    expect(await forumDetails(forum.id)).toEqual(before);
  });

  test('well-formed but nonexistent forum ID produces a not-found page', async ({ page }) => {
    await signIn(page, 'admin');
    await page.goto(editPath(randomUUID()));
    await expect(page.getByRole('heading', { name: 'Edit Forum', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Update Forum' })).toHaveCount(0);
  });

  test('forum deleted after the edit form loads cannot be recreated by submitting', async ({ page }) => {
    const category = await seedCategory('Deleted');
    const forum = await seedForum(category.id, 'Deleted');
    await signIn(page, 'admin');
    await openEdit(page, forum.id);
    await database('DELETE FROM forum WHERE id = $1', [forum.id]);
    await page.getByRole('textbox', { name: 'Name' }).fill('Should not recreate');
    await page.getByRole('button', { name: 'Update Forum' }).click();
    await expect(page.getByText('Forum does not exist.', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/forums\/[^/]+\/edit\/?$/);
    const rows = await database<{ id: string }>('SELECT id FROM forum WHERE id = $1', [forum.id]);
    expect(rows).toHaveLength(0);
  });

  test('server action rejects a stale edit form after administrator privileges are revoked', async ({ page }) => {
    const category = await seedCategory('Revoked');
    const forum = await seedForum(category.id, 'Revoked');
    const before = await forumDetails(forum.id);
    await signIn(page, 'admin');
    await openEdit(page, forum.id);
    const changed = await database<{ id: string }>(
      'UPDATE "user" SET "role" = $2 WHERE email = $1 RETURNING id',
      [userEmails[userEmails.length - 1], 'user'],
    );
    expect(changed).toHaveLength(1);
    await page.getByRole('textbox', { name: 'Name' }).fill('Unauthorized change');
    await page.getByRole('button', { name: 'Update Forum' }).click();
    // Authorization is enforced again by the Server Action, not just the page.
    // Next.js may render a redirect or surface the rejected action to the client.
    await expect.poll(async () => (await forumDetails(forum.id)).name).toBe(before.name);
    expect(await forumDetails(forum.id)).toEqual(before);
  });
});
