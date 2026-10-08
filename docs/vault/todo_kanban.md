---

kanban-plugin: board

---

## todo

- [ ] Rename `PlayerEntity` to `PlayerOverlay` for role clarity
    - Scope: Clarify architecture boundaries by renaming Pixi's screen-space overlay class to reflect that it is purely a 2D UI overlay (names, meters, chat bubbles, edge pointers), not the character simulation entity.
    - Implementation:
        - Rename `src/app/screens/game/PlayerEntity.ts` to `src/app/screens/game/PlayerOverlay.ts`.
        - Rename class `PlayerEntity` to `PlayerOverlay`.
        - In `src/app/screens/game/GameScreen.ts`:
            - Update import to `PlayerOverlay`.
            - Rename collection `this.entities` to `this.playerOverlays`.
            - Rename `placeLabel` to `updatePlayerOverlay`.
            - Rename helper `spawnEntity` to `spawnPlayerOverlay`.
        - Update doc references in `README.md` and `.agents/skills/cyclo-manager/SKILL.md`.
        - Verify with `bun test` and typecheck via `tsc`.

- [ ] Decouple DOM canvas stacking from `WorldScene.ts` into declarative CSS
    - Scope: Remove leaky DOM mutation from `WorldScene.ts` where it queries `#pixi-container canvas` and imperatively sets inline styles (`position`, `zIndex`) and cleans them up on destroy.
    - Implementation:
        - In `index.html`: Add dedicated `#three-container` element inside `#app` before `#pixi-container`.
        - In `public/style.css`: Set declarative stacking rules:
            - Both `#three-container` and `#pixi-container` positioned absolute / full viewport.
            - `#three-container` at `z-index: 0`.
            - `#pixi-container` at `z-index: 1` with transparent background so 3D shows through.
        - In `src/app/screens/game/WorldScene.ts`:
            - Mount `renderer.domElement` into `#three-container` (or accept mount container in constructor) instead of `document.body.appendChild`.
            - Remove `document.querySelector("#pixi-container canvas")` style modifications from constructor.
            - In `destroy()`: Simply remove canvas from container and dispose renderer; remove the Pixi canvas style-reset hack.
        - Verify with `bun test` and manual browser check.

## progress

## waiting

## done

- [ ] Viewport dimension consistency in `GameScreen.ts` & edge indicators
    - Scope: Fix desynchronization between Pixi's logical resolution (`app.renderer.width`/`height`) and window dimensions (`window.innerWidth`/`innerHeight`) in `GameScreen.ts`.
    - Problem: When the window is smaller than `minWidth: 1024` / `minHeight: 600`, Pixi scales CSS canvas size while keeping logical buffer >= 1024x600. `WorldScene.project()` centers at `(viewWidth / 2, viewHeight / 2)`, but `GameScreen.placeLabel()` was reading `window.innerWidth / 2`, causing off-screen clamping and angle calculations to be offset toward top-left.
    - Implementation:
        - `src/app/screens/game/GameScreen.ts`: Add `viewportWidth = 0` and `viewportHeight = 0` state variables.
        - `resize(width, height)`: Store `this.viewportWidth = width` and `this.viewportHeight = height` when called by `CreationNavigationPlugin`.
        - `prepare()`: Ensure initial fallback dimensions align before first resize fires.
        - `placeLabel()`: Use `this.viewportWidth` and `this.viewportHeight` instead of `window.innerWidth` and `window.innerHeight`.
        - Verify with `bun test` and typecheck via `tsc`.
    - Erledigt 2026-10-08: In `GameScreen.ts` `viewportWidth` und `viewportHeight` hinzugefügt, in `prepare()` initialisiert, in `resize()` synchronisiert und in `reset()` aufgeräumt. `placeLabel()` klemmt Indikatoren nun konsistent gegen die logische Viewport-Größe ab. `bun test` (52/52 Tests grün) und `tsc` fehlerfrei. Manuelle Checkliste in `docs/local/MANUAL_TESTS.md` hinterlegt.

