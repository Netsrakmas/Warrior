import { Application, Assets, Texture } from 'pixi.js';
import { FixedLoop } from './engine/loop';
import { Input } from './engine/input';
import { AudioStub } from './engine/audio';
import { Rng } from './engine/rng';
import { WorldScene, type SceneAssets } from './game/scenes/world';
import type { MapData } from './game/types';
import type { Facing } from './engine/iso';
import type { SpriteDef } from './engine/anim';
import type { HuskState } from './game/entities/husk';
import greyboxMap from './data/maps/greybox_01.json';
import heroDef from './data/sprites/hero.json';
import huskDef from './data/sprites/enemy_husk.json';

export interface GameDebugHooks {
  booted: boolean;
  testMode: boolean;
  getPlayer: () => {
    x: number;
    y: number;
    facing: Facing;
    depth: number;
    anim: { name: string; frame: number } | null;
    hp: number;
    maxHp: number;
    state: string;
    deaths: number;
  };
  getEnemies: () => { x: number; y: number; hp: number; state: HuskState }[];
  getStats: () => { shards: number; kills: number; pickupsOnGround: number };
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

  const base = import.meta.env.BASE_URL;
  const [heroSheet, huskSheet] = await Promise.all([
    Assets.load<Texture>(`${base}assets/hero_sheet.png`),
    Assets.load<Texture>(`${base}assets/enemy_husk_sheet.png`),
  ]);
  heroSheet.source.scaleMode = 'nearest';
  huskSheet.source.scaleMode = 'nearest';
  const assets: SceneAssets = {
    hero: { def: heroDef as SpriteDef, sheet: heroSheet },
    husk: { def: huskDef as SpriteDef, sheet: huskSheet },
  };

  const services = {
    audio: new AudioStub(testMode),
    rng: new Rng(testMode ? 12345 : Date.now() >>> 0),
  };

  const input = new Input();
  input.attach(window);

  let scene = new WorldScene(
    app.renderer,
    greyboxMap as MapData,
    input,
    app.screen,
    assets,
    services,
  );
  app.stage.addChild(scene.container, scene.uiLayer);

  const loadMap = (map: MapData): void => {
    app.stage.removeChild(scene.container, scene.uiLayer);
    scene.container.destroy({ children: true });
    scene.uiLayer.destroy({ children: true });
    scene = new WorldScene(app.renderer, map, input, app.screen, assets, services);
    app.stage.addChild(scene.container, scene.uiLayer);
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
      hp: scene.player.hp,
      maxHp: scene.player.maxHp,
      state: scene.player.state,
      deaths: scene.player.deaths,
    }),
    getEnemies: () => scene.enemies.map((e) => ({ x: e.x, y: e.y, hp: e.hp, state: e.state })),
    getStats: () => ({
      shards: scene.shards,
      kills: scene.kills,
      pickupsOnGround: scene.pickups.length,
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
