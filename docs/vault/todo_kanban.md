---
kanban-plugin: board
---

## backlog (human only)

- [ ] Stroke counter & scorecard HUD
  - Scope: Track strokes taken per player during current hole.
  - State: `PlayerState.strokes` tracked authoritatively on server, incrementing whenever `strikeBall` connects.
  - HUD: Display current stroke count in PixiJS UI (e.g. "Strokes: 3" next to player nametag and in top-left HUD).
  - Completion: Show hole completion banner ("Finished in X strokes!") when ball drops in cup.
- [ ] Touch swing controls for mobile
  - Scope: Mobile touch support for charging and releasing golf swing.
  - Controls: Touch button or hold-to-charge circle on bottom-right, drag direction aim or heading buttons.
  - Integration: Wires into `InputState.charging` and heading without disrupting desktop keyboard controls.
- [ ] Golf hole & flag with ball-in-cup detection
  - Scope: Authoritative golf hole (cup radius ~4-5 units) with a 3D flagstick + pennant in Three.js.
  - Physics: In `shared/ballPhysics.ts`, grounded ball whose center enters hole radius at speed <= CUP_CAPTURE_SPEED drops into cup (stops motion, sets `inHole: true`, sinks below grass level). High-speed balls lip out or roll over.
  - Sync: Server broadcasts `inHole` in `BallState`; on hole-out, announces completion in chat.
  - Respawn / Next tee: Ball resets to starting tee after delay or on user action.

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
    - Update doc references in `README.md` and `.agents/skills/golfi-manager/SKILL.md`.
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
- [ ] Audio effects with @pixi/sound
  - Scope: Trigger sound effects for key actions using `@pixi/sound` on the client side only.
  - Architecture Constraint: Physics and simulation live in `shared/`, which runs on the server. You MUST NOT import `@pixi/sound` or any UI library into `shared/`.
  - Event Detection: The client (e.g., `WorldScene` or `GameScreen`) must detect sound events by observing state changes (diffing current vs previous state):
    - Swing whoosh: Trigger when a player's `swingSeq` increments.
    - Ball impact: Trigger when `ball.lastHitBy` updates or when velocity spikes from 0.
    - Turf bounce: Trigger in the client loop when detecting a ground impact (Z velocity sign change and `z <= radius`), scaling volume by impact speed.
    - Cup sink rattle: Trigger when `ball.inHole` transitions to true.
  - Asset Loading: Load audio assets (`.mp3` or `.ogg`) in the `prepare()` phase of the screen.
  - UI: Add a mute/unmute button in the Pixi overlay; respect browser autoplay policies.

## progress

## waiting

## done

- [x] 1v1 Match Rooms & 10-Second Countdown (Race to 10 points)
  - Scope: Multi-room server architecture with 1v1 match lifecycle, 10s warmup countdown, tee spawns, and first-to-10-points win condition.
  - Room Architecture: Server `RoomManager` decouples global world into isolated match rooms with per-room Bun pub/sub topics (`room:${roomId}`).
  - Match Lifecycle: `WAITING` (1/2, free practice & invite link) ➔ `COUNTDOWN` (2/2, 10s countdown, aborts if player leaves) ➔ `PLAYING` (teleport to Tee 1 & Tee 2, reset to 0 pts) ➔ `FINISHED` (first to 10 points wins).
  - Gameplay & Bots: Wandering bots per room as targets (+1 frag); sinking holes (+1 hole); total score = frags + holes.
  - UI & Presentation: PixiJS match scoreboard (P1 vs P2 race to 10), screen-center countdown digits (10..1) with "MATCH START!" slam banner, Victory/Defeat screen, and invite link copying.
  - Erledigt 2026-10-09: 1v1 Match-Räume und 10s-Countdown vollständig implementiert. Multi-Room-Architektur im Server mit Bun Pub/Sub (`room:${roomId}`), Matchmaking und Raum-IDs via URL-Invite (`?room=XYZ`). 10-Sekunden Free-Warmup-Countdown, automatischer Starttee-Teleport bei 0s, Race to 10 Points (Kills + Holes), Victory/Defeat-Modal und Rematch-Funktion. 114/114 Tests grün (`bun test`), ESLint, TypeScript `tsc` und Vite Production Build fehlerfrei. Checkliste in `docs/local/MANUAL_TESTS.md` aktualisiert.
