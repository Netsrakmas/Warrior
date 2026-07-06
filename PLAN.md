# KEYSTONE — Project Plan

*Working title. An isometric action-adventure in the spirit of Minish Cap, on an Alundra-style ground plane.*

**Platform:** Web, desktop keyboard first · **Stack:** Vite + PixiJS + TypeScript · **Deploy:** GitHub Pages
**Status:** Phase 3 complete (M3) · **Last updated:** 2026-07-06

> **How to use this document:** this file is the contract. Every phase ends with a **Gate** — hard acceptance criteria. Do not start the next phase until the gate is green. Anything not in §2 lives in §14 (Backlog). Adding scope means removing scope. Tick checklists in PRs so this stays a living document.

---

## 1. Vision

A short, dense, *finished* isometric Zelda-like: walk a hand-built world, talk to its people, fight with a snappy melee loop, solve light block-and-switch puzzles, and restore colour to a world being drained flat. Charm and polish over size.

**Design pillars** (when in doubt, decide by these):

1. **Readable** — flat single-height ground plane, strong silhouettes, 1px outlines, blob shadows. You always know what you can walk on and what will hit you.
2. **Snappy 30-second loop** — walk in, trade hits, dodge, kill, pick up the drop. If this isn't fun, nothing else matters (Phase 3 gate).
3. **Restoration payoff** — regions start colour-drained (desaturation tint); seating a Keystone snaps them to full palette. Story, art, and progression are the same system.
4. **Ship small, polish hard** — 30–60 minutes of adventure that looks and feels complete beats 5 hours of grey-box.

---

## 2. Definition of Done (v1.0)

| Area | v1.0 target |
|---|---|
| Play time | 30–60 min, completable by a stranger without hints |
| World | 2 overworld regions + 1 dungeon, built in our map editor |
| Combat | Sword + 1 secondary item (Resonant Charge), 3 enemy types + 1 three-phase boss |
| Quests | 6 main quests + 2 side quests, journal UI |
| Puzzle | Pressure plates + pushable blocks (+ charge-triggered plates) |
| Systems | Dialogue, inventory, keys/doors, map transitions, save/load (localStorage), title/pause/game-over |
| Art | Full sprite/tile/UI pass at locked spec, coherent palette, no grey-box visible |
| Audio | SFX pass + looping music per region |
| Tech | Solid 60 fps on mid-range desktop, deployed to GitHub Pages, Playwright smoke suite green |

**Explicit cut list (v1.0 will NOT have):** terrain height / jumping, swimming, weather, minimap, gamepad, touch controls, NL localization, NG+, extra regions, procedural anything. All of it → §14.

---

## 3. Decisions (ADR-lite)

| # | Decision | Choice | Why | Revisit when |
|---|---|---|---|---|
| 1 | Engine | Vite + PixiJS + TS (logic hand-rolled) | Pipeline is web-native, ships to Pages, Pixi gives batching/atlases/z-sorting/shaders | Terrain height or ports become goals → Godot |
| 2 | Projection | 2:1 dimetric, 128×64 tiles | Clean math, asset convention, best readability | Locked — never |
| 3 | Terrain height | Flat single-height ground | Iso depth + Z-collision is the classic tarpit (Landstalker) | v1.1: decorative raised platforms |
| 4 | Facings | Draw SE + NE, mirror for SW/NW | Halves the art bill | Only if hero design becomes asymmetric |
| 5 | Tools | Single-file HTML, no build step, in `/tools` | Proven personal pattern; zero friction; tools don't need Vite | Tools need filesystem access → unlikely |
| 6 | Art source | ChatGPT for concepts/style → ComfyUI (ControlNet + IP-Adapter + pixel LoRA) for production frames → Aseprite finish | ChatGPT can't hold cross-frame consistency; local pipeline can | Hand-drawn preference emerges |
| 7 | Language | TypeScript, strict | Multi-file codebase this size needs types | — |
| 8 | Save | localStorage, 3 slots | Real deploy (not an artifact), fine for scope | Never (v1) |

---

## 4. Repository layout

