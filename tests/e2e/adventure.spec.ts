import { test, expect, type Page } from '@playwright/test';

async function bootGame(page: Page, extra = ''): Promise<void> {
  await page.goto(`?test=1${extra}`);
  await page.waitForFunction(() => window.__game?.booted === true, undefined, { timeout: 15_000 });
}

/**
 * Hold a key long enough to span at least one sim tick even on a slow
 * headless renderer — a plain press() can land entirely between ticks.
 */
async function tapKey(page: Page, code: string): Promise<void> {
  await page.keyboard.down(code);
  await page.waitForTimeout(140);
  await page.keyboard.up(code);
  await page.waitForTimeout(80);
}

/** Open the dialogue with E (retrying) and advance it until it closes. */
async function talkThrough(page: Page): Promise<void> {
  let opened = false;
  for (let i = 0; i < 6; i++) {
    await tapKey(page, 'KeyE');
    opened = await page.evaluate(() => window.__game!.getMode().dialogueOpen);
    if (opened) break;
  }
  expect(opened).toBe(true);
  for (let i = 0; i < 25; i++) {
    const open = await page.evaluate(() => window.__game!.getMode().dialogueOpen);
    if (!open) return;
    await tapKey(page, 'KeyE');
  }
  throw new Error('dialogue never closed');
}

test('title screen: new game starts from the menu', async ({ page }) => {
  await bootGame(page, '&title=1');
  expect((await page.evaluate(() => window.__game!.getMode())).mode).toBe('title');
  await tapKey(page, 'Enter'); // "New Game" is the first item
  await page.waitForFunction(() => window.__game!.getMode().mode === 'playing');
  expect(await page.evaluate(() => window.__game!.getMapId())).toBe('greybox_01');
});

test('dialogue: typewriter box opens, advances, applies effects; journal lists the quest', async ({
  page,
}) => {
  await bootGame(page);
  // Elder Mira stands at (14.5, 14.5).
  await page.evaluate(() => window.__game!.teleport!(14.5, 15.5));
  await page.waitForTimeout(150);
  await tapKey(page, 'KeyE');
  await talkThrough(page);

  expect(await page.evaluate(() => window.__game!.getFlag('f_met_elder'))).toBe(true);
  const quests = await page.evaluate(() => window.__game!.getQuests());
  expect(quests['q1_wake_the_meadow']).toBeDefined();
  expect(quests['q1_wake_the_meadow']!.step).toBe(1); // talk_elder completed

  await tapKey(page, 'KeyQ');
  await page.waitForTimeout(100);
  expect((await page.evaluate(() => window.__game!.getMode())).journalOpen).toBe(true);
  await tapKey(page, 'KeyQ');
});

test('kill quest counts husk kills', async ({ page }) => {
  await bootGame(page);
  await page.evaluate(() => window.__game!.teleport!(14.5, 15.5));
  await page.waitForTimeout(150);
  await tapKey(page, 'KeyE');
  await talkThrough(page);

  // Kill husk 0 with repeated re-positioning swings.
  for (let i = 0; i < 14; i++) {
    const kills = await page.evaluate(() => window.__game!.getStats().kills);
    if (kills > 0) break;
    await page.evaluate(() => {
      const g = window.__game!;
      const e = g.getEnemies()[0];
      if (e) g.teleport!(e.x - 0.8, e.y);
    });
    await tapKey(page, 'Space');
    await page.waitForTimeout(420);
  }
  const quests = await page.evaluate(() => window.__game!.getQuests());
  expect(quests['q1_wake_the_meadow']!.counts['kill_husks']).toBe(1);
});