- [x] In-game Menu with online player list, color picker, and dummy settings
  - Scope: In-game menu accessible via ESC or HUD button. Displays online players, color selection for golfer & ball, and dummy settings tab.
  - Players List: Real-time list of all players on the server with name, color swatch, (You) / (Bot) tags, frags, and holes.
  - Color Picker: 12-color palette based on `PLAYER_COLORS`. Updates local state, stores to `userSettings`, sends `setColor` to server, and updates player shirt and ball ring.
  - Settings: Interactive dummy settings controls (Graphics Quality, Field Shadows, Show FPS, Audio Volume sliders).
  - Controls & Access: Toggle with Escape key or clickable HUD menu button. Blocks game input while open.
  - Erledigt 2026-10-09: In-Game Menü implementiert mit Spielerliste, Farbwahl und Settings. 96/96 Tests grün, Linter und Vite Production Build fehlerfrei. Checkliste in docs/local/MANUAL_TESTS.md hinterlegt.
- [x] Big KILL monitor banner and FRAGS / Holes side stats HUD
  - Scope: When killing someone, show big "KILL" on the monitor; display stats on the side for FRAGS and Holes.
  - Kill Feedback: Prominent animated "KILL" banner centered on the monitor when the local player's shot knocks down an opponent or bot.
  - Side HUD: Side stats display with "FRAGS: <count>" and "Holes: <count>" updating authoritatively.
  - Simulation & Netcode: Server tracks `frags` and `holes` per player; detects ball-player eliminations and hole-ins; broadcasts `Kill` and `HoleScored` events and announces them in chat.
  - Erledigt 2026-10-09: Großes animiertes "KILL"-Banner (Slam-Effekt & Fade-Out) auf dem Monitor bei Kills implementiert. Statistikanzeige auf der rechten Seite mit "FRAGS:" und "Holes:". Server-authoritatives Tracking von Frags und eingelochten Bällen samt Chat-Benachrichtigungen und Ball-Reset. 86/86 Tests grün (`bun test`), ESLint, TypeScript und Vite Production Build fehlerfrei. Checkliste in `docs/local/MANUAL_TESTS.md` hinterlegt.
- [x] Locked 16:9 viewbox across PixiJS & Three.js (no map reveal on browser zoom)
  - Scope: Lock the camera viewbox so browser zoom and window resizing cannot reveal more of the golf map or alter the visible world extent.
  - Viewbox: Fixed 16:9 logical resolution (`VIEWBOX_WIDTH = 1920`, `VIEWBOX_HEIGHT = 1080`) shared by Three.js orthographic camera frustum and PixiJS UI overlay.
  - CSS Stacking: Declarative `#viewbox` container inside `#app` with `aspect-ratio: 16 / 9`, centered letterboxing/pillarboxing with black bars, containing stacked `#three-container` (z-index 0) and `#pixi-container` (z-index 1).
  - Controls & Input: `InputController` converts mouse pointer coordinates from `#viewbox.getBoundingClientRect()` into logical viewbox coordinates, keeping swing aiming 100% accurate at any browser zoom level or aspect ratio.
  - Resolution: WebGL renderers update `pixelRatio` dynamically on resize/zoom to maintain sharp text and models on HiDPI/Retina screens without expanding frustum bounds.
  - Erledigt 2026-10-09: Fester 16:9 Viewport (1920x1080) für Three.js und PixiJS implementiert. CSS-Stacking in `#viewbox` mit Zentrierung in `#app`. Browser-Zoom skaliert die Anzeige via CSS ohne Map-Fläche freizulegen. Maus-Aiming via BoundingClientRect auf Viewbox-Koordinaten normiert. 76/76 Tests grün (`bun test`), ESLint und Vite Production Build fehlerfrei. Checkliste in `docs/local/MANUAL_TESTS.md` hinterlegt.
- [x] Arcade ball physics: faster, harder, flatter trajectory
  - Scope: Tune ball physics in `shared/constants.ts`, `shared/terrain.ts`, and `shared/ballPhysics.ts` to be fast, hard, and arcade-like.
  - Trajectory: Lower launch angle (`BALL_LAUNCH_ANGLE` from 45° to 22.5°) and higher gravity (`BALL_GRAVITY` to 220) for a laser-flat, fast flight arc (apex height drops from ~75u to ~36u, flight speed doubles to >300u/s).
  - Elasticity & Hardness: Increase vertical bounce restitution (`BALL_RESTITUTION` to 0.55), horizontal bounce friction (`BALL_BOUNCE_FRICTION` to 0.75), wall rebound (`BALL_WALL_RESTITUTION` to 0.75), and player impact reflection (`BALL_PLAYER_RESTITUTION` to 0.75).
  - Roll & Max carry: `BALL_ROLL_DECEL` to 95u/s², `BALL_MAX_CARRY` to 350u.
  - Visuals: Update `GolfBall.ts` height scaling & shadow fade to match the lower 36u apex.
  - Erledigt 2026-10-09: Arcade-Physik vollständig implementiert. 73/73 Tests grün (`bun test`), ESLint, Server tsc und Vite Production Build fehlerfrei. Manuelle Checkliste in `docs/local/MANUAL_TESTS.md` aktualisiert.