```
keystone/
├── PLAN.md
├── index.html                  # game shell
├── vite.config.ts              # base: '/<repo-name>/' for Pages
├── package.json
├── public/
│   └── assets/                 # spritesheets, tilesets, atlas json, audio
├── tools/
│   ├── map-editor.html         # single-file, no build
│   └── sprite-tool.html        # single-file, no build
├── src/
│   ├── main.ts
│   ├── engine/                 # iso.ts, camera.ts, input.ts, loop.ts,
│   │                           # depth.ts, collision.ts, anim.ts, loader.ts, audio.ts
│   ├── game/
│   │   ├── entities/           # player, enemies, npc, props, pickups
│   │   ├── systems/            # combat, ai, dialogue, quests, inventory, save, triggers
│   │   └── scenes/             # title, world, pause, gameover, ending
│   └── data/                   # maps/*.json, sprites/*.json, quests.json, dialogue.json
├── art/
│   ├── palette.md              # committed hex list (≤32 colours) — single source of truth
│   └── source/                 # aseprite files, generation outputs (gitignored if huge)
├── tests/                      # vitest unit + playwright e2e
└── .github/workflows/deploy.yml
```

---

## 5. Locked specification (THE SPEC)

Everything downstream — tools, art, engine — depends on this section. Change it only in Phase 0.

### 5.1 Projection & coordinates

- 2:1 dimetric. `TILE_W = 128`, `TILE_H = 64`.
- World positions are floats in **tile units** `(wx, wy)`. Screen transform:

```ts
sx = (wx - wy) * TILE_W / 2;
sy = (wx + wy) * TILE_H / 2;
// inverse (editor mouse picking):
wx = (sx / (TILE_W/2) + sy / (TILE_H/2)) / 2;
wy = (sy / (TILE_H/2) - sx / (TILE_W/2)) / 2;
```

- Depth key for draw order: `depth = wx + wy` (feet position). Draw ascending.
- Input is rotated: "up" key = screen-up = world `(-1,-1)` normalized. 8-way movement, mapped to the nearest of 4 facings for animation.

### 5.2 Art spec

| Item | Spec |
|---|---|
| Tile canvas | 128×64 diamond, transparent background |
| Hero & boss frame canvas | 160×160 (room for sword arcs) |
| Enemy & NPC frame canvas | 128×128 |
| Anchor | Feet contact point, bottom-center of the standing pose |
| Facings | SE and NE drawn; SW/NW are horizontal mirrors |
| Light | Single top-left light source, everywhere, always |
| Outline | 1px, darkest colour of the sprite's ramp |
| Shadows | None baked in — engine draws a soft blob ellipse under every entity |
| Palette | ≤32 colours, committed in `art/palette.md`; every asset quantized to it |

**Palette anchors** (seed the full palette from the style-bible generation, Appendix A-1): mossy green, sandstone, teal water, warm gold highlight, cool grey-violet shadow, off-white. The "drained" look is the engine's desaturation tint — do **not** draw grey variants of assets.

### 5.3 Animation matrix

`{state}_{facing}`, e.g. `walk_SE`. Frame counts are the budget, not a minimum to exceed.

| State | Hero | Std enemy | Boss | fps | Loop |
|---|---|---|---|---|---|
| idle | 4 | 4 | 4 | 6 | yes |
| walk/move | 8 | 6 | 6 | 12 | yes |
| attack | 5 | 3–5 | 6 (×2 attacks) | 15 | no |
| hurt | 2 | 2 | 2 | 12 | no |
| death | 6 | 3–4 | 8 | 10 | no |
| special | — | — | summon 6, transition 6 | 10 | no |

NPCs: idle 4 + talk 2, one drawn facing + mirror.

### 5.4 Naming conventions

- Assets: `hero_sheet.png`, `enemy_husk_sheet.png`, `tileset_overworld.png`, `props_overworld.png`
- Maps: `<region>_<nn>` → `meadow_01`, `ruins_02`, `spire_01`
- Flags: `snake_case`; quest flags `q_*`, world flags `f_*` (e.g. `f_meadow_restored`)
- Animations: `{state}_{SE|NE}` only; SW/NW derived at load

---

## 6. Data formats

Committed as JSON Schema in `src/data/schemas/` during Phase 0. Reference shapes:

### 6.1 Map (`src/data/maps/meadow_01.json`)

