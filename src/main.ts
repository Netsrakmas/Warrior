import { Application, Assets, Texture } from 'pixi.js';
import { FixedLoop } from './engine/loop';
import { Input } from './engine/input';
import { AudioStub } from './engine/audio';
import { Rng } from './engine/rng';
import { Game } from './game/game';
import type { SceneAssets } from './game/scenes/world';
import type { MapData } from './game/types';
import type { Facing } from './engine/iso';
import type { SpriteDef } from './engine/anim';
import type { QuestProgress } from './game/state';
import type { QuestDefs } from './game/systems/quests';
import type { DialogueDefs } from './game/systems/dialogue';
import heroDef from './data/sprites/hero.json';
import huskDef from './data/sprites/enemy_husk.json';
import spitterDef from './data/sprites/enemy_spitter.json';
import skitterDef from './data/sprites/enemy_skitter.json';
import wardenDef from './data/sprites/boss_warden.json';
import questsData from './data/quests.json';
import dialogueData from './data/dialogue.json';

export interface GameDebugHooks {
  booted: boolean;
  testMode: boolean;
  getMode: () => { mode: string; paused: boolean; dialogueOpen: boolean; journalOpen: boolean };
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
  getEnemies: () => { kind: string; x: number; y: number; hp: number; state: string }[];
  getStats: () => { shards: number; kills: number; pickupsOnGround: number; charges: number };
  getRestore: () => { flag: string | null; drainT: number };
  getBoss: () => { hp: number; maxHp: number; phase: number; state: string } | null;
  getQuests: () => Record<string, QuestProgress>;
  getInventory: () => string[];
  getFlag: (flag: string) => boolean;
  getFPS: () => number;
  getStepCount: () => number;
  getChunks: () => { visible: number; total: number };
  getMapId: () => string;
  isDebugOverlayOn: () => boolean;
  isCellBlocked: (tx: number, ty: number) => boolean;
  getTouch: () => {
    enabled: boolean;
    buttons: { code: string; x: number; y: number; r: number }[];
  };
  /** Swap in a new map (used by the editor round-trip test). */
  loadMap: (map: MapData) => void;
  /** Test-mode only: place the player somewhere exact. */
  teleport?: (x: number, y: number) => void;
  /** Test-mode only: set a world flag directly. */
  setFlag?: (flag: string, value?: boolean) => void;
  /** Test-mode only: damage an enemy of the given kind. */
  hurtEnemy?: (kind: string, damage: number) => boolean;
  /** Test-mode only: add resonant charges. */
  grantCharges?: (n: number) => void;
}

declare global {
  interface Window {
    __game?: GameDebugHooks;
  }
}