test('GATE: fetch quest start→finish across two maps (kite for Pip)', async ({ page }) => {
  test.setTimeout(90_000);
  await bootGame(page);

  // 1. Talk to Pip (18.5, 14.5) → quest s1 starts.
  await page.evaluate(() => window.__game!.teleport!(18.5, 15.5));
  await page.waitForTimeout(150);
  await tapKey(page, 'KeyE');
  await talkThrough(page);
  let quests = await page.evaluate(() => window.__game!.getQuests());
  expect(quests['s1_lost_kite']?.state).toBe('active');

  // 2. Walk into the east passage trigger → transition to greybox_02.
  await page.evaluate(() => window.__game!.teleport!(30.5, 15.5));
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('ArrowDown');
  await page.waitForFunction(() => window.__game!.getMapId() === 'greybox_02', undefined, {
    timeout: 5000,
  });
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('ArrowDown');
  await page.waitForTimeout(500); // fade-in
  const arrived = await page.evaluate(() => window.__game!.getPlayer());
  expect(arrived.x).toBeCloseTo(2.5, 1);
  expect(arrived.y).toBeCloseTo(8.5, 1);

  // 3. Key chest at (4.5, 18.5).
  await page.evaluate(() => window.__game!.teleport!(4.5, 19.5));
  await page.waitForTimeout(150);
  await tapKey(page, 'KeyE');
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__game!.getInventory())).toContain('key');

  // 4. Locked door at (12, 8) — unlock with the key.
  expect(await page.evaluate(() => window.__game!.isCellBlocked(12, 8))).toBe(true);
  await page.evaluate(() => window.__game!.teleport!(11.4, 8.5));
  await page.waitForTimeout(150);
  await tapKey(page, 'KeyE');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__game!.isCellBlocked(12, 8))).toBe(false);
  expect(await page.evaluate(() => window.__game!.getInventory())).not.toContain('key');

  // 5. Kite chest at (18.5, 4.5) → find_kite completes.
  await page.evaluate(() => window.__game!.teleport!(18.5, 5.5));
  await page.waitForTimeout(150);
  await tapKey(page, 'KeyE');
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__game!.getInventory())).toContain('kite');
  quests = await page.evaluate(() => window.__game!.getQuests());
  expect(quests['s1_lost_kite']!.step).toBe(1); // return_kite

  // 6. Back through the west passage → greybox_01.
  await page.evaluate(() => window.__game!.teleport!(1.5, 8.5));
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(() => window.__game!.getMapId() === 'greybox_01', undefined, {
    timeout: 5000,
  });
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(500);

  // 7. Hand the kite to Pip → quest done.
  await page.evaluate(() => window.__game!.teleport!(18.5, 15.5));
  await page.waitForTimeout(150);
  await tapKey(page, 'KeyE');
  await talkThrough(page);
  quests = await page.evaluate(() => window.__game!.getQuests());
  expect(quests['s1_lost_kite']?.state).toBe('done');
  expect(await page.evaluate(() => window.__game!.getFlag('s1_done'))).toBe(true);
  expect(await page.evaluate(() => window.__game!.getInventory())).not.toContain('kite');
});

