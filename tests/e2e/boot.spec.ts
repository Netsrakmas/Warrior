import { test, expect } from '@playwright/test';

test('game boots: Pixi app initializes and exposes debug hooks', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('?test=1');

  await page.waitForFunction(() => window.__game?.booted === true, undefined, {
    timeout: 15_000,
  });

  const canvasCount = await page.locator('#app canvas').count();
  expect(canvasCount).toBe(1);

  const testMode = await page.evaluate(() => window.__game?.testMode);
  expect(testMode).toBe(true);

  expect(errors).toEqual([]);
});
