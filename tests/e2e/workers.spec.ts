import { expect, test } from '@playwright/test';

test('login page reachable', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByText('香港僱員管理系統')).toBeVisible();
  await expect(page.getByRole('button', { name: '進入系統' })).toBeVisible();
});
