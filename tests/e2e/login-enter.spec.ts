import { expect, test } from '@playwright/test';

test('login supports Enter submit', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('請輸入帳號').fill('test');
  await page.getByPlaceholder('請輸入密碼').fill('test123');
  await page.getByPlaceholder('請輸入密碼').press('Enter');
  await expect(page).toHaveURL(/\/(dashboard|employers|approvals|workers)/);
});