- [x] Spawn random golf players that walk around
  - Scope: Server-authoritative random golf bots (NPCs) that wander across the golf course (Clubhouse, fairways, greens), cycle naturally between walking and idle pausing, and interact physically with balls (blood-stain knockdown & respawn).
  - Implementation:
    - `server/src/bot.ts`: Bot player model (`BotPlayer`), AI steering loop (`stepBot`), waypoint target selection within course patrol radii, idle pauses, and default spawn configurations (`DEFAULT_BOT_SPAWNS`).
    - `server/src/world.ts`: Manage bot lifecycle alongside human players, include bots in simulation tick, hit detection (`stepBall` collision with all players), snapshots (`Welcome` / `State`), and support `/spawn [count]` and `/clearbots` chat commands.
    - Verification: Unit tests in `server/src/bot.test.ts`, `bun test` (73/73 tests pass), `npm run lint`, and `npm run build` clean.
  - Erledigt 2026-10-09: 8 Standard-Golfer auf dem Kurs verteilt (Clubhouse, Hole 1, Hole 2, Hole 3, Hole 4). Natürliche Geh- und Idle-Pausen-Zyklen via `stepPlayer`, 3D-Walk- und Idle-Animationen, Namensschilder und Edge-Indikatoren. Vollständige Kollisions- und Respawn-Integration mit Golfbällen. Chat-Befehle `/spawn [count]` und `/clearbots` hinzugefügt. Manuelle Testcheckliste in `docs/local/MANUAL_TESTS.md` aktualisiert.

- [x] Viewport dimension consistency in `GameScreen.ts` & edge indicators
  - Scope: Fix desynchronization between Pixi's logical resolution (`app.renderer.width`/`height`) and window dimensions (`window.innerWidth`/`innerHeight`) in `GameScreen.ts`.
  - Problem: When the window is smaller than `minWidth: 1024` / `minHeight: 600`, Pixi scales CSS canvas size while keeping logical buffer >= 1024x600. `WorldScene.project()` centers at `(viewWidth / 2, viewHeight / 2)`, but `GameScreen.placeLabel()` was reading `window.innerWidth / 2`, causing off-screen clamping and angle calculations to be offset toward top-left.
  - Implementation:
    - `src/app/screens/game/GameScreen.ts`: Add `viewportWidth = 0` and `viewportHeight = 0` state variables.
    - `resize(width, height)`: Store `this.viewportWidth = width` and `this.viewportHeight = height` when called by `CreationNavigationPlugin`.
    - `prepare()`: Ensure initial fallback dimensions align before first resize fires.
    - `placeLabel()`: Use `this.viewportWidth` and `this.viewportHeight` instead of `window.innerWidth` and `window.innerHeight`.
    - Verify with `bun test` and typecheck via `tsc`.
  - Erledigt 2026-10-08: In `GameScreen.ts` `viewportWidth` und `viewportHeight` hinzugefügt, in `prepare()` initialisiert, in `resize()` synchronisiert und in `reset()` aufgeräumt. `placeLabel()` klemmt Indikatoren nun konsistent gegen die logische Viewport-Größe ab. `bun test` (52/52 Tests grün) und `tsc` fehlerfrei. Manuelle Checkliste in `docs/local/MANUAL_TESTS.md` hinterlegt.
