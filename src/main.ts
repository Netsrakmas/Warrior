import { Application, Assets, Texture } from 'pixi.js';
import { FixedLoop } from './engine/loop';
import { Input } from './engine/input';
import { WorldScene } from './game/scenes/world';
import type { MapData } from './game/types';
import type { Facing } from './engine/iso';
import type { SpriteDef } from './engine/anim';
import type { HeroAssets } from './game/entities/player';
import greyboxMap from './data/maps/greybox_01.json';
import heroDef from './data/sprites/hero.json';

export interface GameDebugHooks {
  booted: boolean;
  testMode: boolean;
  getPlayer: () => {
    x: number;
    y: number;
    facing: Facing;
    depth: number;
    anim: { name: string; frame: number } | null;
  };
  getFPS: () => number;
  getStepCount: () => number;
  getChunks: () => { visible: number; total: number };
  getMapId: () => string;
  isDebugOverlayOn: () => boolean;
  /** Swap in a new map (used by map transitions and the editor round-trip). */
  loadMap: (map: MapData) => void;
  /** Test-mode only: place the player somewhere exact. */
  teleport?: (x: number, y: number) => void;
}

declare global {
  interface Window {
    __game?: GameDebugHooks;
  }
}

const params = new URLSearchParams(window.location.search);
// ?test=1 → deterministic mode: fixed RNG seed, no audio (PLAN §12).
const testMode = params.get('test') === '1';

async function boot(): Promise<void> {
  const app = new Application();
  await app.init({
    background: '#1a1a24',
    resizeTo: window,
    antialias: false,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });

  const root = document.getElementById('app');
  if (!root) throw new Error('missing #app element');
  root.appendChild(app.canvas);

  const heroSheet = await Assets.load<Texture>(`${import.meta.env.BASE_URL}assets/hero_sheet.png`);
  heroSheet.source.scaleMode = 'nearest';
  const heroAssets: HeroAssets = { def: heroDef as SpriteDef, sheet: heroSheet };

  const input = new Input();
  input.attach(window);

  let scene = new WorldScene(app.renderer, greyboxMap as MapData, input, app.screen, heroAssets);
  app.stage.addChild(scene.container, scene.debug.screenLayer);

  const loadMap = (map: MapData): void => {
    app.stage.removeChild(scene.container, scene.debug.screenLayer);
    scene.container.destroy({ children: true });
    scene.debug.screenLayer.destroy({ children: true });
    scene = new WorldScene(app.renderer, map, input, app.screen, heroAssets);
    app.stage.addChild(scene.container, scene.debug.screenLayer);
  };

  const loop = new FixedLoop(
    (dt) => scene.update(dt),
    (alpha) => scene.render(alpha, app.ticker.FPS),
  );
  app.ticker.add((ticker) => loop.tick(ticker.deltaMS));

  const hooks: GameDebugHooks = {
    booted: true,
    testMode,
    getPlayer: () => ({
      x: scene.player.x,
      y: scene.player.y,
      facing: scene.player.facing,
      depth: scene.player.depth,
      anim: scene.player.animInfo,
    }),
    getFPS: () => app.ticker.FPS,
    getStepCount: () => loop.stepCount,
    getChunks: () => ({ visible: scene.ground.visibleChunkCount, total: scene.ground.chunkCount }),
    getMapId: () => scene.map.id,
    isDebugOverlayOn: () => scene.debug.isEnabled,
    loadMap,
  };
  if (testMode) hooks.teleport = (x, y) => scene.player.teleport(x, y);
  window.__game = hooks;
}

boot().catch((err) => {
  console.error('KEYSTONE failed to boot:', err);
  throw err;
});
