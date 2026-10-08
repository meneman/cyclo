# Manual tests — Three.js top-down scene (green field, black dots)

Start the dev loop yourself first: `npm run dev:server` (Bun on port
`3332`), then `npm run dev` (Vite on port `3331`, open
`http://localhost:3331`; `/ws` is proxied to the backend). Automated suites
(`bun test`, `eslint`, `tsc`, `vite build`) are green; the points
below need a human in the browser.

## Scene

- [ ] Open `http://localhost:3331`, join: you see a blank green field from
      directly above on a dark backdrop — no black void where the field
      should be.
- [ ] You spawn at the field center as a black dot with your name above it.
- [ ] No Pixi canvas artifacts: HUD (top-right) and chat panel render over
      the 3D view and stay readable over the green.

## Movement / sync

- [ ] Move with WASD/arrows: your dot follows input immediately, same speed
      in all directions (diagonals not faster).
- [ ] Push into a field edge: the dot stops at the edge, never leaves the
      green.
- [ ] The camera follows your dot and clamps at the field edges.
- [ ] Open a second tab/window with another name: both windows show both
      black dots moving smoothly, names tracking the right dots.

## Chat

- [ ] Press Y (or click the chat box), type a message, Enter: it appears in
      your log and in the other window's log with your name.
- [ ] A chat bubble appears above your dot's name in the other window and
      fades after a few seconds.
- [ ] Join/leave announces a system line in the chat log of the other window.

## Reconnect

- [ ] Connection HUD (top-right) shows `connected · N players` and updates
      the count as windows join/leave.
- [ ] Close and reopen a window: it rejoins with a fresh id, no leftover
      dots or name labels remain.