test('GATE: save mid-quest, reload, continue from the slot, finish', async ({ page }) => {
  test.setTimeout(90_000);
  await bootGame(page);

  // Start the kite quest and grab the kite (teleport shortcut through map 2).
  await page.evaluate(() => window.__game!.teleport!(18.5, 15.5));
  await page.waitForTimeout(150);
  await tapKey(page, 'KeyE');
  await talkThrough(page);
  await page.evaluate(() => window.__game!.teleport!(30.5, 15.5));
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => window.__game!.getMapId() === 'greybox_02');
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__game!.teleport!(18.5, 5.5));
  await page.waitForTimeout(150);
  await tapKey(page, 'KeyE');
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__game!.getInventory())).toContain('kite');

  // Save to slot 1 from the pause menu: Esc → Down → Enter.
  await tapKey(page, 'Escape');
  await page.waitForTimeout(150);
  expect((await page.evaluate(() => window.__game!.getMode())).paused).toBe(true);
  await tapKey(page, 'ArrowDown'); // Resume → Save to Slot 1
  await page.waitForTimeout(100);
  await tapKey(page, 'Enter');
  await page.waitForTimeout(200);
  expect((await page.evaluate(() => window.__game!.getMode())).paused).toBe(false);

  // Reload the page entirely, go through the title, continue slot 1.
  await page.goto('?test=1&title=1');
  await page.waitForFunction(() => window.__game?.booted === true);
  await tapKey(page, 'ArrowDown'); // New Game → Continue Slot 1
  await page.waitForTimeout(100);
  await tapKey(page, 'Enter');
  await page.waitForFunction(() => window.__game!.getMode().mode === 'playing');
  await page.waitForTimeout(400);

  // Restored: map, quest step, inventory.
  expect(await page.evaluate(() => window.__game!.getMapId())).toBe('greybox_02');
  const quests = await page.evaluate(() => window.__game!.getQuests());
  expect(quests['s1_lost_kite']).toEqual({ state: 'active', step: 1, counts: {} });
  expect(await page.evaluate(() => window.__game!.getInventory())).toContain('kite');

  // Finish: back to map 1, hand it in.
  await page.evaluate(() => window.__game!.teleport!(1.5, 8.5));
  await page.keyboard.down('ArrowLeft');
  await page.waitForFunction(() => window.__game!.getMapId() === 'greybox_01', undefined, {
    timeout: 5000,
  });
  await page.keyboard.up('ArrowLeft');
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__game!.teleport!(18.5, 15.5));
  await page.waitForTimeout(150);
  await tapKey(page, 'KeyE');
  await talkThrough(page);
  const done = await page.evaluate(() => window.__game!.getQuests());
  expect(done['s1_lost_kite']?.state).toBe('done');
});

test('pushable block onto pressure plate opens the flag door', async ({ page }) => {
  test.setTimeout(60_000);
  await bootGame(page);
  // Go to map 2 via the trigger.
  await page.evaluate(() => window.__game!.teleport!(30.5, 15.5));
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => window.__game!.getMapId() === 'greybox_02');
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(500);

  // Door watched by the plate starts closed.
  expect(await page.evaluate(() => window.__game!.isCellBlocked(18, 13))).toBe(true);

  // Stand north of the block at (16,9) and push it south onto the plate (16,11).
  await page.evaluate(() => window.__game!.teleport!(16.5, 8.55));
  // World +y = screen down-left.
  await page.keyboard.down('ArrowDown');
  await page.keyboard.down('ArrowLeft');
  await page.waitForFunction(() => window.__game!.getFlag('f_gb2_plate'), undefined, {
    timeout: 15_000,
  });
  await page.keyboard.up('ArrowDown');
  await page.keyboard.up('ArrowLeft');

  // Plate flag opens the south door.
  await page.waitForFunction(() => !window.__game!.isCellBlocked(18, 13), undefined, {
    timeout: 2000,
  });
});

test('transitions never strand the player (there and back, twice)', async ({ page }) => {
  test.setTimeout(60_000);
  await bootGame(page);
  for (let round = 0; round < 2; round++) {
    await page.evaluate(() => window.__game!.teleport!(30.5, 15.5));
    await page.keyboard.down('ArrowRight');
    await page.waitForFunction(() => window.__game!.getMapId() === 'greybox_02');
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(450);
    let p = await page.evaluate(() => window.__game!.getPlayer());
    let blocked = await page.evaluate(
      ([x, y]) => window.__game!.isCellBlocked(Math.floor(x!), Math.floor(y!)),
      [p.x, p.y],
    );
    expect(blocked).toBe(false);

    await page.evaluate(() => window.__game!.teleport!(1.5, 8.5));
    await page.keyboard.down('ArrowLeft');
    await page.waitForFunction(() => window.__game!.getMapId() === 'greybox_01');
    await page.keyboard.up('ArrowLeft');
    await page.waitForTimeout(450);
    p = await page.evaluate(() => window.__game!.getPlayer());
    blocked = await page.evaluate(
      ([x, y]) => window.__game!.isCellBlocked(Math.floor(x!), Math.floor(y!)),
      [p.x, p.y],
    );
    expect(blocked).toBe(false);
  }
});
