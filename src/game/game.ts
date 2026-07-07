import { Container, type Application } from 'pixi.js';
import type { Input } from '../engine/input';
import type { AudioStub } from '../engine/audio';
import type { Rng } from '../engine/rng';
import { GameState } from './state';
import { QuestLog, type QuestDefs } from './systems/quests';
import { applyEffects, type DialogueDef, type DialogueDefs } from './systems/dialogue';
import { SaveManager, SAVE_SLOTS } from './systems/save';
import { WorldScene, type SceneAssets, type SceneServices } from './scenes/world';
import { MAPS, START_MAP } from '../data/maps/index';
import type { MapData } from './types';
import { Hud } from './ui/hud';
import { Journal } from './ui/journal';
import { DialogueBox } from './ui/dialoguebox';
import { Screen, Fader } from './ui/screens';
import type { MenuItem } from './ui/menu';

export type GameMode = 'title' | 'playing' | 'gameover';

const VOLUME_KEY = 'keystone_volume';

/**
 * Top-level orchestrator: owns persistent state, the active scene, and all
 * UI overlays (title / pause / game-over / dialogue / journal / HUD).
 */
export class Game {
  mode: GameMode = 'title';
  paused = false;
  state = new GameState();
  quests: QuestLog;
  scene: WorldScene | null = null;

  readonly hud = new Hud();
  readonly journal = new Journal();
  readonly dialogue = new DialogueBox();
  readonly titleScreen = new Screen('KEYSTONE', 1);
  readonly pauseScreen = new Screen('PAUSED');
  readonly gameOverScreen = new Screen('FLATTENED');
  readonly fader = new Fader();
  private readonly uiRoot = new Container();
  private readonly saves: SaveManager;
  private activeDialogue: DialogueDef | null = null;

  constructor(
    private readonly app: Application,
    private readonly input: Input,
    private readonly assets: SceneAssets,
    private readonly services: SceneServices & { audio: AudioStub; rng: Rng },
    private readonly questDefs: QuestDefs,
    private readonly dialogueDefs: DialogueDefs,
    storage: Storage,
  ) {
    this.quests = new QuestLog(questDefs, this.state);
    this.saves = new SaveManager(storage);
    const vol = Number(storage.getItem(VOLUME_KEY));
    if (!Number.isNaN(vol) && storage.getItem(VOLUME_KEY) !== null) {
      this.services.audio.volume = Math.max(0, Math.min(1, vol));
    }
    this.storage = storage;

    this.uiRoot.addChild(
      this.hud.container,
      this.journal.container,
      this.dialogue.container,
      this.pauseScreen.container,
      this.gameOverScreen.container,
      this.titleScreen.container,
      this.fader.container,
    );
    app.stage.addChild(this.uiRoot);
    this.openTitle();
  }

  private readonly storage: Storage;

  // ---------- scene management ----------

  private startScene(map: MapData, spawnPos?: [number, number]): void {
    if (this.scene) {
      this.app.stage.removeChild(this.scene.container, this.scene.uiLayer);
      this.scene.container.destroy({ children: true });
      this.scene.uiLayer.destroy({ children: true });
    }
    const scene = new WorldScene(
      this.app.renderer,
      map,
      this.input,
      this.app.screen,
      this.assets,
      this.services,
      {
        state: this.state,
        quests: this.quests,
        dialogues: this.dialogueDefs,
        openDialogue: (def) => this.openDialogue(def),
        toast: (msg) => this.hud.toast(msg),
        requestTransition: (target) => this.transition(target),
        onPlayerDeath: () => this.gameOver(),
      },
      spawnPos,
    );
    this.scene = scene;
    this.state.map = map.id;
    // UI stays on top of the world.
    this.app.stage.addChildAt(scene.container, 0);
    this.app.stage.addChildAt(scene.uiLayer, 1);
  }

  /** Load an arbitrary map object (editor round-trip test hook). */
  loadMapData(map: MapData): void {
    this.mode = 'playing';
    this.paused = false;
    this.titleScreen.hide();
    this.gameOverScreen.hide();
    this.startScene(map);
  }

  transition(target: string): void {
    const [mapId, coords] = target.split(':');
    const map = MAPS[mapId ?? ''];
    if (!map) {
      console.error(`transition target unknown: ${target}`);
      return;
    }
    let spawn: [number, number] | undefined;
    if (coords) {
      const [x, y] = coords.split(',').map(Number);
      if (x !== undefined && y !== undefined && !Number.isNaN(x) && !Number.isNaN(y)) {
        spawn = [x + 0.5, y + 0.5];
      }
    }
    this.fader.fadeOut(() => {
      this.startScene(map, spawn);
      this.fader.fadeIn();
    });
  }

  // ---------- flow ----------

  newGame(): void {
    this.state = new GameState();
    this.quests = new QuestLog(this.questDefs, this.state);
    this.mode = 'playing';
    this.paused = false;
    this.titleScreen.hide();
    this.startScene(MAPS[START_MAP]!);
    this.fader.fadeIn();
  }

