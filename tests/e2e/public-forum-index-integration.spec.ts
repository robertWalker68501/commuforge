import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { expect, test, type Page } from '@playwright/test';

// Use the same isolated local database as playwright.config.ts.
const developmentUrl = process.env.DATABASE_URL;
if (!developmentUrl) throw new Error('DATABASE_URL is required for E2E tests.');
const dbUrl = new URL(developmentUrl);
if (dbUrl.hostname !== '127.0.0.1' || dbUrl.port !== '5434' || dbUrl.pathname !== '/commuforge_dev') {
  throw new Error('Refusing to run outside local commuforge_dev at 127.0.0.1:5434.');
}
dbUrl.pathname = '/commuforge_test';

const categoryIds: string[] = [];
const forumIds: string[] = [];
const emails: string[] = [];
const password = 'SafeTestPassword123!';
type Row = { id: string; name: string };

async function database<T>(sql: string, values: unknown[] = []): Promise<T[]> {
  const client = new Client({ connectionString: dbUrl.toString() });
  await client.connect();
  try { return (await client.query(sql, values)).rows as T[]; }
  finally { await client.end(); }
}

async function category(label: string, order = 99000, description: string | null = null): Promise<Row> {
  const id = randomUUID();
  const name = `E2E Public Integration ${label} ${id.slice(0, 8)}`;
  const [row] = await database<Row>(
    'INSERT INTO category (id, name, description, slug, "sortOrder", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,NOW(),NOW()) RETURNING id,name',
    [id, name, description, `e2e-public-integration-${id}`, order],
  );
  categoryIds.push(id);
  return row;
}

async function forum(categoryId: string, label: string, order = 0, description: string | null = null): Promise<Row> {
  const id = randomUUID();
  const name = `E2E Public Integration ${label} ${id.slice(0, 8)}`;
  const [row] = await database<Row>(
    'INSERT INTO forum (id, name, description, slug, "categoryId", "sortOrder", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW()) RETURNING id,name',
    [id, name, description, `e2e-public-integration-${id}`, categoryId, order],
  );
  forumIds.push(id);
  return row;
}

function card(page: Page, name: string) {
  return page.locator('[data-slot="card"]').filter({
    has: page.locator('[data-slot="card-title"]').getByText(name, { exact: true }),
  });
}

async function publicIndex(page: Page) {
  await page.goto('/forums');
  await expect(page.getByRole('heading', { name: 'Forum List', exact: true })).toBeVisible();
}

