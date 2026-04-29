import { expect, test } from '@playwright/test';

test('login supports Enter submit', async ({ page }) => {
  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ access_token: 'e2e-token' }),
    });
  });
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: '1', username: 'test', role_key: 'admin' }),
    });
  });

  await page.goto('/login');
  await page.getByPlaceholder('請輸入使用者名稱或 Email').fill('test');
  await page.getByPlaceholder('請輸入密碼（至少 6 碼）').fill('test123');
  await page.getByPlaceholder('請輸入密碼（至少 6 碼）').press('Enter');
  await expect(page).toHaveURL(/\/dashboard$/);
});