const params = new URLSearchParams(window.location.search);
// ?test=1 → deterministic mode: fixed RNG seed, no audio (PLAN §12).
const testMode = params.get('test') === '1';
// In test mode we skip the title screen unless the test asks for it.
const wantTitle = params.get('title') === '1';
// Touch controls: auto-detected, overridable with ?touch=1 / ?touch=0.
const touchEnabled =
  params.get('touch') === '1' ||
  (params.get('touch') !== '0' && ('ontouchstart' in window || navigator.maxTouchPoints > 0));

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
  const [heroSheet, huskSheet, spitterSheet, skitterSheet, wardenSheet] = await Promise.all([
    Assets.load<Texture>(`${base}assets/hero_sheet.png`),
    Assets.load<Texture>(`${base}assets/enemy_husk_sheet.png`),
    Assets.load<Texture>(`${base}assets/enemy_spitter_sheet.png`),
    Assets.load<Texture>(`${base}assets/enemy_skitter_sheet.png`),
    Assets.load<Texture>(`${base}assets/boss_warden_sheet.png`),
  ]);
  for (const t of [heroSheet, huskSheet, spitterSheet, skitterSheet, wardenSheet]) {
    t.source.scaleMode = 'nearest';
  }
  const assets: SceneAssets = {
    hero: { def: heroDef as SpriteDef, sheet: heroSheet },
    husk: { def: huskDef as SpriteDef, sheet: huskSheet },
    spitter: { def: spitterDef as SpriteDef, sheet: spitterSheet },
    skitter: { def: skitterDef as SpriteDef, sheet: skitterSheet },
    warden: { def: wardenDef as SpriteDef, sheet: wardenSheet },
  };

  const services = {
    audio: new AudioStub(testMode),
    rng: new Rng(testMode ? 12345 : Date.now() >>> 0),
  };

  const input = new Input();
  input.attach(window);

  const game = new Game(
    app,
    input,
    assets,
    services,
    questsData as QuestDefs,
    dialogueData as DialogueDefs,
    window.localStorage,
    touchEnabled,
  );
  if (testMode && !wantTitle) game.newGame();

  const loop = new FixedLoop(
    (dt) => game.update(dt),
    (alpha) => game.render(alpha, app.ticker.FPS),
  );
  app.ticker.add((ticker) => loop.tick(ticker.deltaMS));

  const hooks: GameDebugHooks = {
    booted: true,
    testMode,
    getMode: () => ({
      mode: game.mode,
      paused: game.paused,
      dialogueOpen: game.dialogueOpen,
      journalOpen: game.journal.visible,
    }),
    getPlayer: () => {
      const p = game.scene?.player;
      if (!p) {
        return {
          x: 0,
          y: 0,
          facing: 'SE' as Facing,
          depth: 0,
          anim: null,
          hp: 0,
          maxHp: 0,
          state: 'none',
          deaths: 0,
        };
      }
      return {
        x: p.x,
        y: p.y,
        facing: p.facing,
        depth: p.depth,
        anim: p.animInfo,
        hp: p.hp,
        maxHp: p.maxHp,
        state: p.state,
        deaths: p.deaths,
      };
    },
    getEnemies: () =>
      (game.scene?.enemies ?? []).map((e) => ({
        kind: e.kind,
        x: e.x,
        y: e.y,
        hp: e.hp,
        state: e.state,
      })),
    getStats: () => ({
      shards: game.state.shards,
      kills: game.scene?.kills ?? 0,
      pickupsOnGround: game.scene?.pickups.length ?? 0,
      charges: game.state.charges,
    }),
    getRestore: () => ({
      flag: game.scene?.map.ambient?.restoredFlag ?? null,
      drainT: game.scene?.drainT ?? 0,
    }),
    getBoss: () => {
      const b = game.scene?.boss;
      return b ? { hp: b.hp, maxHp: b.maxHp, phase: b.phase, state: b.state } : null;
    },
    getQuests: () => game.state.quests,
    getInventory: () => [...game.state.inventory],
    getFlag: (flag) => game.state.flags.get(flag),
    getFPS: () => app.ticker.FPS,
    getStepCount: () => loop.stepCount,
    getChunks: () => ({
      visible: game.scene?.ground.visibleChunkCount ?? 0,
      total: game.scene?.ground.chunkCount ?? 0,
    }),
    getMapId: () => game.scene?.map.id ?? '',
    isDebugOverlayOn: () => game.scene?.debug.isEnabled ?? false,
    isCellBlocked: (tx, ty) => {
      const grid = game.scene?.grid;
      if (!grid) return true;
      const row = grid.cells[ty];
      return row === undefined || row[tx] === undefined || row[tx] !== 0;
    },
    getTouch: () => ({
      enabled: game.touch !== null,
      buttons: game.touch?.debugInfo() ?? [],
    }),
    loadMap: (map) => game.loadMapData(map),
  };
  if (testMode) {
    hooks.teleport = (x, y) => game.scene?.player.teleport(x, y);
    hooks.setFlag = (flag, value = true) => game.state.flags.set(flag, value);
    hooks.hurtEnemy = (kind, damage) => {
      const enemy = game.scene?.enemies.find((e) => e.kind === kind && e.alive);
      if (!enemy) return false;
      const landed = enemy.applyHit({ damage, fromX: enemy.x - 1, fromY: enemy.y, knockback: 0 });
      if (landed && !enemy.alive) game.scene?.forceRegisterKill(enemy);
      return landed;
    };
    hooks.grantCharges = (n) => {
      game.state.charges += n;
    };
  }
  window.__game = hooks;
}

boot().catch((err) => {
  console.error('KEYSTONE failed to boot:', err);
  throw err;
});
