# cyclo

Top-down multiplayer prototype. PixiJS client + Bun WebSocket server, authoritative
server simulation with client-side prediction.

## Running

Two processes, client and server are separate:

```bash
npm run dev:server   # Bun WebSocket server, ws://localhost:3332/ws
npm run dev          # Vite dev server for the client
```

`npm run build` lints, type-checks, and builds the client (`vite build`). The
server ships as plain TS run directly by Bun (`server/package.json` → `start`).

Never use Claude in Chrome (browser automation) on this project.

## Structure

```
shared/       Code imported by BOTH client and server (single source of truth)
  constants.ts    world size, tick rate, speed — must match client/server
  types.ts        PlayerState, InputState
  protocol.ts     ClientMessage / ServerMessage discriminated unions
  simulation.ts   stepPlayer() — the only place movement is computed

server/src/
  world.ts               World class: connections, authoritative tick loop, broadcast
  index.ts               Bun.serve, WebSocket upgrade on /ws, wires messages into World

src/net/
  NetworkClient.ts        typed WS wrapper, auto-reconnect
  InputController.ts      keyboard → InputState
  SnapshotInterpolator.ts buffers server snapshots, renders `INTERPOLATION_DELAY_MS` in the past

src/app/screens/game/
  GameScreen.ts       owns network/input/interpolation, prediction + reconciliation, camera
  PlayerEntity.ts     marker circle + name label
```

`src/app/screens/main/` (MainScreen, Bouncer, Logo) and `LoadScreen` are leftover
PixiJS project-template scaffolding. `MainScreen` is **not wired up** —
`src/main.ts` goes `LoadScreen → GameScreen` directly.

## Networking model

- Server runs the authoritative sim at `TICK_RATE_HZ` (20Hz, `shared/constants.ts`),
  broadcasting full player snapshots over a single Bun pub/sub topic (`WORLD_TOPIC`).
- Client sends its held-key `InputState` at `INPUT_SEND_RATE_HZ` (20Hz), tagged with
  an increasing `seq` (server drops out-of-order/duplicate input).
- `stepPlayer()` in `shared/simulation.ts` is imported by both sides, so the client
  can run the exact same movement function locally.

### Prediction / reconciliation / interpolation (`GameScreen.ts`)

- **Local player**: moved immediately client-side every frame via `stepPlayer`
  (prediction) so input feels instant. When a server `state` message arrives,
  `reconcileLocalPlayer()` nudges the predicted position toward the authoritative
  one — lerp (`RECONCILE_LERP`) if the gap is small, hard snap if it exceeds
  `RECONCILE_SNAP_DISTANCE` (200 units, e.g. after reconnect).
- **Remote players**: never predicted. `SnapshotInterpolator` buffers incoming
  snapshots and renders `INTERPOLATION_DELAY_MS` (100ms) behind "now", interpolating
  position between the two bracketing snapshots. Trades 100ms latency
  for smooth motion despite the server's 20Hz tick + network jitter.
- **Camera**: follows the predicted local player, clamped to world bounds.

## World

There is no map — players move freely in an open area (`WORLD_WIDTH` ×
`WORLD_HEIGHT`, `shared/constants.ts`). `stepPlayer()`
(`shared/simulation.ts`) moves at a constant speed along the held input
direction (diagonals normalized) and clamps to the world bounds; new players
spawn at the world center.

## Known gaps

- No automated tests (client or server).
- No collision between players, no obstacles/goals/scoring.
- No player persistence — reconnecting gets a new UUID and respawns at the center.
- `resolveWsUrl()` hardcodes the server port (3332); no env-based override.
