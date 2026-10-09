# Manual tests — 3D Tilted Camera & View Alignment (2026-10-09)

Start the dev loop: `npm run dev` (starts Bun server on port 3332 and Vite client on http://localhost:3331).
Automated tests (`bun test` — 88 passing tests), linter (`eslint`), and client build (`vite build`) are all passing cleanly.
Test the following in the browser:

## 1. 3D Tilted Perspective & Character Models

- [ ] Open `http://localhost:3331` in your browser and enter the game.
- [ ] Observe the scene: the camera is tilted by 30° (60° pitch from the ground) providing a true 3D isometric / third-person top-down view.
- [ ] Verify character models are clearly visible in 3D:
  - [ ] You see full bodies, faces/hair, clothing, and golf clubs in hand.
  - [ ] When walking South (down, `S`), the character turns toward the camera.
  - [ ] When walking North (up, `W`), the character turns away from the camera.
  - [ ] When walking East (`D`) or West (`A`), the character faces right and left.
- [ ] Verify standard WASD navigation is 100% intuitive and screen-aligned (`W` moves up, `S` moves down, `A` moves left, `D` moves right).

## 2. 3D Ball Flight & Elevation

- [ ] Walk up to your golf ball.
- [ ] Hold `Space` to charge and release to strike:
  - [ ] The ball visibly launches up into the air in 3D (+Z), soaring above the turf while its shadow remains on the ground.
  - [ ] The ball descends back to the turf on a natural ballistic arc and meets its shadow upon bouncing/landing.
- [ ] Jump or bounce on a trampoline:
  - [ ] Character lifts off the turf into the air and comes back down smoothly.

## 3. UI Alignment (Labels, HUD, Aiming)

- [ ] Look at player name tags and charge meters:
  - [ ] Name labels float right above characters' heads (~12px margin).
  - [ ] Charging power displays the power bar directly above the name tag.
- [ ] Aiming with the mouse:
  - [ ] While holding `Space` to charge, move the mouse cursor around the screen.
  - [ ] Character turns smoothly toward the mouse cursor.
  - [ ] The ground landing marker and range indicator stay locked to the predicted ball trajectory.
- [ ] Walk far away from a bot:
  - [ ] Verify off-screen indicator arrows on the screen borders point toward the bot's location.
