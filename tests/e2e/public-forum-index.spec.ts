import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { expect, test, type Page } from '@playwright/test';

// Keep database access consistent with playwright.config.ts.
const developmentUrl = process.env.DATABASE_URL;
if (!developmentUrl) throw new Error('DATABASE_URL is missing for Public Forum Index tests.');
const dbUrl = new URL(developmentUrl);
if (
  dbUrl.hostname !== '127.0.0.1' ||
  dbUrl.port !== '5434' ||
  dbUrl.pathname !== '/commuforge_dev'
) {
  throw new Error('Public Forum Index E2E requires local commuforge_dev at 127.0.0.1:5434.');
}
dbUrl.pathname = '/commuforge_test';

const categoryIds: string[] = [];
const forumIds: string[] = [];

type RecordRow = { id: string; name: string };

async function database<T>(sql: string, values: unknown[] = []): Promise<T[]> {
  const client = new Client({ connectionString: dbUrl.toString() });
  await client.connect();
  try {
    return (await client.query(sql, values)).rows as T[];
  } finally {
    await client.end();
  }
}

async function seedCategory(label: string, sortOrder: number, description: string | null = null): Promise<RecordRow> {
  const id = randomUUID();
  const rows = await database<RecordRow>(
    `INSERT INTO category (id, name, description, slug, "sortOrder", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) RETURNING id, name`,
    [id, `E2E Public ${label} ${id.slice(0, 8)}`, description, `e2e-public-${id}`, sortOrder],
  );
  categoryIds.push(id);
  return rows[0];
}

async function seedForum(categoryId: string, label: string, sortOrder: number, description: string | null = null): Promise<RecordRow> {
  const id = randomUUID();
  const rows = await database<RecordRow>(
    `INSERT INTO forum (id, name, description, slug, "categoryId", "sortOrder", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) RETURNING id, name`,
    [id, `E2E Public ${label} ${id.slice(0, 8)}`, description, `e2e-public-${id}`, categoryId, sortOrder],
  );
  forumIds.push(id);
  return rows[0];
}

async function openIndex(page: Page): Promise<void> {
  await page.goto('/forums');
  await expect(page.getByRole('heading', { name: 'Forum List', exact: true })).toBeVisible();
}

// Scope assertions to the category card, so other test database records cannot interfere.
function categoryCard(page: Page, name: string) {
  return page.locator('[data-slot="card"]').filter({
    has: page.locator('[data-slot="card-title"]').filter({ hasText: name }),
  });
}

test.describe('Public Forum Index — Layer 1: Public Rendering', () => {
  test.afterEach(async () => {
    if (forumIds.length) {
      await database('DELETE FROM forum WHERE id = ANY($1::text[])', [[...forumIds]]);
      forumIds.length = 0;
    }
    if (categoryIds.length) {
      await database('DELETE FROM category WHERE id = ANY($1::text[])', [[...categoryIds]]);
      categoryIds.length = 0;
    }
  });

  test('anonymous visitors can view /forums without being redirected to sign-in', async ({ page }) => {
    await seedCategory('Anonymous Access', 91000);
    await openIndex(page);
    await expect(page).toHaveURL(/\/forums\/?$/);
    await expect(page.getByRole('heading', { name: 'Forum List' })).toBeVisible();
  });

  test('displays category and forum names and their optional descriptions', async ({ page }) => {
    const category = await seedCategory('Descriptions', 91000, 'Category description from PostgreSQL');
    const forum = await seedForum(category.id, 'Discussion', 0, 'Forum description from PostgreSQL');
    const withoutDescription = await seedForum(category.id, 'No Description', 1);
    await openIndex(page);
    const card = categoryCard(page, category.name);
    await expect(card).toHaveCount(1);
    await expect(card.getByText('Category description from PostgreSQL')).toBeVisible();
    await expect(card.getByText(forum.name, { exact: true })).toBeVisible();
    await expect(card.getByText('Forum description from PostgreSQL')).toBeVisible();
    await expect(card.getByText(withoutDescription.name, { exact: true })).toBeVisible();
  });

  test('forums appear only within their owning category', async ({ page }) => {
    const first = await seedCategory('Owner A', 91000);
    const second = await seedCategory('Owner B', 91001);
    const firstForum = await seedForum(first.id, 'Forum A', 0);
    const secondForum = await seedForum(second.id, 'Forum B', 0);
    await openIndex(page);
    await expect(categoryCard(page, first.name).getByText(firstForum.name, { exact: true })).toBeVisible();
    await expect(categoryCard(page, first.name).getByText(secondForum.name, { exact: true })).toHaveCount(0);
    await expect(categoryCard(page, second.name).getByText(secondForum.name, { exact: true })).toBeVisible();
    await expect(categoryCard(page, second.name).getByText(firstForum.name, { exact: true })).toHaveCount(0);
  });

  test('categories are ordered by sortOrder regardless of insertion order', async ({ page }) => {
    const last = await seedCategory('Last', 92002);
    const first = await seedCategory('First', 92000);
    const middle = await seedCategory('Middle', 92001);
    await openIndex(page);
    const names = await page.locator('[data-slot="card-title"]').allTextContents();
    const positions = [first, middle, last].map(c => names.indexOf(c.name));
    expect(positions.every(i => i >= 0)).toBeTruthy();
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  test('categories with equal sortOrder use id as the tie-breaker', async ({ page }) => {
    const a = await seedCategory('Tie A', 93000);
    const b = await seedCategory('Tie B', 93000);
    await openIndex(page);
    const names = await page.locator('[data-slot="card-title"]').allTextContents();
    const ordered = [a, b].sort((x, y) => x.id.localeCompare(y.id));
    expect(names.indexOf(ordered[0].name)).toBeLessThan(names.indexOf(ordered[1].name));
  });

  test('forums are ordered by sortOrder and then id within a category', async ({ page }) => {
    const category = await seedCategory('Forum Ordering', 94000);
    const last = await seedForum(category.id, 'Last', 3);
    const tieB = await seedForum(category.id, 'Tie B', 2);
    const first = await seedForum(category.id, 'First', 1);
    const tieA = await seedForum(category.id, 'Tie A', 2);
    await openIndex(page);
    const names = await categoryCard(page, category.name).locator('[data-slot="item-title"]').allTextContents();
    const ties = [tieA, tieB].sort((x, y) => x.id.localeCompare(y.id));
    const positions = [first, ...ties, last].map(f => names.indexOf(f.name));
    expect(positions.every(i => i >= 0)).toBeTruthy();
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  test('an empty category remains visible with its empty-state message', async ({ page }) => {
    const empty = await seedCategory('Empty Category', 95000);
    await openIndex(page);
    const card = categoryCard(page, empty.name);
    await expect(card).toBeVisible();
    await expect(card.getByText('No forums have been created in this category yet.')).toBeVisible();
  });

  test('shows the no-categories message when the test database is empty', async ({ page }) => {
    const existing = await database<{ count: string }>('SELECT COUNT(*)::text AS count FROM category');
    test.skip(Number(existing[0].count) !== 0, 'Test database has existing categories; preserve unrelated data.');
    await openIndex(page);
    await expect(page.getByText('There are no community forums available yet.')).toBeVisible();
  });

  test('forum names do not link to unimplemented forum detail pages', async ({ page }) => {
    const category = await seedCategory('No Dead Links', 96000);
    const forum = await seedForum(category.id, 'Plain Text', 0);
    await openIndex(page);
    const card = categoryCard(page, category.name);
    await expect(card.getByText(forum.name, { exact: true })).toBeVisible();
    await expect(card.getByRole('link', { name: forum.name })).toHaveCount(0);
  });
});