- [x] Movement: replace 8-way heading with speed + steer (2 controls) (Archived: bike prototype)
  - Keyboard: Up = hold-to-gas (accelerate per PLAYER_ACCELERATION), release = coast to stop per PLAYER_FRICTION; Down = brake harder and reverse slowly; Left/Right = rotate only, no strafing/desired-heading
  - Steering scales with speed only: no turning at speed 0, keep speed-dependent turn-rate curve (PLAYER_MAX_TURN_RATE pivoting slow → PLAYER_MIN_TURN_RATE wide arc fast); turning keeps TURN_SPEED_PENALTY_PER_RADIAN
  - Mobile: 2 inputs replacing drag joystick — right thumb hold-to-gas pedal button + left thumb L/R steer buttons (◀ ▶); keep existing jump button as-is
  - Touches: shared/movement.ts (drop desiredHeadingFromInput octant math), shared/types.ts InputState + protocol (up/down/left/right semantics break — throttle/steer fields), src/net/InputController.ts (arrow mapping), src/net/JoystickInputController.ts (replace/remove), GameScreen.ts mergeInputs + touch layout constants (JOYSTICK_MARGIN)
  - Edge cases: standing-start turn does nothing; Down-from-stop enters slow reverse; reverse + steering direction needs a defined sign; stop conflating Space/jump with movement inputs
  - Erledigt 2026-09-17: 8-way heading replaced by signed speed + steer. shared/movement.ts rewritten (gas/brake/coast longitudinal, steer rotates only at speed != 0, reverse inverts car-like, turn penalty is sign-aware, jump ignored), shared/types.ts InputState up/down -> gas/brake (left/right now steer-only), shared/constants.ts + PLAYER_BRAKE_DECELERATION 800 / PLAYER_MAX_REVERSE_SPEED 80, shared/protocol.ts sanitize new fields (legacy up/down dropped), src/net/InputController.ts remapped, JoystickInputController.ts deleted and replaced by TouchDriveController.ts (GasPedalController bottom-right + SteerButtonsController ◀ ▶ bottom-left, jump button unchanged, no touch brake per card), GameScreen.ts mergeInputs + layout constants updated, server/src/world.ts IDLE_INPUT updated. Tests: new shared/movement.test.ts (9 tests: accel/coast/clamps, brake>coast, brake-wins, standstill-steer, pivot-vs-arc, reverse-invert, turn-penalty, jump-ignored), updated simulation/protocol tests; bun test 19/19 green, tsc/eslint/vite build clean. Deviation notes: brake wins over simultaneous gas; reverse steering defined as inverted (car-like); touch has gas+steer only. Manuelle Browser-Verifikation ausstehend, siehe docs/local/MANUAL_TESTS.md.
- [x] Map generator: small white arena with blocking blocks (Archived: bike prototype)
  - Scope: fixed small arena (smaller than current WORLD_WIDTH 2468 x WORLD_HEIGHT 1848 in shared/constants.ts), white background with a handful of rectangular blocks
  - Generation: once per server start, random layout broadcast to all clients (not per-connect, not fixed seed)
  - Collision: blocks authoritatively block movement in shared/simulation.ts resolvePosition (so server + client prediction via stepPlayer stay in sync); slide along block edges, don't hard-stop
  - Rendering: white world background replaces black canvas, blocks drawn in GameScreen camera layer; spawn point must be checked clear of blocks (current spawn is world center)
  - Edge cases: player radius (PLAYER_RADIUS 14) vs block overlap, corner sliding, spawn-inside-block fallback
  - Erledigt 2026-09-17: Arena 1200x900 (WORLD_WIDTH/HEIGHT in shared/constants.ts) mit 7 random Blöcken. Neu shared/arena.ts (generateArenaLayout mit injizierbarer RNG, findSpawnPoint mit Grid-Fallback, circleHitsBlock/isPointClear), shared/types.ts + Block, shared/simulation.ts resolvePosition axis-separiert (X dann Y: Edge-Slide statt Hard-Stop, exakter Radius-Kontakt stabil), stepPlayer nimmt blocks-Param (Default []), shared/protocol.ts Welcome.blocks, server/src/world.ts generiert Layout einmal im Konstruktor (pro Serverstart, Math.random), Welcome broadcastet es, Spawn via findSpawnPoint, Tick mit blocks. GameScreen.ts: arenaLayer (weißes Rect + Slate-Blöcke) in Camera hinter Entities, Welcome setzt Layout + zeichnet neu, Prediction mit arenaBlocks, HUD/Debug-Text dunkel für Lesbarkeit (Engine-Menü-Hintergrund bleibt schwarz, weiße Arena deckt Gameplay-View ab). Springen blockt wie alles (visual only). Tests: neu shared/arena.test.ts (6: Determinismus, Count/Bounds/Gaps, Spawn-clear über Seeds, Fallbacks, Kontakt-Regel), simulation.test.ts +3 (head-on Block, Edge-Slide, Corner-Rounding, je mit Overlap-Assert pro Tick); bun test 29/29 grün, npm run lint/build (tsc+vite) sauber. Manuelle Browser-Verifikation ausstehend, siehe docs/local/MANUAL_TESTS.md.