- [ ] Movement: replace 8-way heading with speed + steer (2 controls)
    - Keyboard: Up = hold-to-gas (accelerate per PLAYER_ACCELERATION), release = coast to stop per PLAYER_FRICTION; Down = brake harder and reverse slowly; Left/Right = rotate only, no strafing/desired-heading
    - Steering scales with speed only: no turning at speed 0, keep speed-dependent turn-rate curve (PLAYER_MAX_TURN_RATE pivoting slow → PLAYER_MIN_TURN_RATE wide arc fast); turning keeps TURN_SPEED_PENALTY_PER_RADIAN
    - Mobile: 2 inputs replacing drag joystick — right thumb hold-to-gas pedal button + left thumb L/R steer buttons (◀ ▶); keep existing jump button as-is
    - Touches: shared/movement.ts (drop desiredHeadingFromInput octant math), shared/types.ts InputState + protocol (up/down/left/right semantics break — throttle/steer fields), src/net/InputController.ts (arrow mapping), src/net/JoystickInputController.ts (replace/remove), GameScreen.ts mergeInputs + touch layout constants (JOYSTICK_MARGIN)
    - Edge cases: standing-start turn does nothing; Down-from-stop enters slow reverse; reverse + steering direction needs a defined sign; stop conflating Space/jump with movement inputs
    - Erledigt 2026-09-17: 8-way heading replaced by signed speed + steer. shared/movement.ts rewritten (gas/brake/coast longitudinal, steer rotates only at speed != 0, reverse inverts car-like, turn penalty is sign-aware, jump ignored), shared/types.ts InputState up/down -> gas/brake (left/right now steer-only), shared/constants.ts + PLAYER_BRAKE_DECELERATION 800 / PLAYER_MAX_REVERSE_SPEED 80, shared/protocol.ts sanitize new fields (legacy up/down dropped), src/net/InputController.ts remapped, JoystickInputController.ts deleted and replaced by TouchDriveController.ts (GasPedalController bottom-right + SteerButtonsController ◀ ▶ bottom-left, jump button unchanged, no touch brake per card), GameScreen.ts mergeInputs + layout constants updated, server/src/world.ts IDLE_INPUT updated. Tests: new shared/movement.test.ts (9 tests: accel/coast/clamps, brake>coast, brake-wins, standstill-steer, pivot-vs-arc, reverse-invert, turn-penalty, jump-ignored), updated simulation/protocol tests; bun test 19/19 green, tsc/eslint/vite build clean. Deviation notes: brake wins over simultaneous gas; reverse steering defined as inverted (car-like); touch has gas+steer only. Manuelle Browser-Verifikation ausstehend, siehe docs/local/MANUAL_TESTS.md.

- [ ] Map generator: small white arena with blocking blocks
    - Scope: fixed small arena (smaller than current WORLD_WIDTH 2468 x WORLD_HEIGHT 1848 in shared/constants.ts), white background with a handful of rectangular blocks
    - Generation: once per server start, random layout broadcast to all clients (not per-connect, not fixed seed)
    - Collision: blocks authoritatively block movement in shared/simulation.ts resolvePosition (so server + client prediction via stepPlayer stay in sync); slide along block edges, don't hard-stop
    - Rendering: white world background replaces black canvas, blocks drawn in GameScreen camera layer; spawn point must be checked clear of blocks (current spawn is world center)
    - Edge cases: player radius (PLAYER_RADIUS 14) vs block overlap, corner sliding, spawn-inside-block fallback
    - Erledigt 2026-09-17: Arena 1200x900 (WORLD_WIDTH/HEIGHT in shared/constants.ts) mit 7 random Blöcken. Neu shared/arena.ts (generateArenaLayout mit injizierbarer RNG, findSpawnPoint mit Grid-Fallback, circleHitsBlock/isPointClear), shared/types.ts + Block, shared/simulation.ts resolvePosition axis-separiert (X dann Y: Edge-Slide statt Hard-Stop, exakter Radius-Kontakt stabil), stepPlayer nimmt blocks-Param (Default []), shared/protocol.ts Welcome.blocks, server/src/world.ts generiert Layout einmal im Konstruktor (pro Serverstart, Math.random), Welcome broadcastet es, Spawn via findSpawnPoint, Tick mit blocks. GameScreen.ts: arenaLayer (weißes Rect + Slate-Blöcke) in Camera hinter Entities, Welcome setzt Layout + zeichnet neu, Prediction mit arenaBlocks, HUD/Debug-Text dunkel für Lesbarkeit (Engine-Menü-Hintergrund bleibt schwarz, weiße Arena deckt Gameplay-View ab). Springen blockt wie alles (visual only). Tests: neu shared/arena.test.ts (6: Determinismus, Count/Bounds/Gaps, Spawn-clear über Seeds, Fallbacks, Kontakt-Regel), simulation.test.ts +3 (head-on Block, Edge-Slide, Corner-Rounding, je mit Overlap-Assert pro Tick); bun test 29/29 grün, npm run lint/build (tsc+vite) sauber. Manuelle Browser-Verifikation ausstehend, siehe docs/local/MANUAL_TESTS.md.

