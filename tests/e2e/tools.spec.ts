import { test, expect } from '@playwright/test';
const editorUrl = new URL('../../tools/map-editor.html', import.meta.url).href;
const spriteUrl = new URL('../../tools/sprite-tool.html', import.meta.url).href;

declare global {
  interface Window {
    // Tool test hooks (untyped single-file tools).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __editor: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __spritetool: any;
  }
}

test.describe('map editor', () => {
  test('paints tiles, collision, entities and exports valid map JSON', async ({ page }) => {
    await page.goto(editorUrl);
    await page.evaluate(() => {
      const ed = window.__editor;
      ed.setLayer('ground');
      ed.setTile(3);
      ed.paintAt(4, 5);
      ed.setLayer('collision');
      ed.setTile(1);
      ed.paintAt(6, 6);
      ed.setLayer('entities');
      ed.setPlaceType('player_spawn');
      ed.paintAt(2, 2);
      ed.setLayer('objects');
      ed.setPlaceType('pillar');
      ed.paintAt(6, 6);
    });
    const json = await page.evaluate(() => window.__editor.exportJson());
    const map = JSON.parse(json);
    expect(map.width).toBe(32);
    expect(map.layers.ground[5][4]).toBe(3);
    expect(map.layers.collision[6][6]).toBe(1);
    expect(map.entities).toContainEqual({ type: 'player_spawn', tx: 2, ty: 2 });
    expect(map.objects).toContainEqual({ type: 'pillar', tx: 6, ty: 6 });
  });

  test('undo/redo reverts and reapplies paint', async ({ page }) => {
    await page.goto(editorUrl);
    await page.evaluate(() => {
      const ed = window.__editor;
      ed.setLayer('ground');
      ed.setTile(4);
      ed.paintAt(1, 1);
    });
    expect(await page.evaluate(() => window.__editor.getMap().layers.ground[1][1])).toBe(4);
    await page.evaluate(() => window.__editor.undo());
    expect(await page.evaluate(() => window.__editor.getMap().layers.ground[1][1])).toBe(1);
    await page.evaluate(() => window.__editor.redo());
    expect(await page.evaluate(() => window.__editor.getMap().layers.ground[1][1])).toBe(4);
  });

  test('mouse-click painting works through iso picking (§5.1 inverse)', async ({ page }) => {
    await page.goto(editorUrl);
    // Ask the editor where tile (3,3) is on screen, then click there.
    const target = await page.evaluate(() => {
      const ed = window.__editor;
      ed.setLayer('ground');
      ed.setTile(5);
      // invert screenToTile by scanning: center of tile (3,3) in canvas coords
      for (let px = 0; px < 2000; px += 4) {
        for (let py = 0; py < 1200; py += 4) {
          const t = ed.screenToTile(px, py);
          if (t.tx === 3 && t.ty === 3) return { px, py };
        }
      }
      return null;
    });
    expect(target).not.toBeNull();
    const canvas = page.locator('#c');
    await canvas.click({ position: { x: target!.px, y: target!.py } });
    expect(await page.evaluate(() => window.__editor.getMap().layers.ground[3][3])).toBe(5);
  });

  test('imports a map from the textarea', async ({ page }) => {
    await page.goto(editorUrl);
    const tiny = {
      id: 'test_01',
      name: 'Test',
      tileset: 'overworld',
      width: 4,
      height: 4,
      layers: {
        ground: [
          [1, 1, 1, 1],
          [1, 2, 2, 1],
          [1, 2, 2, 1],
          [1, 1, 1, 1],
        ],
        collision: [
          [1, 1, 1, 1],
          [1, 0, 0, 1],
          [1, 0, 0, 1],
          [1, 1, 1, 1],
        ],
      },
    };
    await page.fill('#io', JSON.stringify(tiny));
    await page.click('#importBtn');
    const map = await page.evaluate(() => window.__editor.getMap());
    expect(map.id).toBe('test_01');
    expect(map.width).toBe(4);
    expect(map.layers.overlay).toHaveLength(4); // filled in on import
  });
});

test.describe('sprite tool', () => {
  test('defines animations and exports sprite JSON matching the schema shape', async ({ page }) => {
    await page.goto(spriteUrl);
    await page.evaluate(() => {
      const st = window.__spritetool;
      st.setDef({
        id: 'hero',
        image: 'hero_sheet.png',
        frameW: 160,
        frameH: 160,
        anchor: { x: 80, y: 140 },
        footprint: { r: 0.3 },
        hurtbox: { w: 28, h: 44 },
        facings: { drawn: ['SE', 'NE'], mirrored: { SW: 'SE', NW: 'NE' } },
        animations: {},
      });
      st.addAnim({ name: 'idle_SE', row: 0, frames: 4, fps: 6, loop: true });
      st.addAnim({
        name: 'attack_SE',
        row: 2,
        frames: 5,
        fps: 15,
        loop: false,
        events: '{"2":"hit_on","4":"hit_off"}',
      });
      st.setAnchor(80, 141);
    });
    const def = JSON.parse(await page.evaluate(() => window.__spritetool.exportJson()));
    expect(def.id).toBe('hero');
    expect(def.anchor).toEqual({ x: 80, y: 141 });
    expect(def.animations.idle_SE).toEqual({ row: 0, frames: 4, fps: 6, loop: true });
    expect(def.animations.attack_SE.events).toEqual({ '2': 'hit_on', '4': 'hit_off' });
    expect(def.facings.mirrored.SW).toBe('SE');
  });

  test('round-trips its own export through import', async ({ page }) => {
    await page.goto(spriteUrl);
    await page.evaluate(() => {
      const st = window.__spritetool;
      st.addAnim({ name: 'walk_SE', row: 1, frames: 8, fps: 12, loop: true });
    });
    const first = await page.evaluate(() => window.__spritetool.exportJson());
    await page.evaluate((json) => window.__spritetool.setDef(JSON.parse(json)), first);
    const second = await page.evaluate(() => window.__spritetool.exportJson());
    expect(JSON.parse(second)).toEqual(JSON.parse(first));
  });
});
