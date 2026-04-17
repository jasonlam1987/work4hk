import { expect, test } from '@playwright/test';

test('login supports Enter submit', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('請輸入使用者名稱或 Email').fill('test');
  await page.getByPlaceholder('請輸入密碼（至少 6 碼）').fill('test123');
  await page.getByPlaceholder('請輸入密碼（至少 6 碼）').press('Enter');
  await expect(page).toHaveURL(/\/(dashboard|employers|approvals|workers)/);
});
