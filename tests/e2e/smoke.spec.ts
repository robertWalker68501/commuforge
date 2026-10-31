import { test, expect } from '@playwright/test';

test('sign-in page loads successfully', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(page).toHaveURL(/\/sign-in$/);
});