- [ ] Golf club in character hand
    - Scope: Jeder Spieler erhält einen stilisierten prozeduralen Low-Poly-Golfschläger in der rechten Hand, der über Knochen-Attachment automatisch mit Idle- und Walk-Animationen mitschwingt.
    - Implementation: Neues Modul `src/app/screens/game/GolfClub.ts` mit `createGolfClub()` und `attachGolfClub()`. Schläger besteht aus dunklem Gummigriff, Grip-Cap, weißem Ferrule-Ring, glänzendem Chromstahl-Schaft, Hosel und abgewinkeltem Eisen-Schlägerkopf. Befestigung am Knochen `PalmR` in `WorldScene.ts`.
    - Geometrien & Materialien werden instanzübergreifend geteilt für maximale Performance.
    - Erledigt 2026-10-08: Modul `GolfClub.ts` erstellt, `WorldScene.ts` instanziiert den Schläger pro Charakter an `PalmR`. Unit-Tests in `GolfClub.test.ts` (5 Tests, alle grün). `bun test` 31/31 grün, `npm run lint` und `npm run build` fehlerfrei. Manuelle Browser-Verifikation siehe docs/local/MANUAL_TESTS.md.

- [ ] Golf swing: hold Space to charge, release to swing with load bubble
    - Scope: Halten der Leertaste lädt den Schlag auf (0 bis 100% über 1.5s), Loslassen führt den Schwung aus. Je länger gehalten, desto härter der Schwung. Anzeige über dynamische Lade-Bubble über dem Spieler.
    - Implementation:
      - `shared/types.ts` & `constants.ts`: `InputState.charging`, `PlayerState.charge`, `swingPower`, `swingSeq`, `MAX_CHARGE_DURATION_SECONDS`, `SWING_ANIMATION_DURATION_SECONDS`.
      - `shared/simulation.ts`: `stepPlayer` akkumuliert Charge während Space gehalten wird und sperrt Laufen (fester Stand); Loslassen inkrementiert `swingSeq`, setzt `swingPower` und triggert den Schlag.
      - `src/net/InputController.ts`: `Space`-Taste auf `charging` gemapped.
      - `PlayerEntity.ts`: Lade-Bubble mit dynamischem Farbverlauf (grün -> gelb -> rot) und Prozentanzeige/MAX über dem Namensschild; Release-Flash mit finaler Stärke.
      - `WorldScene.ts` & `GolfClub.ts`: Runder 3D-Schwungbogen auf geneigter Schwungebene (`calculateGolfSwingPose` mit Euler X/Y/Z und `bodyTwistY`). Beim Ausholen fächert der Schläger weit nach rechts aus und die Figur winkelt den Rumpf an (-16° Coiling); beim Schwung peitscht der Schläger im Bogen durch den Treffpunkt, wickelt sich über die linke Schulter im High-Finish (+20° Drehung) und gleitet weich zurück.
      - Multiplayer: Server und Client interpolieren Charge und Swing-Events synchron für alle Mitspieler.
    - Erledigt 2026-10-08: Runder 3D-Golfschwung mit Rumpfdrehung vollständig implementiert. 35/35 Tests grün (`bun test`), `npm run lint` und `npm run build` fehlerfrei.

- [ ] Swing → ball hit → 3D ball flight & multiplayer sync
    - Scope: Shared physics in shared/ballPhysics.ts (distance-first carry launch calculation, sub-stepped trajectory, bouncing, rolling friction, wall reflection). Server-authoritative hit detection with downswing impact delay matching club animation (~110ms), hittable ball detection in front-right hit zone. Client dead reckoning via BallPredictor with smooth error decay.
    - Visuals: 3D height arc with perspective scale (1.0x -> 1.4x), sliding sun shadow with shrink/fade, owner color rings, address range ring (faint white -> bright green when ball in reach), predicted landing marker cross during charging.
    - Erledigt 2026-10-08: Vollständig implementiert. 52/52 Tests grün (`bun test`), Server tsc sauber, `npm run lint` und `npm run build` fehlerfrei. Manuelle Browser-Verifikation siehe docs/local/MANUAL_TESTS.md.


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false]}
```
%%
