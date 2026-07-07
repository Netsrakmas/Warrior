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

/** map1 → map2 → spire via the real triggers. */
async function gotoSpire(page: Page): Promise<void> {
  await page.evaluate(() => window.__game!.teleport!(30.5, 15.5));
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => window.__game!.getMapId() === 'greybox_02');
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(450);
  // North-east trigger at (20..21, 1) — approach from below (screen up-right).
  await page.evaluate(() => window.__game!.teleport!(20.5, 2.8));
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => window.__game!.getMapId() === 'spire_01', undefined, {
    timeout: 5000,
  });
  await page.keyboard.up('ArrowUp');
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(450);
}

test('warden: three phases, summons, defeat restores the spire', async ({ page }) => {
  test.setTimeout(120_000);
  await bootGame(page);
  await gotoSpire(page);

  // The spire starts drained; the Warden waits.
  expect((await page.evaluate(() => window.__game!.getRestore())).flag).toBe('f_spire_restored');
  expect((await page.evaluate(() => window.__game!.getRestore())).drainT).toBeGreaterThan(0.9);
  const boss = await page.evaluate(() => window.__game!.getBoss());
  expect(boss).not.toBeNull();
  expect(boss!.hp).toBe(20);
  expect(boss!.phase).toBe(1);

  // Stay out of blade range while we chip him with the test hook.
  await page.evaluate(() => window.__game!.teleport!(10.5, 14.5));

  // Damage into phase 2 (hp ≤ 13).
  await page.evaluate(() => {
    for (let i = 0; i < 7; i++) window.__game!.hurtEnemy!('boss_warden', 1);
  });
  await page.waitForFunction(() => window.__game!.getBoss()?.phase === 2, undefined, {
    timeout: 3000,
  });

  // Phase 2 summons husks within its cycle.
  await page.waitForFunction(
    () => window.__game!.getEnemies().some((e) => e.kind === 'enemy_husk'),
    undefined,
    { timeout: 20_000 },
  );

  // Damage into phase 3 (hp ≤ 7).
  await page.evaluate(() => {
    for (let i = 0; i < 6; i++) window.__game!.hurtEnemy!('boss_warden', 1);
  });
  await page.waitForFunction(() => window.__game!.getBoss()?.phase === 3, undefined, {
    timeout: 3000,
  });

  // Finish him.
  await page.evaluate(() => {
    for (let i = 0; i < 10; i++) window.__game!.hurtEnemy!('boss_warden', 1);
  });
  await page.waitForFunction(() => window.__game!.getBoss()?.state === 'dead', undefined, {
    timeout: 3000,
  });

  // Defeat flags: warden down + the spire floods back with colour.
  expect(await page.evaluate(() => window.__game!.getFlag('f_warden_down'))).toBe(true);
  expect(await page.evaluate(() => window.__game!.getFlag('f_spire_restored'))).toBe(true);
  await page.waitForFunction(() => window.__game!.getRestore().drainT < 0.05, undefined, {
    timeout: 6000,
  });
});

test('warden: a resonant charge stuns him mid-fight', async ({ page }) => {
  test.setTimeout(120_000);
  await bootGame(page);
  await gotoSpire(page);
  await page.evaluate(() => window.__game!.grantCharges!(2));

  // Step into aggro range so the fight starts (spawn is just outside it).
  await page.evaluate(() => window.__game!.teleport!(10.5, 12.5));
  await page.waitForFunction(
    () => {
      const b = window.__game!.getBoss();
      return b !== null && b.state !== 'idle';
    },
    undefined,
    { timeout: 10_000 },
  );
  // Teleport within blast range of wherever he is and detonate (retry).
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => {
      const g = window.__game!;
      const boss = g.getEnemies().find((e) => e.kind === 'boss_warden');
      if (boss) g.teleport!(boss.x - 1.2, boss.y);
    });
    await tapKey(page, 'KeyX');
    const state = await page.evaluate(() => window.__game!.getBoss()?.state);
    if (state === 'stunned') break;
  }
  expect(await page.evaluate(() => window.__game!.getBoss()?.state)).toBe('stunned');
  // Stun wears off back into the fight.
  await page.waitForFunction(
    () => {
      const s = window.__game!.getBoss()?.state;
      return s !== 'stunned';
    },
    undefined,
    { timeout: 6000 },
  );
});
