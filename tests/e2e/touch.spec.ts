import { test, expect, type Page } from '@playwright/test';

/**
 * Touch controls are Pixi pointer-event driven, so mouse input exercises the
 * same code path headlessly (?touch=1 forces the layer on).
 */

async function bootTouchGame(page: Page): Promise<void> {
  await page.goto('?test=1&touch=1');
  await page.waitForFunction(() => window.__game?.booted === true, undefined, { timeout: 15_000 });
  await page.waitForFunction(() => window.__game!.getStepCount() > 5);
}

/** Press-and-hold tap: spans at least one sim tick on a slow headless renderer. */
async function tapAt(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(100);
}

async function buttonPos(page: Page, code: string): Promise<{ x: number; y: number }> {
  const btn = await page.evaluate(
    (c) => window.__game!.getTouch().buttons.find((b) => b.code === c),
    code,
  );
  expect(btn, `touch button for ${code}`).toBeDefined();
  return { x: btn!.x, y: btn!.y };
}

test('touch layer is enabled with ?touch=1 and exposes its buttons', async ({ page }) => {
  await bootTouchGame(page);
  const touch = await page.evaluate(() => window.__game!.getTouch());
  expect(touch.enabled).toBe(true);
  const codes = touch.buttons.map((b) => b.code).sort();
  expect(codes).toEqual(['Escape', 'KeyE', 'KeyQ', 'KeyX', 'Space'].sort());
});

test('virtual stick drag moves the player; release stops movement', async ({ page }) => {
  await bootTouchGame(page);
  const before = await page.evaluate(() => window.__game!.getPlayer());

  // Press in the left stick zone and drag right (screen-right = world +x,-y).
  const size = page.viewportSize()!;
  const sx = size.width * 0.25;
  const sy = size.height * 0.6;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 55, sy, { steps: 5 });
  await page.waitForTimeout(600);
  await page.mouse.up();

  const after = await page.evaluate(() => window.__game!.getPlayer());
  expect(after.x).toBeGreaterThan(before.x + 0.5);
  expect(after.y).toBeLessThan(before.y - 0.5);

  // Released: no drift.
  await page.waitForTimeout(300);
  const rest = await page.evaluate(() => window.__game!.getPlayer());
  expect(Math.abs(rest.x - after.x)).toBeLessThan(0.1);
});

test('attack button swings the sword', async ({ page }) => {
  await bootTouchGame(page);
  const pos = await buttonPos(page, 'Space');
  await page.mouse.move(pos.x, pos.y);
  await page.mouse.down();
  await page.waitForFunction(
    () => window.__game!.getPlayer().anim?.name.startsWith('attack'),
    undefined,
    { timeout: 2000 },
  );
  await page.mouse.up();
});

test('E button opens dialogue; tapping the box advances it', async ({ page }) => {
  await bootTouchGame(page);
  // Stand next to Elder Mira.
  await page.evaluate(() => window.__game!.teleport!(14.5, 15.5));
  await page.waitForTimeout(200);

  const e = await buttonPos(page, 'KeyE');
  for (let i = 0; i < 5; i++) {
    await tapAt(page, e.x, e.y);
    await page.waitForTimeout(250);
    if (await page.evaluate(() => window.__game!.getMode().dialogueOpen)) break;
  }
  expect(await page.evaluate(() => window.__game!.getMode().dialogueOpen)).toBe(true);

  // Tap the dialogue box (bottom center) until the conversation closes.
  const size = page.viewportSize()!;
  for (let i = 0; i < 15; i++) {
    const open = await page.evaluate(() => window.__game!.getMode().dialogueOpen);
    if (!open) break;
    await tapAt(page, size.width / 2, size.height - 90);
    await page.waitForTimeout(250);
  }
  expect(await page.evaluate(() => window.__game!.getMode().dialogueOpen)).toBe(false);
  expect(await page.evaluate(() => window.__game!.getFlag('f_met_elder'))).toBe(true);
});

test('menu button pauses; tapping a menu item resumes', async ({ page }) => {
  await bootTouchGame(page);
  const menu = await buttonPos(page, 'Escape');
  await tapAt(page, menu.x, menu.y);
  await page.waitForTimeout(250);
  expect((await page.evaluate(() => window.__game!.getMode())).paused).toBe(true);

  // "Resume" is the first menu item; items sit at viewW/2-140+28, viewH*0.45.
  const size = page.viewportSize()!;
  await tapAt(page, size.width / 2 - 100, size.height * 0.45 + 11);
  await page.waitForTimeout(250);
  expect((await page.evaluate(() => window.__game!.getMode())).paused).toBe(false);
});

test('title menu is tappable: New Game starts play', async ({ page }) => {
  await page.goto('?test=1&touch=1&title=1');
  await page.waitForFunction(() => window.__game?.booted === true, undefined, { timeout: 15_000 });
  await page.waitForTimeout(300);
  expect((await page.evaluate(() => window.__game!.getMode())).mode).toBe('title');

  const size = page.viewportSize()!;
  await tapAt(page, size.width / 2 - 100, size.height * 0.45 + 11); // "New Game"
  await page.waitForFunction(() => window.__game!.getMode().mode === 'playing', undefined, {
    timeout: 3000,
  });
});
