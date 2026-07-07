import { test, expect, type Page } from '@playwright/test';

async function bootGame(page: Page): Promise<void> {
  await page.goto('?test=1');
  await page.waitForFunction(() => window.__game?.booted === true, undefined, { timeout: 15_000 });
}

async function tapKey(page: Page, code: string): Promise<void> {
  await page.keyboard.down(code);
  await page.waitForTimeout(140);
  await page.keyboard.up(code);
  await page.waitForTimeout(80);
}

async function gotoMap2(page: Page): Promise<void> {
  await page.evaluate(() => window.__game!.teleport!(30.5, 15.5));
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => window.__game!.getMapId() === 'greybox_02');
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(500);
}

test('restoration tint: region starts drained, restores when its flag is set', async ({ page }) => {
  await bootGame(page);
  const start = await page.evaluate(() => window.__game!.getRestore());
  expect(start.flag).toBe('q1_done');
  expect(start.drainT).toBeGreaterThan(0.9); // fully drained at boot

  await page.evaluate(() => window.__game!.setFlag!('q1_done'));
  // Eases out over ~2s (PLAN §7: the signature moment).
  await page.waitForFunction(() => window.__game!.getRestore().drainT < 0.05, undefined, {
    timeout: 6000,
  });
  // A drained-flag flip back re-drains (debug/test path).
  await page.evaluate(() => window.__game!.setFlag!('q1_done', false));
  await page.waitForFunction(() => window.__game!.getRestore().drainT > 0.5, undefined, {
    timeout: 6000,
  });
});

test('resonant charges: blast cracked stone (persistently) and trip charge plates', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await bootGame(page);
  await gotoMap2(page);

  // Charge chest at (3.5, 7.5).
  await page.evaluate(() => window.__game!.teleport!(3.5, 8.5));
  await page.waitForTimeout(200);
  for (let i = 0; i < 5; i++) {
    await tapKey(page, 'KeyE');
    const charges = await page.evaluate(() => window.__game!.getStats().charges);
    if (charges > 0) break;
  }
  expect(await page.evaluate(() => window.__game!.getStats().charges)).toBe(3);

  // Cracked cells (4,10) and (5,10) block the stash pocket.
  expect(await page.evaluate(() => window.__game!.isCellBlocked(4, 10))).toBe(true);
  expect(await page.evaluate(() => window.__game!.isCellBlocked(5, 10))).toBe(true);

  // Detonate right in front of them (retry — a stray hit can interrupt).
  await page.evaluate(() => window.__game!.teleport!(4.5, 9.5));
  await page.waitForTimeout(150);
  for (let i = 0; i < 6; i++) {
    await tapKey(page, 'KeyX');
    const blocked = await page.evaluate(() => window.__game!.isCellBlocked(4, 10));
    if (!blocked) break;
    await page.evaluate(() => window.__game!.teleport!(4.5, 9.5));
  }
  expect(await page.evaluate(() => window.__game!.isCellBlocked(4, 10))).toBe(false);
  expect(await page.evaluate(() => window.__game!.isCellBlocked(5, 10))).toBe(false);
  expect(await page.evaluate(() => window.__game!.getFlag('f_crack_greybox_02_4_10'))).toBe(true);
  expect(await page.evaluate(() => window.__game!.getStats().charges)).toBeLessThan(3);

  // Persistence: leave and re-enter the map — the passage stays open.
  await page.evaluate(() => window.__game!.teleport!(1.5, 8.5));
  await page.keyboard.down('ArrowLeft');
  await page.waitForFunction(() => window.__game!.getMapId() === 'greybox_01');
  await page.keyboard.up('ArrowLeft');
  await page.waitForTimeout(450);
  await gotoMap2(page);
  expect(await page.evaluate(() => window.__game!.isCellBlocked(4, 10))).toBe(false);

  // Charge plate at (10,20) opens the watched door at (12,20).
  expect(await page.evaluate(() => window.__game!.isCellBlocked(12, 20))).toBe(true);
  await page.evaluate(() => window.__game!.teleport!(10.5, 19.5));
  await page.waitForTimeout(150);
  for (let i = 0; i < 6; i++) {
    await tapKey(page, 'KeyX');
    const flag = await page.evaluate(() => window.__game!.getFlag('f_gb2_charge_plate'));
    if (flag) break;
    await page.evaluate(() => window.__game!.teleport!(10.5, 19.5));
  }
  expect(await page.evaluate(() => window.__game!.getFlag('f_gb2_charge_plate'))).toBe(true);
  await page.waitForFunction(() => !window.__game!.isCellBlocked(12, 20), undefined, {
    timeout: 2000,
  });
});

test('spitter: ranged projectile damages the player at distance', async ({ page }) => {
  test.setTimeout(60_000);
  await bootGame(page);
  await gotoMap2(page);
  const before = await page.evaluate(() => window.__game!.getPlayer().hp);

  // Spitter sits at (5.5, 3.5); stand ~3 tiles away, in the open.
  await page.evaluate(() => window.__game!.teleport!(5.5, 6.5));
  await page.waitForFunction((hp0) => window.__game!.getPlayer().hp < hp0, before, {
    timeout: 10_000,
  });
  const spitter = await page.evaluate(() =>
    window.__game!.getEnemies().find((e) => e.kind === 'enemy_spitter')!,
  );
  expect(spitter.hp).toBe(2); // it never took damage — the projectile did the work
});

test('skitter: dashes at the player and dies to one sword hit', async ({ page }) => {
  test.setTimeout(60_000);
  await bootGame(page);
  // Skitter on map 1 at (26.5, 25.5).
  const before = await page.evaluate(() => window.__game!.getPlayer().hp);
  await page.evaluate(() => window.__game!.teleport!(24.5, 25.5));
  await page.waitForFunction((hp0) => window.__game!.getPlayer().hp < hp0, before, {
    timeout: 10_000,
  });

  // Kill it: 1 HP → a single connected swing.
  for (let i = 0; i < 12; i++) {
    const gone = await page.evaluate(
      () => !window.__game!.getEnemies().some((e) => e.kind === 'enemy_skitter'),
    );
    if (gone) break;
    await page.evaluate(() => {
      const g = window.__game!;
      const e = g.getEnemies().find((en) => en.kind === 'enemy_skitter');
      if (e) g.teleport!(e.x - 0.7, e.y);
    });
    await tapKey(page, 'Space');
    await page.waitForTimeout(300);
  }
  const kills = await page.evaluate(() => window.__game!.getStats().kills);
  expect(kills).toBeGreaterThanOrEqual(1);
});
