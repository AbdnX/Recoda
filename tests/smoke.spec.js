const { test, expect } = require('@playwright/test');

test('landing page renders primary CTA and waitlist', async ({ page }) => {
  await page.goto('/index.html');
  // Primary hero CTA
  await expect(page.getByRole('link', { name: /Start recording free/i })).toBeVisible();
  // Pricing plan CTA
  await expect(page.getByRole('link', { name: /Start free trial/i })).toBeVisible();
  await expect(page.locator('#waitlist-form')).toBeVisible();
});

test('login page renders form controls', async ({ page }) => {
  await page.goto('/login.html');
  await expect(page.locator('#login-email')).toBeVisible();
  await expect(page.locator('#login-password')).toBeVisible();
  await expect(page.locator('#btn-login-submit')).toBeVisible();
});

test('signup page renders form controls', async ({ page }) => {
  await page.goto('/signup.html');
  await expect(page.locator('#signup-email')).toBeVisible();
  await expect(page.locator('#signup-password')).toBeVisible();
  await expect(page.locator('#btn-signup-submit')).toBeVisible();
});