- [x] Golf club in character hand
  - Scope: Jeder Spieler erhält einen stilisierten prozeduralen Low-Poly-Golfschläger in der rechten Hand, der über Knochen-Attachment automatisch mit Idle- und Walk-Animationen mitschwingt.
  - Implementation: Neues Modul `src/app/screens/game/GolfClub.ts` mit `createGolfClub()` und `attachGolfClub()`. Schläger besteht aus dunklem Gummigriff, Grip-Cap, weißem Ferrule-Ring, glänzendem Chromstahl-Schaft, Hosel und abgewinkeltem Eisen-Schlägerkopf. Befestigung am Knochen `PalmR` in `WorldScene.ts`.
  - Geometrien & Materialien werden instanzübergreifend geteilt für maximale Performance.
  - Erledigt 2026-10-08: Modul `GolfClub.ts` erstellt, `WorldScene.ts` instanziiert den Schläger pro Charakter an `PalmR`. Unit-Tests in `GolfClub.test.ts` (5 Tests, alle grün). `bun test` 31/31 grün, `npm run lint` und `npm run build` fehlerfrei. Manuelle Browser-Verifikation siehe docs/local/MANUAL_TESTS.md.
- [x] Golf swing: hold Space to charge, release to swing with load bubble
  - Scope: Halten der Leertaste lädt den Schlag auf (0 bis 100% über 1.5s), Loslassen führt den Schwung aus. Je länger gehalten, desto härter der Schwung. Anzeige über dynamische Lade-Bubble über dem Spieler.
  - Implementation:
    - `shared/types.ts` & `constants.ts`: `InputState.charging`, `PlayerState.charge`, `swingPower`, `swingSeq`, `MAX_CHARGE_DURATION_SECONDS`, `SWING_ANIMATION_DURATION_SECONDS`.
    - `shared/simulation.ts`: `stepPlayer` akkumuliert Charge während Space gehalten wird und sperrt Laufen (fester Stand); Loslassen inkrementiert `swingSeq`, setzt `swingPower` und triggert den Schlag.
    - `src/net/InputController.ts`: `Space`-Taste auf `charging` gemapped.
    - `PlayerEntity.ts`: Lade-Bubble mit dynamischem Farbverlauf (grün -> gelb -> rot) und Prozentanzeige/MAX über dem Namensschild; Release-Flash mit finaler Stärke.
    - `WorldScene.ts` & `GolfClub.ts`: Runder 3D-Schwungbogen auf geneigter Schwungebene (`calculateGolfSwingPose` mit Euler X/Y/Z und `bodyTwistY`). Beim Ausholen fächert der Schläger weit nach rechts aus und die Figur winkelt den Rumpf an (-16° Coiling); beim Schwung peitscht der Schläger im Bogen durch den Treffpunkt, wickelt sich über die linke Schulter im High-Finish (+20° Drehung) und gleitet weich zurück.
    - Multiplayer: Server und Client interpolieren Charge und Swing-Events synchron für alle Mitspieler.
  - Erledigt 2026-10-08: Runder 3D-Golfschwung mit Rumpfdrehung vollständig implementiert. 35/35 Tests grün (`bun test`), `npm run lint` und `npm run build` fehlerfrei.
- [x] Swing → ball hit → 3D ball flight & multiplayer sync
  - Scope: Shared physics in shared/ballPhysics.ts (distance-first carry launch calculation, sub-stepped trajectory, bouncing, rolling friction, wall reflection). Server-authoritative hit detection with downswing impact delay matching club animation (~110ms), hittable ball detection in front-right hit zone. Client dead reckoning via BallPredictor with smooth error decay.
  - Visuals: 3D height arc with perspective scale (1.0x -> 1.4x), sliding sun shadow with shrink/fade, owner color rings, address range ring (faint white -> bright green when ball in reach), predicted landing marker cross during charging.
  - Erledigt 2026-10-08: Vollständig implementiert. 52/52 Tests grün (`bun test`), Server tsc sauber, `npm run lint` und `npm run build` fehlerfrei. Manuelle Browser-Verifikation siehe docs/local/MANUAL_TESTS.md.
