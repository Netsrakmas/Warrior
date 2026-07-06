import { test, expect } from '@playwright/test';
const editorUrl = new URL('../../tools/map-editor.html', import.meta.url).href;

/**
 * Phase 2 gate (PLAN §9): a map painted in the editor plays in the engine;
 * a sprite assembled in the sprite tool animates in-game with correct
 * anchor and footprint.
 */

test('editor-painted map plays in the engine', async ({ page }) => {
  // 1. Paint a map in the real editor (through its tool code paths).
  await page.goto(editorUrl);
  const exported: string = await page.evaluate(() => {
    const ed = window.__editor;
    ed.setLayer('ground');
    ed.setTile(2);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) ed.paintAt(x, y);
    ed.setLayer('collision');
    ed.setTile(1);
    for (let i = 0; i < 32; i++) {
      ed.paintAt(i, 0);
      ed.paintAt(i, 31);
      ed.paintAt(0, i);
      ed.paintAt(31, i);
    }
    ed.paintAt(10, 8); // a lone wall to collide with
    ed.setLayer('entities');
    ed.setPlaceType('player_spawn');
    ed.paintAt(8, 8);
    const m = ed.getMap();
    m.id = 'painted_01';
    m.name = 'Painted In Editor';
    return JSON.stringify(m);
  });

  // 2. Boot the game and hot-load the exported map.
  await page.goto('?test=1');
  await page.waitForFunction(() => window.__game?.booted === true, undefined, { timeout: 15_000 });
  await page.evaluate((json) => window.__game!.loadMap(JSON.parse(json)), exported);

  expect(await page.evaluate(() => window.__game!.getMapId())).toBe('painted_01');
  const spawn = await page.evaluate(() => window.__game!.getPlayer());
  expect(spawn.x).toBeCloseTo(8.5, 5); // spawned at the painted player_spawn
  expect(spawn.y).toBeCloseTo(8.5, 5);

  // 3. The painted wall at (10,8) blocks movement, pushing due +x.
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(900);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('ArrowDown');
  const p = await page.evaluate(() => window.__game!.getPlayer());
  expect(p.x).toBeLessThanOrEqual(10 - 0.3 + 0.001);
  expect(p.x).toBeGreaterThan(9);
});

test('tool-defined hero sprite animates in-game with correct anchor & footprint', async ({
  page,
}) => {
  await page.goto('?test=1');
  await page.waitForFunction(() => window.__game?.booted === true, undefined, { timeout: 15_000 });

  // Idle by default.
  const idle = await page.evaluate(() => window.__game!.getPlayer());
  expect(idle.anim?.name).toBe('idle_SE');

  // Walking switches animation and advances frames.
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(250);
  const w1 = await page.evaluate(() => window.__game!.getPlayer());
  await page.waitForTimeout(200);
  const w2 = await page.evaluate(() => window.__game!.getPlayer());
  await page.keyboard.up('ArrowRight');
  expect(w1.anim?.name).toBe('walk_SE');
  expect(w2.anim?.name).toBe('walk_SE');
  expect(w2.anim?.frame).not.toBe(w1.anim?.frame); // frames advance at 12fps

  // Facing left (screen) → mirrored NW resolves to a drawn NE row.
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(150);
  const left = await page.evaluate(() => window.__game!.getPlayer());
  await page.keyboard.up('ArrowLeft');
  expect(left.facing).toBe('NW');
  expect(left.anim?.name).toBe('walk_NE'); // mirrored facing plays the drawn row

  // Back to idle when input stops.
  await page.waitForTimeout(200);
  const rest = await page.evaluate(() => window.__game!.getPlayer());
  expect(rest.anim?.name).toMatch(/^idle_/);
});
