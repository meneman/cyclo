# What is cyclo

**cyclo** is a top-down multiplayer prototype: players ride bikes around a
shared world, each seeing the others move in near-real time.

## Why it exists

To prove out the networking core before building a real game on top of it —
an authoritative Bun WebSocket server broadcasting snapshots at 20 Hz, with
client-side prediction and reconciliation plus snapshot interpolation on the
PixiJS client, sharing one simulation (`shared/simulation.ts`) as the single
source of truth.

## What it is not

- Not a finished game: no win condition, no progression, no persistence —
  when the server stops, the world is gone.
- Not peer-to-peer: the server is authoritative; clients never trust each
  other's state directly.
- Not the PixiJS template scaffolding around it (`MainScreen`, `Bouncer`,
  `Logo`) — that is leftover and not wired up; the app goes
  `LoadScreen → GameScreen` directly.

## Typical flow

1. Start the server (`npm run dev:server`, `ws://localhost:3332/ws`).
2. Start the client (`npm run dev`) and open it in two browser windows.
3. Ride with the keyboard; each window predicts locally and converges on the
   server snapshots.

Related: [[README]] (vault landing page) · `Decisions/` · `Playtests/`