```jsonc
{
  "id": "meadow_01",
  "name": "Verdant Meadow",
  "tileset": "overworld",
  "width": 32, "height": 32,
  "layers": {
    "ground":  [[1,1,2, "..."]],        // tile ids, row-major
    "overlay": [[0,0,5, "..."]],        // decals: path edges, cracks (0 = none)
    "collision": [[0,1,0, "..."]]       // 0 walk, 1 solid, 2 water, 3 cracked(charge)
  },
  "objects": [
    { "type": "tree_large", "tx": 4, "ty": 7 }   // depth-sorted props
  ],
  "entities": [
    { "type": "enemy_husk", "tx": 10, "ty": 12,
      "props": { "patrol": [[10,12],[14,12]] } },
    { "type": "npc", "tx": 5, "ty": 5,
      "props": { "id": "elder_mira", "dialogue": "elder_intro" } },
    { "type": "chest", "tx": 8, "ty": 3,
      "props": { "item": "heart_container", "flag": "f_chest_meadow_1" } }
  ],
  "triggers": [
    { "shape": "rect", "tx": 31, "ty": 14, "w": 1, "h": 3,
      "action": "goto", "target": "ruins_01:2,14" },
    { "shape": "rect", "tx": 12, "ty": 20, "w": 2, "h": 2,
      "action": "flag", "set": "f_saw_shrine" }
  ],
  "ambient": { "music": "meadow_theme", "restoredFlag": "f_meadow_restored" }
}
```

### 6.2 Sprite definition (`src/data/sprites/hero.json`) — output of the sprite tool

```jsonc
{
  "id": "hero",
  "image": "hero_sheet.png",
  "frameW": 160, "frameH": 160,
  "anchor": { "x": 80, "y": 140 },          // feet, px within frame
  "footprint": { "r": 0.30 },               // collision circle, tile units
  "hurtbox": { "w": 28, "h": 44 },          // px, centered on anchor
  "facings": { "drawn": ["SE","NE"], "mirrored": { "SW":"SE", "NW":"NE" } },
  "animations": {
    "idle_SE":   { "row": 0, "frames": 4, "fps": 6,  "loop": true  },
    "walk_SE":   { "row": 1, "frames": 8, "fps": 12, "loop": true  },
    "attack_SE": { "row": 2, "frames": 5, "fps": 15, "loop": false,
                   "events": { "2": "hit_on", "4": "hit_off" } },
    "hurt_SE":   { "row": 3, "frames": 2, "fps": 12, "loop": false },
    "death_SE":  { "row": 4, "frames": 6, "fps": 10, "loop": false }
    // ... NE rows follow
  }
}
```

Frame **events** drive gameplay (hitbox on/off, footsteps, projectile spawn) — combat timing lives in data, not code.

### 6.3 Dialogue, quests, save

```jsonc
// dialogue.json
{ "elder_intro": {
    "lines": [ { "who": "Elder Mira", "text": "The colour ran out of the meadow, child..." } ],
    "setFlag": "f_met_elder",
    "startQuest": "q1_wake_the_meadow" } }

// quests.json
{ "q1_wake_the_meadow": {
    "title": "Wake the Meadow",
    "steps": [
      { "id": "get_sword",  "desc": "Take the sword from the shrine stone." },
      { "id": "kill_husks", "desc": "Clear the husks from the road.", "count": 3 }
    ],
    "reward": { "item": "none", "flag": "q1_done" } } }

// save (localStorage, 3 slots)
{ "v": 1, "map": "meadow_01", "pos": [5.5, 6.0], "hp": 6, "maxHp": 6,
  "inventory": ["sword"], "charges": 0, "flags": { }, "quests": { } }
```

---

## 7. Engine core notes

- **Loop:** fixed 60 Hz simulation, render on rAF. Deterministic sim enables Playwright tests.
- **Collision:** circle footprint (per sprite def) vs collision grid. Axis-separated resolve (move X, resolve, move Y, resolve) → natural wall-slide. Entity–entity: circle push. Attack hitbox: circle offset in facing direction, active only between `hit_on`/`hit_off` frame events.
- **Depth sorting:** object layer sorted by `wx + wy` each frame (Pixi `sortableChildren` or manual). **Rule for large props:** every prop belongs to one anchor tile; if a prop spans multiple tiles and sorts wrong, slice its image into per-tile sprites rather than inventing sort hacks. Ground layer never sorts — pre-render it to RenderTextures in 8×8-tile chunks, cull chunks outside the view.
- **Camera:** lerp follow with deadzone rect, clamped to map bounds, final position rounded to device pixels (kills sprite shimmer).
- **Restoration tint:** per-region ColorMatrix desaturation + cool tint while `restoredFlag` is false; seating a Keystone lerps it out over ~2s. One filter, the game's signature moment.
- **Debug overlay (F3):** fps, tile coords, collision grid, footprints, hitboxes, depth keys.

