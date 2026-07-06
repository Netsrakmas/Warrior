import { Application } from 'pixi.js';
import { FixedLoop } from './engine/loop';
import { Input } from './engine/input';
import { WorldScene } from './game/scenes/world';
import type { MapData } from './game/types';
import type { Facing } from './engine/iso';
import greyboxMap from './data/maps/greybox_01.json';

export interface GameDebugHooks {
  booted: boolean;
  testMode: boolean;
  getPlayer: () => { x: number; y: number; facing: Facing; depth: number };
  getFPS: () => number;
  getStepCount: () => number;
  getChunks: () => { visible: number; total: number };
  isDebugOverlayOn: () => boolean;
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

  const input = new Input();
  input.attach(window);

  const scene = new WorldScene(app.renderer, greyboxMap as MapData, input, app.screen);
  app.stage.addChild(scene.container);
  app.stage.addChild(scene.debug.screenLayer);

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
    }),
    getFPS: () => app.ticker.FPS,
    getStepCount: () => loop.stepCount,
    getChunks: () => ({ visible: scene.ground.visibleChunkCount, total: scene.ground.chunkCount }),
    isDebugOverlayOn: () => scene.debug.isEnabled,
  };
  if (testMode) hooks.teleport = (x, y) => scene.player.teleport(x, y);
  window.__game = hooks;
}

boot().catch((err) => {
  console.error('KEYSTONE failed to boot:', err);
  throw err;
});
