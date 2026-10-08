---

kanban-plugin: board

---

## todo

- [ ] Probe card (delete me)

## progress

## waiting

## done

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

%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false]}
```
%%