---

## 8. Tools (Phase 2)

Both are single-file HTML pages, no build step, talking the schemas in §6.

### 8.1 Map editor — MVP

- [x] Load tileset + props images; palette panel with tile/prop picker *(grey-box colour palette until Phase 5 art exists)*
- [x] Iso grid render with pan (drag) / zoom (wheel); mouse → tile picking (§5.1 inverse)
- [x] Layers: ground / overlay / collision / objects / entities / triggers; visibility toggles
- [x] Paint, erase, rectangle fill, eyedropper; undo/redo (Ctrl+Z)
- [x] Entity & trigger placement with a small props form (JSON textarea is fine for v1)
- [x] Import/export map JSON (file download + paste-in)
- [x] Map settings: size, tileset, music, restoredFlag

**Non-goals:** autotiling, minimap, multi-select, in-tool playtest. Backlog.

### 8.2 Sprite tool (assembler) — MVP

- [x] Load sheet PNG; set frame W/H; auto grid slice with row/column preview
- [x] Define animations: name, row, frame count, fps, loop; per-frame event tags
- [x] Click-to-set anchor; footprint radius + hurtbox inputs; visualized on the frame
- [x] Live preview: play any animation, toggle mirrored facing, onion-skin previous frame
- [x] Import/export sprite JSON (§6.2)

**Non-goals:** pixel editing (that's Aseprite's job), palette ops, packing. Backlog.

---

## 9. Roadmap

Effort shape, honestly: **P0–P4 (engine + tools + systems) is the predictable half. P5–P7 (art + content + polish) is the long tail — expect it to take at least as long as all the code combined.** The §10 budget table is why scope is capped.

### Phase 0 — Lock & scaffold *(Milestone M0)*

- [x] Repo init, Vite + PixiJS + TS strict, ESLint/Prettier
- [x] Commit this PLAN.md; sign off §5 spec (tile size, facings, matrix, palette anchors)
- [x] Commit JSON Schemas for map / sprite / dialogue / quest / save
- [x] GitHub Actions: build + deploy to Pages (empty shell is fine)
- [x] Vitest + Playwright harness runs in CI ("game boots" test)

**Gate:** CI green, empty scene deployed to Pages, spec section frozen.

### Phase 1 — Grey-box iso engine *(M1: the hard part, zero art)*

- [x] `iso.ts` transforms + unit tests (round-trip screen↔world)
- [x] Render 32×32 diamond grid from a hand-written map JSON
- [x] Depth-sorted test pillars; player square walks in front of / behind them correctly
- [x] 8-dir input → world-axis movement; facing selection
- [x] Circle-vs-grid collision with wall-slide
- [x] Camera follow + clamp; fixed-timestep loop; F3 debug overlay
- [x] Ground chunk pre-render + culling

**Gate:** 60 fps on a 32×32 map; no sort or collision errors while circling pillars; screen↔world tests pass.

### Phase 2 — Tools *(M2)*

- [x] Map editor MVP (§8.1)
- [x] Sprite tool MVP (§8.2)
- [x] Engine loads editor-made maps and tool-made sprite defs

**Gate:** full round-trip — a map painted in the editor plays in the engine; a placeholder sheet assembled in the sprite tool animates in-game with correct anchor and footprint.

### Phase 3 — Combat core *(M3: the fun gate)*

- [x] Animation state machine driven by sprite JSON, incl. frame events
- [x] Sword: `hit_on/off` hitbox, damage, knockback impulse, hitstop (~60 ms), i-frame flicker
- [x] Player: HP, i-frames, hurt/death states, hearts UI, respawn
- [x] Enemy `husk`: patrol → aggro → chase → windup (telegraph!) → attack → cooldown
- [x] Pickups: heart, shard currency; drop tables (seeded RNG, deterministic in test mode)
- [x] Feel pass: screen shake, hit spark placeholder, SFX stubs (Web Audio synth)

**Gate:** the 30-second loop is genuinely fun in grey-box, judged honestly. Measurables: input→swing < 100 ms; enemy telegraphs readable; zero sort glitches mid-combat. **If this gate fails, stop and fix — do not proceed.**

