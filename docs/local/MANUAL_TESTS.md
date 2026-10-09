# Manual tests — Hit Detection: Ball trifft fremden Spieler (Abprall-Physik & Blutfleck-Respawn) (2026-10-09)

Start the dev loop: `npm run dev` (starts Bun server on port 3332 and Vite client on
http://localhost:3331). Automated test suite (`bun test` — 66 passing tests),
linter (`eslint`), and production build (`vite build`) are all passing cleanly.
Test the following in the browser:

## 1. Setup & Multiplayer Test Environment

- [ ] Open two browser windows side-by-side at `http://localhost:3331`.
- [ ] Connect Player 1 (Window 1) and Player 2 (Window 2).
- [ ] Walk Player 2 into the fairway roughly 20-40 units ahead of Player 1.

## 2. Hit Detection & Radial Ball Bounce

- [ ] In Window 1 (Player 1), position yourself so your golf ball aims directly towards Player 2.
- [ ] Hold `Space` to charge a low-to-medium power shot and release.
- [ ] Observe ball impact:
  - When the ball reaches Player 2 (`hypot(ball - player) <= 15.5` and `height <= 29u`), it physically and radially bounces off Player 2.
  - The ball does not clip through Player 2; it reflects away with velocity damping and rolls onto the turf.

## 3. Instant Despawn & Blood Stain

- [ ] At the moment of impact, observe Player 2 in both windows:
  - Player 2's 3D character model, golf club, nametag, and any UI bubbles immediately vanish.
  - A procedural dark-crimson blood pool with splatter droplets appears on the turf at the exact coordinates where Player 2 was struck.

## 4. Input Lock & 1.5s Automatic Respawn

- [ ] During the 1.5-second despawn period:
  - In Window 2 (Player 2), try pressing WASD / Arrow keys and holding Space.
  - Confirm movement and swing charging are completely locked.
  - If Player 2 was actively charging Space when hit, confirm the charge bubble is cancelled.
- [ ] After exactly 1.5 seconds:
  - The blood stain disappears.
  - Player 2 respawns on the exact same spot, fully visible and ready to move and swing again.

## 5. Shooter Immunity (Own Ball)

- [ ] In Window 1, hit a ball toward a nearby field boundary so it reflects back toward Player 1.
- [ ] Let the bouncing/rolling ball pass directly over or touch Player 1.
- [ ] Confirm Player 1 is completely immune to their own shot (`lastHitBy === player.id`) and does not despawn or bounce their own ball.

## 6. High Ball Fly-Over

- [ ] Position Player 2 down the fairway along the shot trajectory (e.g. ~80 units away).
- [ ] In Window 1, charge a high-power shot (e.g. 80-100% power) so the ball arches high into the air.
- [ ] Confirm that when the ball passes over Player 2 at elevation `z > 29u` (above head height), the ball flies straight over Player 2 without colliding or despawning them.

## 7. Despawned Player State (No Ghost Collisions)

- [ ] Hit Player 2 with a shot so they despawn into a blood stain.
- [ ] While the blood stain is still active (within the 1.5s window), hit or roll another ball across the stain.
- [ ] Confirm the second ball passes right across the stain without colliding with an invisible player.
