import { expect, test } from '@playwright/test';
import { E2E, testPhone } from '../fixtures';

test('a shopper orders a personalized item and staff take it to confirmed', async ({ page, isMobile }) => {
  // ─── Storefront: product → cart → checkout ───
  await page.goto(`/products/${E2E.productSlug}`);
  await expect(page.locator('.product__title h1')).toHaveText(E2E.productTitle);

  // The theme's own validation: personalization is required.
  await page.locator('button[name="add"]').click();
  await expect(page.locator('#text-1-message')).toContainText('required');

  await page.locator('#text-1').fill('Zainab');
  await page.locator('button[name="add"]').click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.getByText('Zainab')).toBeVisible();

  await page.goto('/checkout');
  await page.locator('#Checkout-name').fill('Zainab Ahmed');
  await page.locator('#Checkout-phone').fill(testPhone());
  await page.locator('#Checkout-city').fill('Lahore');
  await page.locator('#Checkout-addressLine').fill('House 5, Street 9, DHA Phase 5');
  const placeOrder = page.locator('form.co-checkout button[type="submit"]');
  await expect(placeOrder).toBeEnabled();
  // Double-click: the idempotency key must still produce exactly one order.
  await placeOrder.dblclick();

  await expect(page).toHaveURL(/\/orders\/CO-\d+\?key=/);
  await expect(page.getByRole('heading', { name: /Thank you, Zainab/ })).toBeVisible();
  const orderNumber = (await page.locator('text=/Order CO-\\d+/').first().textContent())!.match(/CO-\d+/)![0];

  // ─── Admin: find the order, approve the name, confirm ───
  test.skip(isMobile, 'Admin flow runs once, on desktop');
  await page.goto('/admin/login');
  await page.locator('#login-email').fill(E2E.staffEmail);
  await page.locator('#login-password').fill(E2E.staffPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.goto(`/admin/orders?q=${orderNumber}&status=all`);
  const rows = page.locator('ul li a[href^="/admin/orders/"]');
  await expect(rows).toHaveCount(1);
  await rows.first().click();
  await expect(page.getByRole('heading', { name: orderNumber })).toBeVisible();

  await expect(page.getByText('Zainab', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Design approved for production')).toBeVisible();

  await page.getByRole('button', { name: 'Confirm order' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm order' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Order marked confirmed' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start production' })).toBeEnabled();
});
