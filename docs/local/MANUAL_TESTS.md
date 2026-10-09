# Manual tests — 1v1 Match Rooms & 10s Countdown (2026-10-09)

Start the dev loop: `npm run dev` (starts Bun server on port 3332 and Vite client on http://localhost:3331).
Automated tests (`bun test` — 114 passing tests), linter (`eslint`), and production build (`npm run build`) are all passing cleanly.
Test the following in the browser:

## 0. 1v1 Match Rooms, Countdown & Race to 10 Points

- [ ] Matchmaking & Room Creation (Window 1):
  - [ ] Open `http://localhost:3331` in an incognito or normal browser window.
  - [ ] Enter a nickname (e.g. "Alice") and click "JOIN GAME".
  - [ ] Verify you enter a match room with 3 wandering bots and default holes/trampolines.
  - [ ] Verify the top scoreboard HUD displays:
    - Yellow banner: `WAITING FOR OPPONENT (1/2)`.
    - Room details: `Room: room-xxxxx · Share invite link to play 1v1`.
    - Cyan `Copy Invite Link` button.
  - [ ] Click `Copy Invite Link`:
    - [ ] Button text updates to green `Link Copied!`.
    - [ ] Clipboard contains URL with `?room=room-xxxxx`.
- [ ] Direct Room Join (Window 2):
  - [ ] Open a second browser window (or separate tab) and paste the copied URL (`http://localhost:3331/?room=room-xxxxx`).
  - [ ] On the Start Screen, verify a badge displays: `🎯 JOINING ROOM: room-xxxxx`.
  - [ ] Enter a nickname (e.g. "Bob") and click "JOIN GAME".
- [ ] 10-Second Warmup & Countdown:
  - [ ] Upon Player 2 joining, both windows immediately update the top scoreboard to sky-blue: `MATCH STARTS IN 10s` with `Alice VS Bob`.
  - [ ] Verify the large animated countdown banner counts down `10, 9, 8, ... 1` with pop/pulse effects.
  - [ ] Verify free warmup roaming: both players can walk around, hit balls, and interact during the countdown.
- [ ] Match Start & Starting Tee Teleportation:
  - [ ] As countdown reaches 0s, verify:
    - [ ] Player 1 is automatically teleported to starting tee 1 `(1400, 1500)`.
    - [ ] Player 2 is automatically teleported to starting tee 2 `(1600, 1500)`.
    - [ ] A giant "MATCH START!" banner slams onto the screen and fades out.
    - [ ] Top scoreboard turns green: `Alice (You) 0 — RACE TO 10 — 0 Bob` (Window 1) and `Alice 0 — RACE TO 10 — 0 Bob (You)` (Window 2).
- [ ] Race to 10 Points (Frags + Holes):
  - [ ] Score a frag by striking a wandering bot or the opponent with a golf ball:
    - [ ] Victim enters knockdown state (blood stain).
    - [ ] Kill banner appears on screen: `X ELIMINATED Y`.
    - [ ] Striker's score increments by 1 on the top scoreboard.
  - [ ] Sink a golf ball into any hole:
    - [ ] Hole completion sound/banner plays.
    - [ ] Player's score increments by 1 on the top scoreboard.
- [ ] Victory / Defeat Modal & Rematch:
  - [ ] Reach 10 total points (`frags + holes = 10`):
    - [ ] Match status switches to `finished`.
    - [ ] Winner sees gold `VICTORY!` modal displaying winner name and final scorecard.
    - [ ] Loser sees crimson `DEFEAT` modal with scorecard.
    - [ ] Scoreboard header displays `🏆 [WINNER] WON THE MATCH!`.
  - [ ] Click `Rematch` button:
    - [ ] Both players return to `countdown` state for a fresh 10s countdown.
    - [ ] Scores reset to 0-0.
  - [ ] Click `Leave Room` button:
    - [ ] Returns to menu / reloads cleanly.


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

## 4. In-Game Menu, Online Player List, Color Selection & Settings

- [ ] Start Screen Color Selection:
  - [ ] Open `http://localhost:3331` in your browser.
  - [ ] On the start screen, verify the "PLAYER COLOR:" palette with 12 swatches is displayed.
  - [ ] Click different swatches (e.g. Purple, Teal, Lime) and observe the active highlight outline and hex code update.
  - [ ] Enter a nickname and click "JOIN GAME".
  - [ ] In-game, verify your character's shirt, golf ball owner ring, and name tag color dot match the selected color.
- [ ] Opening & Closing the Menu:
  - [ ] Verify the `⚙ MENU (ESC)` button is visible in the top-right HUD.
  - [ ] Click the button: the menu modal opens centered on screen.
  - [ ] Verify WASD movement and spacebar golf swing charging are blocked while the menu is open.
  - [ ] Press `Escape` or click the `✖ Close` button: menu closes and normal movement/swing control resumes.
  - [ ] Press `Escape` again to verify keyboard shortcut toggling.
- [ ] Players Tab:
  - [ ] Switch to `👥 Players` tab.
  - [ ] Verify total player count header (e.g. `ONLINE PLAYERS (9)`).
  - [ ] Verify the local player has a `[YOU]` tag and displays current FRAGS and Holes stats.
  - [ ] Verify wandering bots are listed with `[BOT]` tags, names, color swatches, and stats.
- [ ] Color Tab (Live Recolor):
  - [ ] Switch to `🎨 Color` tab.
  - [ ] Click a different color swatch from the palette.
  - [ ] Close the menu: character shirt, ball owner ring, and name tag dot are immediately updated to the newly selected color.
  - [ ] Refresh the page: start screen remembers the chosen color from `localStorage`.
- [ ] Settings Tab:
  - [ ] Switch to `⚙ Settings` tab.
  - [ ] Click through dummy settings:
    - Graphics Quality buttons (`Low`, `Medium`, `High`, `Ultra`).
    - Toggle Dynamic Shadows (`ON` / `OFF`).
    - Toggle Performance HUD (`ON` / `OFF`).
    - Toggle Aim Trajectory (`ON` / `OFF`).
    - Master Volume slider (drag or click between 0% and 100%).
  - [ ] Verify controls are interactive, maintain state, and do not trigger runtime errors.