  continueSlot(slot: number): void {
    const loaded = this.saves.load(slot);
    if (!loaded) return;
    this.state = loaded;
    this.quests = new QuestLog(this.questDefs, this.state);
    this.mode = 'playing';
    this.paused = false;
    this.titleScreen.hide();
    const map = MAPS[loaded.map] ?? MAPS[START_MAP]!;
    this.startScene(map, loaded.pos);
    this.fader.fadeIn();
  }

  saveSlot(slot: number): void {
    if (!this.scene) return;
    this.state.pos = [this.scene.player.x, this.scene.player.y];
    this.state.hp = this.scene.player.hp;
    this.state.maxHp = this.scene.player.maxHp;
    this.saves.save(slot, this.state);
    this.hud.toast(`Saved to slot ${slot + 1}.`);
  }

  private gameOver(): void {
    this.mode = 'gameover';
    this.gameOverScreen.setSubheading('The grey took you. But colour remembers.');
    this.gameOverScreen.show([
      {
        label: 'Continue',
        action: () => {
          this.gameOverScreen.hide();
          this.mode = 'playing';
          this.scene?.player.respawn();
          if (this.scene) this.state.hp = this.scene.player.hp;
        },
      },
      { label: 'Quit to Title', action: () => this.openTitle() },
    ]);
  }

  openTitle(): void {
    this.mode = 'title';
    this.paused = false;
    this.pauseScreen.hide();
    this.gameOverScreen.hide();
    this.titleScreen.setSubheading('a world drained flat — grey-box build');
    const slots = this.saves.list();
    const items: MenuItem[] = [
      { label: 'New Game', action: () => this.newGame() },
      ...slots.map((s, i) => ({
        label: s ? `Continue Slot ${i + 1} — ${s.map}` : `Continue Slot ${i + 1} — empty`,
        disabled: !s,
        action: () => this.continueSlot(i),
      })),
      this.volumeItem(),
    ];
    this.titleScreen.show(items);
  }

  private openPause(): void {
    this.paused = true;
    const items: MenuItem[] = [
      { label: 'Resume', action: () => this.closePause() },
      ...Array.from({ length: SAVE_SLOTS }, (_, i) => ({
        label: `Save to Slot ${i + 1}`,
        action: () => {
          this.saveSlot(i);
          this.closePause();
        },
      })),
      this.volumeItem(),
      { label: 'Quit to Title', action: () => this.openTitle() },
    ];
    this.pauseScreen.show(items);
  }

  private closePause(): void {
    this.paused = false;
    this.pauseScreen.hide();
  }

  private volumeItem(): MenuItem {
    const label = (): string => `Volume: ${Math.round(this.services.audio.volume * 100)}%`;
    return {
      label: label(),
      adjust: (delta) => {
        const v = Math.max(0, Math.min(1, this.services.audio.volume + delta * 0.1));
        this.services.audio.volume = Math.round(v * 10) / 10;
        this.storage.setItem(VOLUME_KEY, String(this.services.audio.volume));
        return label();
      },
    };
  }

  openDialogue(def: DialogueDef): void {
    this.activeDialogue = def;
    this.dialogue.open(def, () => {
      applyEffects(def, this.state, this.quests);
      this.activeDialogue = null;
      this.scene?.player.syncFromState(this.state);
    });
  }

  get dialogueOpen(): boolean {
    return this.activeDialogue !== null;
  }

  // ---------- loop ----------

  update(dt: number): void {
    const view = this.app.screen;

    switch (this.mode) {
      case 'title':
        this.titleScreen.update(this.input, view.width, view.height);
        break;
      case 'gameover':
        this.gameOverScreen.update(this.input, view.width, view.height);
        break;
      case 'playing': {
        if (this.paused) {
          this.pauseScreen.update(this.input, view.width, view.height);
          if (this.input.justPressed('Escape')) this.closePause();
          break;
        }
        if (this.dialogue.isOpen) {
          this.dialogue.update(dt, view.width, view.height);
          if (['KeyE', 'Enter', 'Space'].some((k) => this.input.justPressed(k))) {
            this.dialogue.advance();
          }
          break;
        }
        if (this.input.justPressed('Escape')) {
          this.openPause();
          break;
        }
        if (this.input.justPressed('KeyQ') || this.input.justPressed('Tab')) {
          this.journal.toggle();
        }
        if (!this.fader.busy) this.scene?.update(dt);
        break;
      }
    }

    this.fader.update(dt, view.width, view.height);
    this.journal.update(this.quests, view.width);
    if (this.scene && this.mode !== 'title') {
      this.hud.update(
        this.scene.player.hp,
        this.scene.player.maxHp,
        this.state.shards,
        this.state.countItem('key'),
        this.state.charges,
        dt,
        view.width,
      );
    }
    this.hud.container.visible = this.mode === 'playing';
  }

  render(alpha: number, fps: number): void {
    if (this.mode !== 'title') this.scene?.render(alpha, fps);
  }
}
