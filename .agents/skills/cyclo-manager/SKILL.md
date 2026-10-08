---
name: cyclo-manager
description: Run, build, and verify the cyclo multiplayer prototype (PixiJS client + Bun WebSocket server).
---

# Cyclo Manager Skill

This skill lets the agent run the game's dev loop and verify changes using
the repo's real scripts. There is no database and no CLI data tooling — the
world exists only in the running server's memory.

## 🛠️ Usage in the CLI

Two processes, client and server are separate. Run from the project root:

### 0. Install (once per checkout)

```bash
npm install          # client deps (vite, pixi.js, eslint, ...)
cd server && bun install && cd ..   # server deps (@types/bun)
```

### 1. Start both server and client (recommended)

```bash
npm run dev          # starts server (port 3332) and client (http://localhost:3331) concurrently
```

Or start them individually in separate terminals:
```bash
npm run dev:server   # cd server && bun --watch src/index.ts (port 3332)
npm run dev:client   # vite dev server on http://localhost:3331
```

Open the URL in two browser windows to play against yourself. The app goes
`LoadScreen → StartScreen` (name pick, `src/main.ts`) → `GameScreen`
(`src/app/screens/start/StartScreen.ts`); `MainScreen` is leftover template
scaffolding and is not wired up.

### 3. Verify a change

```bash
npm test    # bun test — shared sim + protocol tests (shared/*.test.ts)
npm run lint   # eslint .
npm run build  # lint + tsc + vite build (client bundle into dist/)
```

`npm run build` is the full gate: lint, type-check, and client build must all
pass. The server ships as plain TS run directly by Bun — no server build step.

### 4. Touch points by area

- Movement/physics: `shared/simulation.ts` (`stepPlayer`) — single source of
  truth, imported by BOTH client (prediction) and server (authority).
- World size, tick rate, speed: `shared/constants.ts` — must match on both sides.
- Wire format: `shared/protocol.ts` (`ClientMessage` / `ServerMessage`).
- Server loop/broadcast: `server/src/world.ts`, wiring: `server/src/index.ts`.
- Client netcode: `src/net/` (`NetworkClient`, `InputController`,
  `SnapshotInterpolator`) and `src/app/screens/game/` (`GameScreen`,
  `PlayerEntity`).

---

## 🤖 Instructions for the agent

### A. When the user asks to run the game:

1. Start the server first (`npm run dev:server`), then the client
   (`npm run dev`). Two long-running processes — run them in the background
   and report both URLs/ports.
2. If the WebSocket won't connect, check the server is up on port `3332`
   (or `$PORT`) and that the Vite `/ws` proxy target in `vite.config.ts`
   still points at it (the client uses a relative URL).
3. Never use browser automation on this project.

### B. When the user asks to change gameplay or netcode:

1. Change `shared/` first when the behavior must agree on both sides —
   never fix up client and server separately for the same rule.
2. Verify with `npm test`, then `npm run lint`, then `npm run build`.
   All three must pass before reporting done.
3. If the change touches a view (PixiJS screen/entity), don't verify it
   yourself in a browser — overwrite `docs/local/MANUAL_TESTS.md` with a
   checklist for the user to work through by hand (it only ever covers the
   card just implemented, never history). If it doesn't touch a view,
   leave `docs/local/MANUAL_TESTS.md` alone.
4. Queue and execute the work through the kanban skills (`todo-intake-kanban`
   → `todo-next-kanban`), moving cards with `kanban-move-card`.

### C. When working on the View (Three.js + PixiJS Stacked Architecture)

1. The client uses a dual-renderer setup: Three.js handles the 3D world, while PixiJS handles the 2D UI overlay.
2. **Three.js (`WorldScene.ts`)**: Edit this when modifying 3D geometry, environments, player models, meshes, or animations.
3. **PixiJS (`GameScreen.ts`, `PlayerEntity.ts`)**: Edit this when modifying floating UI, chat bubbles, health/load bars, HUD, or text. Do NOT attempt to render crisp dynamic text or complex 2D UI inside the Three.js scene.
4. **The Bridge**: The PixiJS UI layer maps 3D coordinates to 2D screen space using `worldScene.project(x, y)` to lock UI elements (like name tags) over their respective 3D entities. When creating UI that tracks the game world, project its coordinates and update its PixiJS position inside the `GameScreen.ts` update loop.
