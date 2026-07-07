import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MapData } from '../../src/game/types';

const mapPath = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../src/data/maps/greybox_01.json',
);
const map = JSON.parse(readFileSync(mapPath, 'utf-8')) as MapData;

describe('greybox_01 map data', () => {
  it('is 32×32 with consistent layer dimensions', () => {
    expect(map.width).toBe(32);
    expect(map.height).toBe(32);
    for (const layer of [map.layers.ground, map.layers.collision]) {
      expect(layer).toHaveLength(32);
      for (const row of layer) expect(row).toHaveLength(32);
    }
  });

  it('has a solid border except the east passage, which is covered by a goto trigger', () => {
    const c = map.layers.collision;
    for (let i = 0; i < 32; i++) {
      expect(c[0]?.[i]).toBe(1);
      expect(c[31]?.[i]).toBe(1);
      expect(c[i]?.[0]).toBe(1);
      const isPassage = i >= 14 && i <= 16;
      expect(c[i]?.[31]).toBe(isPassage ? 0 : 1);
    }
    // Every walkable border tile must sit inside a goto trigger (no escape).
    for (let y = 14; y <= 16; y++) {
      const covered = (map.triggers ?? []).some(
        (t) => t.action === 'goto' && 31 >= t.tx && 31 < t.tx + t.w && y >= t.ty && y < t.ty + t.h,
      );
      expect(covered).toBe(true);
    }
  });

  it('every pillar object sits on a solid collision cell', () => {
    for (const obj of map.objects ?? []) {
      expect(map.layers.collision[obj.ty]?.[obj.tx]).toBe(1);
    }
  });

  it('has a player spawn on walkable ground', () => {
    const spawn = (map.entities ?? []).find((e) => e.type === 'player_spawn');
    expect(spawn).toBeDefined();
    expect(map.layers.collision[spawn!.ty]?.[spawn!.tx]).toBe(0);
  });
});
