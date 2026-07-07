import { test, expect, type Page } from '@playwright/test';

async function bootGame(page: Page): Promise<void> {
  await page.goto('?test=1');
  await page.waitForFunction(() => window.__game?.booted === true, undefined, { timeout: 15_000 });
}

function getPlayer(page: Page) {
  return page.evaluate(() => window.__game!.getPlayer());
}

test('arrow-right moves the player along world (+1,-1) (rotated input)', async ({ page }) => {
  await bootGame(page);
  const before = await getPlayer(page);

  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(500);
  await page.keyboard.up('ArrowRight');

  const after = await getPlayer(page);
  const dx = after.x - before.x;
  const dy = after.y - before.y;
  expect(dx).toBeGreaterThan(0.5);
  expect(dy).toBeLessThan(-0.5);
  expect(Math.abs(dx + dy)).toBeLessThan(0.1); // dx ≈ -dy on the world diagonal
  expect(after.facing).toBe('SE'); // dominant +x → SE
});

test('walls block and slide: player cannot enter a pillar tile', async ({ page }) => {
  await bootGame(page);
  // Pillar tile at (12,12). Approach from the west, pushing due +x
  // (screen right+down = world (+1,0)).
  await page.evaluate(() => window.__game!.teleport!(11.0, 12.5));

  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(700);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('ArrowDown');

  const p = await getPlayer(page);
  expect(p.x).toBeLessThanOrEqual(12 - 0.3 + 0.001); // stopped at wall minus footprint radius
  expect(p.x).toBeGreaterThan(11.5); // but it did travel up to the wall
  expect(Math.abs(p.y - 12.5)).toBeLessThan(0.05); // no vertical drift
});

test('depth key flips as the player circles a pillar', async ({ page }) => {
  await bootGame(page);
  const pillarDepth = 16.5 + 12.5; // pillar at tile (16,12), anchored at its center

  await page.evaluate(() => window.__game!.teleport!(16.5, 11.6));
  const north = await getPlayer(page);
  expect(north.depth).toBeLessThan(pillarDepth); // draws behind the pillar

  await page.evaluate(() => window.__game!.teleport!(16.5, 13.4));
  const south = await getPlayer(page);
  expect(south.depth).toBeGreaterThan(pillarDepth); // draws in front of the pillar
});

test('camera look-ahead: the view leads the player while walking', async ({ page }) => {
  await bootGame(page);
  // Walk screen-right for a while; the camera center should end up AHEAD of
  // the player (so incoming enemies are visible), not trailing behind.
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(1200);
  const during = await page.evaluate(() => window.__game!.getCamera());
  await page.keyboard.up('ArrowRight');
  expect(during.x - during.playerX).toBeGreaterThan(40); // leading, not lagging

  // At rest the camera settles back around the player.
  await page.waitForTimeout(1500);
  const rest = await page.evaluate(() => window.__game!.getCamera());
  expect(Math.abs(rest.x - rest.playerX)).toBeLessThan(70);
});

test('ground chunks exist and cull outside the camera view', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await bootGame(page);
  // Culling happens in render; wait until the loop has actually run a few frames.
  await page.waitForFunction(() => window.__game!.getStepCount() > 5);
  const chunks = await page.evaluate(() => window.__game!.getChunks());
  expect(chunks.total).toBe(16); // 32×32 map in 8×8 chunks
  expect(chunks.visible).toBeGreaterThan(0);
  expect(chunks.visible).toBeLessThan(chunks.total); // culling is active
});

test('F3 toggles the debug overlay', async ({ page }) => {
  await bootGame(page);
  expect(await page.evaluate(() => window.__game!.isDebugOverlayOn())).toBe(false);
  await page.keyboard.press('F3');
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__game!.isDebugOverlayOn())).toBe(true);
  await page.keyboard.press('F3');
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__game!.isDebugOverlayOn())).toBe(false);
});

test('simulation holds a healthy tick rate', async ({ page }) => {
  await bootGame(page);
  const steps0 = await page.evaluate(() => window.__game!.getStepCount());
  await page.waitForTimeout(1000);
  const steps1 = await page.evaluate(() => window.__game!.getStepCount());
  const stepsPerSecond = steps1 - steps0;
  // 60 Hz sim; software-GL CI runners with the fullscreen tint filter can
  // drop sim time when a frame exceeds the catch-up cap — allow slack but
  // still fail on a genuinely broken loop.
  expect(stepsPerSecond).toBeGreaterThan(30);
  expect(stepsPerSecond).toBeLessThanOrEqual(75);
});