- [x] Terrain zones (Fairway, Green, Rough, Sand Bunker)
  - Scope: Define course surface zones in `shared/` with varied physical friction and roll deceleration.
  - Physics: Green (low deceleration, smooth roll), Fairway (standard), Rough (higher deceleration, reduced carry), Sand bunker (high deceleration, low bounce, ball stops quickly).
  - Visuals: Multi-textured or colored turf mesh in Three.js `WorldScene.ts` matching physical zones.
  - Erledigt 2026-10-09: Terrain-Zonensystem in `shared/terrain.ts` definiert mit 4 Zonen-Typen (`fairway`, `green`, `rough`, `bunker`), physikalischen Parametern (rollDecel, restitution, bounceFriction, carryMultiplier) und Kurslayout COURSE_ZONES für 4 Bahnen + Clubhouse/Übungsbereich. Ballphysik in `shared/ballPhysics.ts` integriert (Zonen-Abprall, Ausrollen und Rough/Bunker Carry-Penalties). Three.js `WorldScene.ts` visualisiert Zonen über Basismesh (Rough), texturierte Fairways, Putting-Greens mit Collar-Fringe und Sandbunker mit Lip-Rand. HUD/Debug-Readout in `GameScreen.ts` zeigt aktuelle Zone. 59/59 Tests grün (`bun test`), ESLint und Vite Production Build fehlerfrei. Manuelle Browser-Verifikation siehe docs/local/MANUAL_TESTS.md.
- [x] Hit detection: Ball trifft fremden Spieler (Abprall-Physik & Blutfleck-Respawn)
  - Scope: Kollision zwischen fliegenden/rollenden Bällen und fremden Spielern mit physikalischem Abprallen, sofortigem Despawn des Spielers zu einem Blutfleck auf dem Boden für 1.5s und anschließendem Respawn an derselben Stelle.
  - Kollisions-Bedingung: Distanz 2D `hypot(ball.x - player.x, ball.y - player.y) <= PLAYER_RADIUS (14) + BALL_RADIUS (1.5)` UND vertikale Höhe `ball.z <= 29` (Körperhöhe). Bälle höher als 29u fliegen über Köpfe hinweg. Nur fremde Spieler (`player.id !== ball.lastHitBy`); Schütze ist immun gegen den eigenen Ball.
  - Abprall-Physik: In `shared/ballPhysics.ts` / `server/src/world.ts` prallt der Ball radial an der Spielerscheibe ab (Geschwindigkeitsvektor an der Kollisionsnormale mit Restitution dämpfen/reflektieren).
  - Stun & Steuerung: `PlayerState.knockdownTimer` (1.5s). In `shared/simulation.ts` sperrt `stepPlayer` während des Despawns Bewegung und Schlagen; laufender Schwung-Charge wird abgebrochen. Nach 1.5s respawnt der Spieler automatisch am selben Ort.
  - 3D-Visuals & Blutfleck: Spieler-Modell, Schläger und Namensschild/Load-Bubble werden während des Despawns ausgeblendet. Am Boden (`z = 0.02`) erscheint ein Blutfleck (prozedurales rot-gesprenkeltes Mesh/Decal). Nach Ablauf der 1.5s wird der Blutfleck entfernt und der Spieler wird wieder sichtbar.
  - Sync: `knockdownTimer` in `PlayerState` wird authoritativ vom Server synchronisiert.
  - Erledigt 2026-10-09: Treffererkennung und Abprall-Physik in `shared/ballPhysics.ts` implementiert (Trefferprüfung mit Schützen-Immunität, Höhencheck z <= 29, Radialabprall mit Restitution und Substep-Integration in `stepBall`). Server `world.ts` synchronisiert `PlayerState.knockdownTimer` authoritativ. In `shared/simulation.ts` sperrt `stepPlayer` während des Despawns Steuerung und bricht laufenden Swing-Charge ab. In `src/app/screens/game/BloodStain.ts` prozedurales Blutfleck-Mesh erstellt (`z = 0.02`), `WorldScene.ts` blendet Charaktermodell aus und Blutfleck ein, `PlayerEntity.ts` versteckt Overlay-Labels während des Despawns, automatischer Respawn nach 1.5s. Tests in `simulation.test.ts`, `ballPhysics.test.ts` und `BloodStain.test.ts` ergänzt (66/66 Tests grün), Server tsc sauber, ESLint und Vite Production Build fehlerfrei. Manuelle Browser-Verifikation ausstehend, siehe docs/local/MANUAL_TESTS.md.

%% kanban:settings

```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```

%%
