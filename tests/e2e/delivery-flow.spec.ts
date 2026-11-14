import { expect, test } from '@playwright/test';

test('completes a delivery from offer to payout', async ({ page }) => {
  await page.goto('/?demo=fast');
  await expect(page.getByTestId('simulation-canvas')).toBeVisible();
  await expect(page.getByTestId('mission-panel')).toContainText('New offer');

  const canvasDataLength = await page.locator('canvas').first().evaluate((canvas) => canvas.toDataURL('image/png').length);
  expect(canvasDataLength).toBeGreaterThan(5_000);

  await page.waitForTimeout(600);
  await page.screenshot({ path: 'docs/showcase/01-dispatch-offer-desktop.png', fullPage: true });
  await page.getByTestId('accept-offer').click();
  await expect(page.getByTestId('mission-panel')).toContainText('Drive to pickup');
  await page.getByTestId('auto-drive').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/showcase/02-third-person-driving.png', fullPage: true });
  await page.getByTestId('auto-drive').click();

  await page.getByLabel('Switch camera').click();
  await page.getByLabel('Toggle day and night').click();
  await page.getByLabel('Settings').click();
  await page.getByRole('button', { name: 'rain', exact: true }).click();
  await page.getByLabel('Close settings').click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'docs/showcase/03-cockpit-rain-night.png', fullPage: true });
  await page.getByTestId('auto-drive').click();

  await expect(page.getByTestId('otp-modal')).toBeVisible({ timeout: 12_000 });
  await page.getByRole('textbox', { name: 'Store PIN', exact: true }).fill('4281');
  await page.getByTestId('verify-otp').click();
  await expect(page.getByTestId('wait-modal')).toBeVisible();
  await page.screenshot({ path: 'docs/showcase/04-store-wait.png', fullPage: true });

  await expect(page.getByTestId('mission-panel')).toContainText('Drive to customer', { timeout: 12_000 });
  await page.getByTestId('auto-drive').click();
  await expect(page.getByTestId('photo-modal')).toBeVisible({ timeout: 12_000 });
  await page.getByTestId('capture-photo').click();
  await page.screenshot({ path: 'docs/showcase/05-photo-proof.png', fullPage: true });
  await page.getByTestId('confirm-delivery').click();
  await expect(page.getByTestId('complete-modal')).toContainText('$21.25 earned');
  await page.screenshot({ path: 'docs/showcase/06-run-complete.png', fullPage: true });
});

test('keeps controls usable on a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?demo=fast');
  await expect(page.getByTestId('mission-panel')).toBeVisible();
  await page.getByTestId('mini-map').click({ position: { x: 24, y: 24 } });
  await expect(page.getByTestId('mission-panel')).toContainText('Pinned destination');
  await page.getByTestId('accept-offer').click();
  await expect(page.getByLabel('Steer left')).toBeVisible();
  await expect(page.getByLabel('Accelerate')).toBeVisible();
  await page.screenshot({ path: 'docs/showcase/07-mobile-driving.png', fullPage: true });

  await page.getByLabel('Settings').click();
  await page.getByRole('button', { name: 'EV', exact: true }).click();
  await expect(page.getByRole('button', { name: 'EV', exact: true })).toHaveClass(/selected/);
  await page.getByRole('button', { name: 'Wheel' }).click();
  await page.getByLabel('Close settings').click();
  await expect(page.getByLabel('Steer left')).toBeHidden();
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'docs/showcase/08-wheel-mode-mobile.png', fullPage: true });
});

test('resolves a player collision against street furniture', async ({ page }) => {
  await page.goto('/?demo=fast');
  await page.getByTestId('accept-offer').click();
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(4_000);
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(10_000);
  await page.keyboard.up('ArrowUp');
  await expect.poll(async () => page.getByTestId('collision-count').textContent()).not.toContain('0 hits');
});
