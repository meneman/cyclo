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
  constants.ts    world size, tick rate, speed, map name/scale — must match client/server
  types.ts        PlayerState, InputState
  protocol.ts     ClientMessage / ServerMessage discriminated unions
  simulation.ts   stepPlayer() — the only place movement is computed
  collisionMap.ts CollisionMap — queries the packed walkability bitmask

server/src/
  world.ts               World class: connections, authoritative tick loop, broadcast
  index.ts               Bun.serve, WebSocket upgrade on /ws, wires messages into World
  collisionMapLoader.ts  reads public/maps/<name>/ straight off disk

src/net/
  NetworkClient.ts        typed WS wrapper, auto-reconnect
  InputController.ts      keyboard → InputState
  SnapshotInterpolator.ts buffers server snapshots, renders `INTERPOLATION_DELAY_MS` in the past
  collisionMapLoader.ts   fetches public/maps/<name>/ over HTTP

src/app/screens/game/
  GameScreen.ts       owns network/input/interpolation, prediction + reconciliation, camera
  PlayerEntity.ts     bike sprite + name label
  WorldBackground.ts  the map SVG, rasterized to a sprite covering the world

scripts/
  generate-collision-map.mjs  offline: source.svg → collision.bin + debug PNGs

maps/<name>/            authoring workspace: source.svg + debug mask/overlay PNGs, not served at runtime
public/maps/<name>/     runtime assets actually served: map.svg, collision.bin, collision.meta.json
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
  position and angle between the two bracketing snapshots. Trades 100ms latency
  for smooth motion despite the server's 20Hz tick + network jitter.
- **Camera**: follows the predicted local player, clamped to world bounds.

## Map & collision system

The playable world is a real street map (currently Dresden Außere Neustadt),
sourced as a single SVG (`maps/{MAP_NAME}/source.svg`) with no semantic
tagging on its paths — streets are drawn as white/light-gray strokes,
buildings as filled polygons, all indistinguishable in the SVG source itself
except by rendered pixel color. So classification happens on pixels, not markup:

1. `scripts/generate-collision-map.mjs` rasterizes `source.svg` via `sharp`
   (librsvg) at `72 * MAP_RENDER_SCALE` DPI — this density formula gives an
   exact `nativeViewBoxSize * MAP_RENDER_SCALE` pixel output (verified
   empirically; librsvg's baseline isn't the naive 72 DPI you'd expect).
2. Each pixel is classified walkable (near-white/gray, or the yellow/cream
   casing used for arterial roads) or blocked (everything else — buildings,
   parks, water, text).
3. A morphological close (dilate+erode) removes small noise — text labels and
   icons sitting on top of streets — without eating real street/building
   boundaries. Implemented as **separable** 1D passes (X then Y, sliding-window
   sum) rather than a brute-force 2D window scan — the naive version is
   `O(width * height * radius²)`, which at this map's ~4.5M pixels was the
   difference between milliseconds and it not finishing within 15+ minutes.
4. **Connected-component filter**: only the single largest walkable blob
   survives; everything else is zeroed out. Without it, disconnected
   same-colored pixels (building courtyards, interior light wells, stray
   plaza slivers) pass as "walkable" despite having no path to any real
   street.
5. Output: `collision.bin` (1-bit-per-pixel packed mask, one bit per world
   pixel) + `collision.meta.json` (width/height), written straight into
   `public/maps/{MAP_NAME}/`, plus `collision-mask.png` / `collision-overlay.png`
   debug visualizations in `maps/{MAP_NAME}/` for eyeballing correctness.

`MAP_RENDER_SCALE` is 2, not 4 — rasterizing this filter/mask-heavy SVG scales
roughly linearly with pixel count (2x scale: ~4.5M px, ~2 minutes; 4x scale:
~18M px, wouldn't finish in 15+ minutes). 2x still gives comfortable street
width for the collision radii below.

The mask is rasterized **directly at world resolution** — `shared/collisionMap.ts`
does a plain 1:1 pixel lookup, no scale conversion at query time. The
background texture is rasterized the same way at runtime: `GameScreen` loads
`map.svg` via `Assets.load({ src, data: { resolution: MAP_RENDER_SCALE } })`,
so the visible map and the collision mask come from the same source at the
same scale and land on the same pixel grid.

`CollisionMap` (`shared/collisionMap.ts`) is queried identically by both
sides — `isWalkableDisc()` approximates a solid disc by sampling its center
plus 8 points around the rim, and `stepPlayer()` (`shared/simulation.ts`)
tries the full diagonal move, then each axis alone, so sliding along a wall
doesn't kill movement entirely. Two different radii matter here:

- `PLAYER_RADIUS` — visual size (sprite, world-bound clamp).
- `COLLISION_RADIUS` — deliberately smaller; a full-size hitbox gets stuck in
  the narrower streets, so collision checks use a smaller radius while the
  bike still looks its full visual size.
- `SPAWN_CLEARANCE_RADIUS` — bigger than both, used only when picking a spawn
  point. A point can pass the small `COLLISION_RADIUS` disc check while
  sitting right at a building corner with zero room to move — every
  direction, including diagonals, immediately pokes the disc rim into a
  wall. This actually happened: a spawn search landing in a tight corner
  left new players frozen, unable to move any direction, even though the
  point itself was technically "walkable." Requiring a bigger clear radius
  for spawn selection (while movement collision keeps using the smaller
  radius) fixed it.

`World.addPlayer()` (server) picks a spawn point via
`collisionMap.findNearestWalkable()` spiraling out from the world center,
since the world center itself usually lands inside a building block.

Note: even with spawn clearance, a street segment near an intersection
often only has 1-2 open directions (the others lead straight into an
adjacent building) — that's correct behavior, not a bug. `stepPlayer()`
only tries the input's own direction (plus its two axis components), so
navigating tight corners requires changing direction, same as any simple
axis-tested collision system without full wall-sliding physics.

To regenerate after swapping in a new map: replace
`maps/{MAP_NAME}/source.svg`, update `MAP_NATIVE_WIDTH`/`MAP_NATIVE_HEIGHT` in
`shared/constants.ts` to match its viewBox, then run
`node scripts/generate-collision-map.mjs {MAP_NAME}`.

## Known gaps

- No automated tests (client or server).
- No collision between players (only player-vs-map), no obstacles/goals/scoring.
- No player persistence — reconnecting gets a new UUID and a fresh spawn search.
- `resolveWsUrl()` hardcodes the server port (3332); no env-based override.
- Only one map (`neustadt`) exists; nothing currently switches between maps at runtime.
