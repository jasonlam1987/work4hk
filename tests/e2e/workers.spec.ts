import { expect, test } from '@playwright/test';

test('login page reachable', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByText('Work4HK 勞務管理系統')).toBeVisible();
  await expect(page.getByRole('button', { name: '登入' })).toBeVisible();
});
