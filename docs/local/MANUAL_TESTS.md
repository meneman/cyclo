# Manual tests — generic movement backbone (no bike, no map)

Start the dev loop yourself first: `npm run dev:server` (Bun on port
`3332`), then `npm run dev` (Vite on port `3331`, open
`http://localhost:3331`; `/ws` is proxied to the backend). Automated suites
(`bun test`, `eslint`, `tsc`, `vite build`) are green; the points
below need a human in the browser.

## Movement / sync

- [ ] Open `http://localhost:3331`, join: you spawn at the world center as a
      colored circle with your name above it.
- [ ] Move with WASD/arrows: the circle follows input immediately, at the
      same speed in all directions (diagonals not faster).
- [ ] Push into a world edge: the circle stops at the edge, never leaves it.
- [ ] Open a second tab/window with another name: both players see each other
      move smoothly (no rubber-banding beyond normal lag reconciliation).

## Chat

- [ ] Press Y (or click the chat box), type a message, Enter: it appears in
      your log and in the other window's log with your name.
- [ ] A chat bubble appears above your circle in the other window and fades
      after a few seconds.
- [ ] Join/leave announces a system line in the chat log of the other window.

## Reconnect

- [ ] Connection HUD (top-right) shows `connected · N players` and updates
      the count as windows join/leave.
- [ ] Close and reopen a window: it rejoins with a fresh id, no ghost
      circles remain.