### Phase 4 — Adventure systems *(M4: systems-complete)*

- [ ] Dialogue box (typewriter, name tag, portrait slot), interaction prompt
- [ ] World-state flag store; triggers system (§6.1)
- [ ] Quest engine + journal UI
- [ ] Inventory + item gating; keys/doors; chests
- [ ] Pressure plate + pushable block (block depth-sorts correctly while pushed)
- [ ] Map transitions with fade + spawn points
- [ ] Save/load, 3 slots; title / pause / game-over / settings (volume)

**Gate:** on two grey-box maps, a fetch quest is completable start→finish; save mid-quest, reload, finish; transitions never strand the player.

### Phase 5 — Starter art pass *(M5: first "it's a real game" moment)*

- [ ] Run Appendix A prompts; curate a style bible + extract committed palette
- [ ] Overworld tileset + 8–10 props: generate → Aseprite cleanup → quantize
- [ ] Hero full set via ComfyUI pipeline (§10); assemble in sprite tool
- [ ] Husk full set; item/pickup sprites; blob shadows on; outline check
- [ ] Texture atlas packing; replace every grey-box asset in the slice
- [ ] Restoration desaturation tint wired to a debug flag

**Gate:** the Phase-4 slice fully skinned, coherent palette, nothing grey-box on screen; still 60 fps.

### Phase 6 — Content *(M6: content-complete)*

- [ ] World layout doc (one page: regions, gates, quest flow diagram)
- [ ] Build Verdant Meadow, Sunken Ruins, Grey Spire in the editor
- [ ] Remaining enemies (spitter, skitter) + **Warden** boss, 3 phases (§11.4)
- [ ] Resonant Charge item + cracked-stone gating + charge-plates
- [ ] All NPCs placed; dialogue written; Q1–Q6 + 2 side quests wired
- [ ] Intro scene, two ending scenes (scripted dialogue + tint changes — no cutscene engine)
- [ ] Balance pass: HP/damage curve in a table, tuned by playthrough

**Gate:** full 30–60 min playthrough, completable blind by someone who isn't you, no blockers, difficulty curve sane.

### Phase 7 — Polish & ship *(M7: v1.0)*

- [ ] Lighting: ambient tint per region + additive glow sprites (torches, Keystones)
- [ ] Particles: hit sparks, dust, pickup shimmer, charge burst; scene fades
- [ ] Audio: full SFX pass; music loops per region (compose/synth vs. licensed CC — decide here)
- [ ] UI juice: heart wobble, journal transitions, button states
- [ ] Perf pass: atlas audit, culling audit, GC churn check
- [ ] Playwright regression suite: boot, new game, move, combat, save/load, transition, boss reachable
- [ ] README with screenshots + GIF; Pages release; version tag `v1.0.0`

**Gate:** a stranger would call it a finished game.

---

## 10. Asset pipeline & budget

### 10.1 Pipeline

1. **Concept (ChatGPT / GPT-image):** style bible, palette, tile/prop bases, character turnarounds. Good at *look*, bad at cross-frame consistency — treat all output as raw material.
2. **Production frames (ComfyUI on the 3070):** SDXL + pixel-art LoRA; **ControlNet OpenPose** for per-frame pose consistency; **IP-Adapter** for character identity; batch per animation row.
3. **Finish (Aseprite):** downscale nearest-neighbour to spec size, quantize to `art/palette.md`, hand-clean silhouettes and key frames, add 1px outline.
4. **Assemble (sprite tool):** slice, anchor, footprint, events → JSON.
5. **Pack:** texture atlas per sheet group; hashed filenames via Vite.

Expect manual cleanup on *every* production frame. The pipeline reduces the drawing, not the finishing.

### 10.2 Budget (why scope is capped)

| Set | Frames/unit | Count |
|---|---|---|
| Hero (160px, 2 facings) | 25 ×2 | 50 |
| Husk / Spitter / Skitter | ~20 ×2 each | ~118 |
| Warden boss (160px) | 44 ×2 | 88 |
| NPCs ×5 (1 facing + mirror) | 6 | 30 |
| **Character frames** | | **≈286** |
| Tiles (overworld 24, dungeon 20) | | 44 |
| Props | | ~20 |
| Items & pickups (some animated) | | ~16 |
| VFX (slash, spark, dust, burst, shimmer) | | ~24 |
| UI (hearts, frames, journal, buttons, 5 portraits) | | ~30 |
| **Total drawn assets** | | **≈420** |

