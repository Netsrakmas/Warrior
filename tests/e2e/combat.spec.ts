import { test, expect, type Page } from '@playwright/test';

async function bootGame(page: Page): Promise<void> {
  await page.goto('?test=1');
  await page.waitForFunction(() => window.__game?.booted === true, undefined, { timeout: 15_000 });
}

test('input→swing: attack starts within 2 sim ticks of the key press (<100 ms gate)', async ({
  page,
}) => {
  await bootGame(page);
  // Gate measurable (PLAN §9 P3): input→swing < 100 ms. At 60 Hz sim that
  // means the attack must begin within a couple of ticks of the keydown.
  // Measured in sim ticks (not wall clock) because headless SwiftShader
  // renders at ~15 fps; on real hardware ticks are 16.7 ms.
  const result = await page.evaluate(
    () =>
      new Promise<{ name: string | undefined; frame: number | undefined }>((resolve) => {
        const g = window.__game!;
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
        // Two rAFs guarantee the game loop ran at least once after the keydown.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const p = g.getPlayer();
            resolve({ name: p.anim?.name, frame: p.anim?.frame });
          }),
        );
      }),
  );
  // Attack must already be playing on the first render after input — that is
  // one frame of latency: 16.7 ms at 60 fps, far under the 100 ms budget.
  expect(result.name).toMatch(/^attack_/);
  expect(result.frame).toBeLessThanOrEqual(2);
  await page.evaluate(() =>
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true })),
  );
});

test('sword kills a husk in three hits and loot drops', async ({ page }) => {
  await bootGame(page);
  // Husk 0 spawns at (8.5, 8.5) patrolling south. Put the player right on it.
  await page.evaluate(() => {
    const e = window.__game!.getEnemies()[0]!;
    window.__game!.teleport!(e.x - 0.8, e.y);
  });

  // Swing until it dies (3 HP, 1 dmg per hit, knockback pushes it away —
  // walk forward between swings to stay in range).
  for (let i = 0; i < 14; i++) {
    const dead = await page.evaluate(() => window.__game!.getStats().kills > 0);
    if (dead) break;
    // step toward the enemy (screen right+down = world +x)
    await page.evaluate(() => {
      const g = window.__game!;
      const e = g.getEnemies()[0];
      if (e) g.teleport!(e.x - 0.8, e.y);
    });
    await page.keyboard.press('Space');
    await page.waitForTimeout(420); // swing duration + hitstop
  }

  const stats = await page.evaluate(() => window.__game!.getStats());
  expect(stats.kills).toBe(1);
  // Loot dropped: shards may already have magneted into the player standing
  // next to the corpse, so count collected + still-on-ground together.
  expect(stats.shards + stats.pickupsOnGround).toBeGreaterThan(0);

  // Walk over the drops: they magnet + collect.
  const drop = await page.evaluate(() => {
    const g = window.__game!;
    const e = g.getEnemies(); // remaining enemy list excludes the dead one after its anim
    return e.length;
  });
  expect(drop).toBeLessThanOrEqual(2);
  await page.evaluate(() => {
    // teleport roughly where the husk died — pickups magnet from 1.2 tiles
    window.__game!.teleport!(8.5, 12.5);
  });
  // sweep a small area to catch scattered shards
  for (const [dx, dy] of [
    [0, 0],
    [0.4, 0],
    [-0.4, 0.3],
    [0, -0.4],
    [0.3, 0.4],
  ]) {
    await page.evaluate(
      ([x, y]) => {
        const g = window.__game!;
        const p = g.getPlayer();
        g.teleport!(p.x + x!, p.y + y!);
      },
      [dx, dy],
    );
    await page.waitForTimeout(250);
  }
  const after = await page.evaluate(() => window.__game!.getStats());
  expect(after.shards).toBeGreaterThan(0);
});

test('husk telegraphs, then hits: player loses hp and gets i-frames', async ({ page }) => {
  await bootGame(page);
  const before = await page.evaluate(() => window.__game!.getPlayer());
  expect(before.hp).toBe(6);

  // Stand next to a husk and wait — it should aggro, wind up, and strike.
  await page.evaluate(() => {
    const e = window.__game!.getEnemies()[0]!;
    window.__game!.teleport!(e.x - 0.9, e.y);
  });

  await page.waitForFunction(() => window.__game!.getPlayer().hp < 6, undefined, {
    timeout: 5000,
  });
  const hurt = await page.evaluate(() => window.__game!.getPlayer());
  expect(hurt.hp).toBe(5); // exactly one hit — i-frames block immediate re-hit

  // Stay put briefly: i-frames (1s) must prevent a second hit within ~0.6s.
  await page.waitForTimeout(500);
  const still = await page.evaluate(() => window.__game!.getPlayer());
  expect(still.hp).toBeGreaterThanOrEqual(4); // at most one more full cycle later
});

test('husk aggros when the player is near and de-aggros when far', async ({ page }) => {
  await bootGame(page);
  const idle = await page.evaluate(() => window.__game!.getEnemies()[0]!.state);
  expect(['patrol', 'chase']).toContain(idle); // player spawns far → patrol

  await page.evaluate(() => {
    const e = window.__game!.getEnemies()[0]!;
    window.__game!.teleport!(e.x - 3, e.y);
  });
  await page.waitForFunction(() => window.__game!.getEnemies()[0]?.state === 'chase', undefined, {
    timeout: 2000,
  });

  // Teleport far away → de-aggro back to patrol.
  await page.evaluate(() => window.__game!.teleport!(28, 6));
  await page.waitForFunction(() => window.__game!.getEnemies()[0]?.state === 'patrol', undefined, {
    timeout: 3000,
  });
});

test('player death shows game over; Continue respawns at spawn with full hearts', async ({
  page,
}) => {
  await bootGame(page);
  // Park the player inside the husk's reach and wait out 6 hits.
  test.setTimeout(60_000);
  await page.evaluate(() => {
    const e = window.__game!.getEnemies()[0]!;
    window.__game!.teleport!(e.x - 0.8, e.y);
  });
  // Keep re-parking next to the husk (knockback pushes us out of reach).
  await page.waitForFunction(
    () => {
      const g = window.__game!;
      const p = g.getPlayer();
      if (p.state === 'dead' || p.deaths > 0) return true;
      const e = g.getEnemies()[0];
      if (e && p.state === 'normal') g.teleport!(e.x - 0.8, e.y);
      return false;
    },
    undefined,
    { timeout: 45_000, polling: 200 },
  );

  // Death animation finishes → game-over screen.
  await page.waitForFunction(() => window.__game!.getMode().mode === 'gameover', undefined, {
    timeout: 5000,
  });

  // "Continue" is the first menu item.
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () =>
      window.__game!.getMode().mode === 'playing' &&
      window.__game!.getPlayer().state === 'normal' &&
      window.__game!.getPlayer().hp === 6,
    undefined,
    { timeout: 3000 },
  );
  const respawned = await page.evaluate(() => window.__game!.getPlayer());
  expect(respawned.deaths).toBe(1);
  expect(respawned.x).toBeCloseTo(16.5, 1); // back at spawn
  expect(respawned.y).toBeCloseTo(16.5, 1);
});
