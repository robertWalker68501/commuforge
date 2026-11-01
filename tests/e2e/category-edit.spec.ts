import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { expect, test, type Page } from '@playwright/test';

// Same isolated database guard used by the existing category E2E specs.
const developmentUrl = process.env.DATABASE_URL;
if (!developmentUrl) throw new Error('Missing DATABASE_URL for category edit E2E tests.');
const dbUrl = new URL(developmentUrl);
if (dbUrl.hostname !== '127.0.0.1' || dbUrl.port !== '5434' || dbUrl.pathname !== '/commuforge_dev') {
  throw new Error('Category edit E2E requires local commuforge_dev at 127.0.0.1:5434.');
}
dbUrl.pathname = '/commuforge_test';

const password = 'SafeTestPassword123!';
const listPath = '/dashboard/categories';
const ownedCategoryIds: string[] = [];
const ownedEmails: string[] = [];

type CategoryRow = {
  id: string;
  name: string;
  description: string | null;
  slug: string;
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

async function seedCategory(description: string | null = 'Original description'): Promise<CategoryRow> {
  const id = randomUUID();
  const suffix = randomUUID().slice(0, 8);
  const name = `E2E Edit ${suffix}`;
  const slug = `e2e-edit-${suffix}`;
  const rows = await database<CategoryRow>(
    `INSERT INTO category (id, name, description, slug, "sortOrder", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     RETURNING id, name, description, slug, "sortOrder"`,
    [id, name, description, slug, 40000],
  );
  ownedCategoryIds.push(id);
  return rows[0];
}

async function getCategory(id: string): Promise<CategoryRow> {
  const rows = await database<CategoryRow>(
    'SELECT id, name, description, slug, "sortOrder" FROM category WHERE id = $1',
    [id],
  );
  expect(rows).toHaveLength(1);
  return rows[0];
}

async function signIn(page: Page, role: 'admin' | 'owner' | 'user' = 'admin'): Promise<void> {
  const email = `commuforge-category-edit-${randomUUID()}@example.com`;
  const response = await page.request.post('/api/auth/sign-up/email', {
    data: { name: 'Category Edit E2E', email, password },
  });
  expect(response.ok(), `Sign-up returned HTTP ${response.status()}`).toBeTruthy();
  ownedEmails.push(email);
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
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function openEdit(page: Page, id: string): Promise<void> {
  await page.goto(`${listPath}/${id}/edit`);
  await expect(page.getByRole('button', { name: 'Update Category' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Name' })).toBeVisible();
}

async function save(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Update Category' }).click();
}

async function fillDescription(page: Page, value: string): Promise<void> {
  const description = page.getByRole('textbox', { name: 'Description' });
  // Retry if hydration restores the server-rendered value during interaction.
  await expect(async () => {
    await description.fill(value);
    await expect(description).toHaveValue(value);
    await description.blur();
    await expect(description).toHaveValue(value);
  }).toPass({ timeout: 15000 });
}

test.describe('Category Management — Edit Category', () => {
  test.afterEach(async () => {
    if (ownedCategoryIds.length) {
      await database('DELETE FROM category WHERE id = ANY($1::text[])', [[...ownedCategoryIds]]);
      ownedCategoryIds.length = 0;
    }
    if (ownedEmails.length) {
      await database('DELETE FROM "user" WHERE email = ANY($1::text[])', [[...ownedEmails]]);
      ownedEmails.length = 0;
    }
  });

  test('admin opens the edit form with existing values', async ({ page }) => {
    const category = await seedCategory();
    await signIn(page);
    await openEdit(page, category.id);
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue(category.name);
    await expect(page.getByRole('textbox', { name: 'Description' })).toHaveValue(category.description!);
  });

  test('category list Edit link opens the correct category', async ({ page }) => {
    const category = await seedCategory();
    await signIn(page);
    await page.goto(listPath);
    const row = page.locator('tbody tr').filter({ hasText: category.name });
    await expect(row).toHaveCount(1);
    await row.locator(`a[href="${listPath}/${category.id}/edit"]`).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/categories/${category.id}/edit$`));
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue(category.name);
  });

  test('renaming a category regenerates its slug and preserves sort order', async ({ page }) => {
    const category = await seedCategory();
    await signIn(page);
    await openEdit(page, category.id);
    const name = `Renamed E2E ${randomUUID().slice(0, 8)}`;
    await page.getByRole('textbox', { name: 'Name' }).fill(name);
    await save(page);
    await expect(page).toHaveURL(/\/dashboard\/categories$/);
    expect(await getCategory(category.id)).toMatchObject({
      name,
      slug: name.toLowerCase().replaceAll(' ', '-'),
      description: category.description,
      sortOrder: category.sortOrder,
    });
  });

  test('description-only update preserves the original slug', async ({ page }) => {
    const category = await seedCategory();
    await signIn(page);
    await openEdit(page, category.id);
    await fillDescription(page, 'Revised description');
    await save(page);
    await expect(page).toHaveURL(/\/dashboard\/categories$/);
    expect(await getCategory(category.id)).toMatchObject({
      name: category.name,
      slug: category.slug,
      description: 'Revised description',
    });
  });

  test('duplicate slug is rejected without changing either category', async ({ page }) => {
    const first = await seedCategory();
    const second = await seedCategory();
    await signIn(page);
    await openEdit(page, first.id);
    await page.getByRole('textbox', { name: 'Name' }).fill(second.name);
    await save(page);
    await expect(page.getByText('A category with this name or URL slug already exists.')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${first.id}/edit$`));
    expect(await getCategory(first.id)).toMatchObject(first);
    expect(await getCategory(second.id)).toMatchObject(second);
  });

  test('clearing description stores null', async ({ page }) => {
    const category = await seedCategory();
    await signIn(page);
    await openEdit(page, category.id);
    await fillDescription(page, '');
    await save(page);
    await expect(page).toHaveURL(/\/dashboard\/categories$/);
    expect((await getCategory(category.id)).description).toBeNull();
  });

  test('Reset restores original form values without saving', async ({ page }) => {
    const category = await seedCategory();
    await signIn(page);
    await openEdit(page, category.id);
    await page.getByRole('textbox', { name: 'Name' }).fill('Unsaved name');
    await page.getByRole('textbox', { name: 'Description' }).fill('Unsaved description');
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue(category.name);
    await expect(page.getByRole('textbox', { name: 'Description' })).toHaveValue(category.description!);
    expect(await getCategory(category.id)).toMatchObject(category);
  });

  test('invalid UUID renders a not-found page', async ({ page }) => {
    await signIn(page);
    await page.goto(`${listPath}/not-a-uuid/edit`);
    await expect(page.getByRole('heading', { name: 'Edit Category' })).toHaveCount(0);
    await expect(page.getByText(/404|not found|could not be found/i).first()).toBeVisible();
  });

  test('nonexistent valid UUID renders a not-found page', async ({ page }) => {
    await signIn(page);
    await page.goto(`${listPath}/${randomUUID()}/edit`);
    await expect(page.getByRole('heading', { name: 'Edit Category' })).toHaveCount(0);
    await expect(page.getByText(/404|not found|could not be found/i).first()).toBeVisible();
  });

  test('regular users cannot open the edit page', async ({ page }) => {
    const category = await seedCategory();
    await signIn(page, 'user');
    await page.goto(`${listPath}/${category.id}/edit`);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Edit Category' })).toHaveCount(0);
  });

  test('anonymous visitors are redirected to sign-in', async ({ page }) => {
    const category = await seedCategory();
    await page.goto(`${listPath}/${category.id}/edit`);
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test('direct Server Action replay cannot edit a category as a regular or anonymous user', async ({ page, browser }) => {
    const captureCategory = await seedCategory();
    const target = await seedCategory();

    // Obtain a real action identifier from an authorized submission rather than
    // assuming Next.js action IDs are stable across builds.
    await signIn(page, 'admin');
    await openEdit(page, captureCategory.id);
    const actionRequestPromise = page.waitForRequest(request =>
      request.method() === 'POST' && Boolean(request.headers()['next-action']),
    );
    await page.getByRole('textbox', { name: 'Description' }).fill('Authorized capture');
    await save(page);
    const actionRequest = await actionRequestPromise;
    await expect(page).toHaveURL(/\/dashboard\/categories$/);

    const actionId = actionRequest.headers()['next-action'];
    expect(actionId, 'Expected to capture a genuine Next.js Server Action ID').toBeTruthy();
    const payload = JSON.stringify([{
      id: target.id,
      name: 'Unauthorized Replay Name',
      description: 'Unauthorized replay description',
    }]);
    const headers = {
      'Next-Action': actionId,
      'Content-Type': 'text/plain;charset=UTF-8',
    };
    const endpoint = `${listPath}/${captureCategory.id}/edit`;

    const regularContext = await browser.newContext();
    const anonymousContext = await browser.newContext();
    try {
      const regularPage = await regularContext.newPage();
      await signIn(regularPage, 'user');

      // These requests bypass the edit UI and invoke the action endpoint directly.
      // A redirect or an error response is acceptable; a database mutation is not.
      await regularPage.request.post(endpoint, {
        headers,
        data: payload,
        maxRedirects: 0,
      });
      expect(await getCategory(target.id)).toMatchObject(target);

      await anonymousContext.request.post(endpoint, {
        headers,
        data: payload,
        maxRedirects: 0,
      });
      expect(await getCategory(target.id)).toMatchObject(target);
    } finally {
      await regularContext.close();
      await anonymousContext.close();
    }
  });

  test('owner can edit a category', async ({ page }) => {
    const category = await seedCategory();
    await signIn(page, 'owner');
    await openEdit(page, category.id);
    await fillDescription(page, 'Owner updated');
    await save(page);
    await expect(page).toHaveURL(/\/dashboard\/categories$/);
    expect((await getCategory(category.id)).description).toBe('Owner updated');
  });
});