Every added enemy type ≈ +40 frames. Every added region ≈ +15–20 tiles/props. This table is the scope law.

---

## 11. Story & content design

### 11.1 Premise — *The Flattening*

The world's depth and colour are held up by **Keystones** buried beneath each region. The **Grey Tide** is draining that dimension away — flattening the land, hollowing its creatures into husks. You are a young cartographer's apprentice who still *sees* the world in full relief, and the only one who can re-seat the Keystones. The **Warden**, who started the Tide, believes a flat, frozen world is a *safe* one — because the Keystones were also a seal, and the Warden isn't entirely wrong about what they seal.

Tone: cozy-adventurous, melancholy at the edges, family-friendly. Delivered entirely through NPC dialogue, quest beats, and two short scripted scenes.

### 11.2 Cast

Elder **Mira** (guide, quest-giver) · Tinker **Bram** (crafts the Resonant Charges, side quest) · **Pip** (kid NPC, colour/wonder barometer) · a **merchant** (shards → hearts/upgrades) · a **hooded stranger** (foreshadows the seal; recontextualized before the Spire).

### 11.3 Regions & main quest chain

| # | Quest | Region | Beat |
|---|---|---|---|
| Q1 | Wake the Meadow | Verdant Meadow | Tutorial: sword, movement, kill 3 husks |
| Q2 | The First Keystone | Meadow shrine | Plate+block puzzle, guarded Keystone → **meadow restored** (first tint payoff) |
| Q3 | Cracked Passage | Meadow → Ruins | Help Bram → earn Resonant Charges → blast the cracked wall |
| Q4 | The Sunken Ruins | Sunken Ruins | Region 2; its Keystone is *stolen* — trail leads to the Spire |
| Q5 | The Grey Spire | Dungeon | Keys, blocks, charge-plates, husk gauntlets → **Warden**, 3 phases |
| Q6 | Relief | Spire summit | Choice: seat the final Keystone (world restored; the sealed thing stirs) or heed the Warden (bittersweet grey dawn). Two short endings |