async function signInAsAdmin(page: Page) {
  const email = `commuforge-public-integration-${randomUUID()}@example.com`;
  const response = await page.request.post('/api/auth/sign-up/email', {
    data: { name: 'Public Integration E2E', email, password },
  });
  expect(response.ok(), `Sign-up HTTP ${response.status()}`).toBeTruthy();
  emails.push(email);
  const rows = await database<Row>(
    'UPDATE "user" SET "emailVerified" = true, "role" = $2 WHERE email = $1 RETURNING id,name',
    [email, 'admin'],
  );
  expect(rows).toHaveLength(1);
  await page.goto('/sign-in');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  const signInResponse = page.waitForResponse(r => r.url().includes('/api/auth/sign-in/email') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  expect((await signInResponse).ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe('Public Forum Index — Layer 2: Integration & Regression', () => {
  test.afterEach(async () => {
    if (forumIds.length) await database('DELETE FROM forum WHERE id = ANY($1::text[])', [[...forumIds]]);
    if (categoryIds.length) await database('DELETE FROM category WHERE id = ANY($1::text[])', [[...categoryIds]]);
    if (emails.length) await database('DELETE FROM "user" WHERE email = ANY($1::text[])', [[...emails]]);
    forumIds.length = 0;
    categoryIds.length = 0;
    emails.length = 0;
  });

  test('admin forum edits appear on the public index after navigation', async ({ page }) => {
    const owner = await category('Edit Forum');
    const target = await forum(owner.id, 'Before', 0, 'Original forum description');
    await publicIndex(page);
    await expect(card(page, owner.name).getByText(target.name, { exact: true })).toBeVisible();
    await signInAsAdmin(page);
    await page.goto(`/dashboard/forums/${target.id}/edit`);
    await expect(page.getByRole('heading', { name: 'Edit Forum', exact: true })).toBeVisible();
    const renamed = `E2E Updated Forum ${randomUUID().slice(0, 8)}`;
    await page.getByRole('textbox', { name: 'Name' }).fill(renamed);
    await page.getByRole('textbox', { name: 'Description' }).fill('Updated forum description');
    await page.getByRole('button', { name: 'Update Forum' }).click();
    await expect(page).toHaveURL(/\/dashboard\/forums\/?$/);
    await publicIndex(page);
    await expect(card(page, owner.name).getByText(renamed, { exact: true })).toBeVisible();
    await expect(card(page, owner.name).getByText('Updated forum description')).toBeVisible();
    await expect(card(page, owner.name).getByText(target.name, { exact: true })).toHaveCount(0);
  });

  test('admin category edits appear on the public index', async ({ page }) => {
    const target = await category('Before Category', 99000, 'Original category description');
    await publicIndex(page);
    await expect(card(page, target.name)).toBeVisible();
    await signInAsAdmin(page);
    await page.goto(`/dashboard/categories/${target.id}/edit`);
    await expect(page.getByRole('button', { name: 'Update Category' })).toBeVisible();
    const renamed = `E2E Updated Category ${randomUUID().slice(0, 8)}`;
    await page.getByRole('textbox', { name: 'Name' }).fill(renamed);
    const description = page.getByRole('textbox', { name: 'Description' });
    await expect(async () => {
      await description.fill('Updated category description');
      await expect(description).toHaveValue('Updated category description');
      await description.blur();
      await expect(description).toHaveValue('Updated category description');
    }).toPass({ timeout: 15000 });
    await page.getByRole('button', { name: 'Update Category' }).click();
    await expect(page).toHaveURL(/\/dashboard\/categories\/?$/);
    await publicIndex(page);
    await expect(card(page, renamed)).toBeVisible();
    await expect(card(page, renamed).getByText('Updated category description')).toBeVisible();
    await expect(card(page, target.name)).toHaveCount(0);
  });

  test('deleting a forum in admin removes it publicly but keeps its category and other forums', async ({ page }) => {
    const owner = await category('Delete Forum');
    const removed = await forum(owner.id, 'Removed');
    const retained = await forum(owner.id, 'Retained', 1);
    await publicIndex(page);
    await expect(card(page, owner.name).getByText(removed.name, { exact: true })).toBeVisible();
    await signInAsAdmin(page);
    await page.goto('/dashboard/forums');
    await expect(page.getByRole('heading', { name: 'Forums', exact: true })).toBeVisible();
    await page.getByRole('button', { name: `Delete ${removed.name}`, exact: true }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete Forum' }).click();
    await expect(page.getByText('Forum deleted successfully.')).toBeVisible();
    await publicIndex(page);
    await expect(card(page, owner.name)).toBeVisible();
    await expect(card(page, owner.name).getByText(removed.name, { exact: true })).toHaveCount(0);
    await expect(card(page, owner.name).getByText(retained.name, { exact: true })).toBeVisible();
  });

  test('moving a forum to another category is reflected in its public grouping', async ({ page }) => {
    const from = await category('Move Source');
    const to = await category('Move Destination');
    const moved = await forum(from.id, 'Moved');
    await publicIndex(page);
    await expect(card(page, from.name).getByText(moved.name, { exact: true })).toBeVisible();
    // Simulate a committed management change; admin form move behavior is covered by Forum Management tests.
    await database('UPDATE forum SET "categoryId" = $2, "updatedAt" = NOW() WHERE id = $1', [moved.id, to.id]);
    await publicIndex(page);
    await expect(card(page, from.name).getByText(moved.name, { exact: true })).toHaveCount(0);
    await expect(card(page, to.name).getByText(moved.name, { exact: true })).toBeVisible();
    await expect(card(page, from.name).getByText('No forums have been created in this category yet.')).toBeVisible();
  });

  test('database order changes are reflected after reopening the public index', async ({ page }) => {
    const firstCategory = await category('Order A', 99100);
    const secondCategory = await category('Order B', 99101);
    const firstForum = await forum(firstCategory.id, 'Order Forum A', 0);
    const secondForum = await forum(firstCategory.id, 'Order Forum B', 1);
    await publicIndex(page);
    const before = await page.locator('[data-slot="card-title"]').allTextContents();
    expect(before.indexOf(firstCategory.name)).toBeLessThan(before.indexOf(secondCategory.name));
    await database('UPDATE category SET "sortOrder" = $2, "updatedAt" = NOW() WHERE id = $1', [firstCategory.id, 99102]);
    await database('UPDATE forum SET "sortOrder" = $2, "updatedAt" = NOW() WHERE id = $1', [firstForum.id, 2]);
    await publicIndex(page);
    const after = await page.locator('[data-slot="card-title"]').allTextContents();
    expect(after.indexOf(secondCategory.name)).toBeLessThan(after.indexOf(firstCategory.name));
    const names = await card(page, firstCategory.name).locator('[data-slot="item-title"]').allTextContents();
    expect(names.indexOf(secondForum.name)).toBeLessThan(names.indexOf(firstForum.name));
  });

  test('a newly added forum replaces the empty-category message on the next visit', async ({ page }) => {
    const owner = await category('Empty To Populated');
    await publicIndex(page);
    await expect(card(page, owner.name).getByText('No forums have been created in this category yet.')).toBeVisible();
    const added = await forum(owner.id, 'Newly Added');
    await publicIndex(page);
    await expect(card(page, owner.name).getByText(added.name, { exact: true })).toBeVisible();
    await expect(card(page, owner.name).getByText('No forums have been created in this category yet.')).toHaveCount(0);
  });
});