Side quests: **S1** fetch (Pip's lost kite → teaches map layout), **S2** combat arena at the merchant (waves → heart container).

### 11.4 Warden boss sketch

Phase 1: slow sword patterns, punishable windups. Phase 2: summons husks + grey shockwaves (charge stuns him — item reuse). Phase 3: the arena itself drains grey, hazards flatten in and out; his death re-floods it with colour. Escalation *is* the theme.

---

## 12. Testing & deployment

- **Unit (vitest):** iso transforms, collision resolve, save round-trip, quest state machine.
- **E2E (Playwright):** boot → new game → scripted input walks to a marker → damages a husk → saves → reloads → transitions maps. Expose `window.__game` debug hooks + `?test=1` deterministic mode (fixed RNG seed, no audio).
- **CI:** every push runs unit + e2e; `main` deploys to Pages. `vite.config.ts` `base` must match repo name.
- **Perf budget:** 60 fps on mid-range desktop; draw calls sanity-checked after each art phase.

---

## 13. Risks

| Risk | L | I | Mitigation |
|---|---|---|---|
| Art volume balloons | High | High | §10.2 budget is law; mirrored facings; 3 enemies + boss cap; grey-box until Phase 5 |
| AI art inconsistency across frames | High | Med | ControlNet + IP-Adapter pipeline; hand-finish in Aseprite; accept "starter art" bar for v1, iterate after ship |
| Depth-sort artifacts (big props) | Med | Med | Anchor-tile rule + slice-the-sprite rule (§7); pillar test scene from Phase 1 onward |
| Scope creep (height, regions, systems) | High | High | §2 cut list is the contract; everything new → §14 |
| Tool rabbit hole | Med | Med | MVP lists in §8 with explicit non-goals; tools serve the game, not vice versa |
| Combat feels mushy | Med | High | Phase 3 hard gate; hitstop/telegraphs/knockback tuned before any content |
| Music sourcing stalls polish | Low | Med | Decision deferred but scheduled (Phase 7 checklist); CC-licensed fallback acceptable |

---

## 14. Backlog (v1.1+)

Raised platforms (visual first, then collision) · gamepad · touch controls (virtual stick + 2 buttons) · NL localization (groep-4-friendly for the home audience) · minimap · swimming/water traversal · weather · more enemy variants via palette/behaviour swaps · NG+ · autotiling in the map editor · in-editor playtest button · itch.io mirror.

---

## Appendix A — Generation prompts (starter art)

Prepend the **style suffix** to every prompt:

> STYLE: 2:1 isometric (dimetric) projection, clean cel shading, single top-left light source, warm storybook palette (mossy greens, sandstone, teal water, warm gold highlights, cool grey-violet shadows), transparent background, soft contact shadow only, no cast shadows, readable silhouettes, no outlines thicker than 1px at final scale. Reference material for a pixel-art pipeline — clean and simple over detailed.

**A-1 · Style bible / key art** *(also the palette source — extract ≤32 colours from this into `art/palette.md`)*
```
Key art for a 2D isometric action-adventure. A small cartographer hero on a
grassy iso ground plane with a stone path, one large tree, and a distant grey,
colour-drained ruin on the horizon. Half the scene vivid and warm, half drained
to grey — the contrast is the theme. Cozy but adventurous mood. Mood/palette
reference, not a game screenshot. + STYLE
```

**A-2 · Overworld ground tileset**
```
Isometric ground tileset on a single sheet, each tile in its own cell:
grass (3 variants), dirt path (straight, corner, end), stone floor,
grass-to-path edges, water tile, water edge. 128x64 px diamond tiles designed
to align seamlessly. No characters. + STYLE
```

**A-3 · Dungeon tileset (Grey Spire)**
```
Isometric interior tileset on a single sheet: stone floor (2 variants), stone
wall segments with corners, doorway, cracked floor tile, pressure plate (up and
down states), pushable stone block. 128x64 diamond alignment. Cool grey-violet
stone with warm torch accents. + STYLE
```

**A-4 · Hero turnaround (tracing/identity reference)**
```
Character reference sheet: a young cartographer's apprentice — satchel, rolled
map on the back, simple tunic, determined but friendly. Isometric 3/4 view,
neutral standing pose, four facings (down-right, up-right, down-left, up-left)
evenly spaced. Reference for tracing and for IP-Adapter identity, not final
sprites. + STYLE
```

**A-5 · Hero pose set (ComfyUI pose reference)**
```
Same hero, down-right facing only, eight distinct action poses in a row:
standing, mid-stride left leg, mid-stride right leg, sword raised windup,
sword mid-swing, sword follow-through, flinching hit, collapsed. Even spacing,
consistent proportions and scale. + STYLE
```

**A-6 · Enemies (three designs, one sheet)**
```
Enemy lineup, isometric 3/4 view facing down-right, one standing pose each,
consistent scale vs a 128x64 tile: (1) Husk — a hollow, slow humanoid shell,
slightly desaturated; (2) Spitter — squat plant-like creature with an open
maw; (3) Skitter — small fast multi-legged critter. Menacing but
family-friendly, no gore. + STYLE
```

**A-7 · The Warden (boss)**
```
Boss design: The Warden — a tall, austere figure in layered grey robes with one
warm-gold keystone shard embedded in the chest, carrying a long flat blade.
Dignified and sorrowful rather than monstrous. Isometric 3/4 view facing
down-right, standing pose, scale roughly 2 tiles tall. + STYLE
```

**A-8 · Props sheet**
```
Isometric prop sheet, each object in its own cell, consistent scale vs a
128x64 tile: large tree, bush, rock (2 sizes), wooden chest (closed and open),
signpost, barrel, fence segment, shrine stone, keystone pedestal (empty and
seated, the seated one glowing warm gold). + STYLE
```

**A-9 · UI kit & portraits**
```
Game UI kit on a transparent sheet: heart icons (full, half, empty), shard
currency icon, dialogue box frame with name-tag plate, journal panel frame,
button states (normal, hover, pressed), small key icon, charge icon. Plus five
small square dialogue portraits (bust, down-right 3/4 view): the hero, an
elderly wise woman, a burly tinker, a small child, a hooded stranger. + STYLE
```

---

## Appendix B — Reference games

**Alundra** — the target for iso combat feel and dungeon logic. **Landstalker** — the cautionary tale: its height/jumping ambiguity is exactly what the flat-ground decision avoids. **Minish Cap** — the bar for charm density: small world, every screen has a reason to exist.
