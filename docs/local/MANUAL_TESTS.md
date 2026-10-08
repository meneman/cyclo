# Manual tests — Golf Ball Hit, 3D Flight & Multiplayer Synchronization

Start the dev loop: `npm run dev` (starts server on port 3332 and client on
http://localhost:3331). Automated test suite (`bun test`), linter (`eslint`), and
production build (`vite build`) are all passing cleanly. Test the following in the browser:

## Golf Ball Hit & 3D Flight Dynamics

- [ ] Open `http://localhost:3331` in two browser windows.
- [ ] **Ball Spawn & Owner Color Ring**:
      - Each joining player spawns with their own dimpled golf ball resting right in front of them in their hit zone.
      - Each ball has a colored ring matching its owner's player color.
- [ ] **Range Indicator Ring**:
      - Look at the circle on the turf near the player's front-right club position:
      - When standing at address next to the ball, the ring lights up **bright green**.
      - Walk away from the ball: the ring turns **faint white**.
- [ ] **Landing Marker**:
      - Press and hold `Space`:
      - An amber cross appears on the grass ahead along your facing direction, indicating the predicted landing spot.
      - As charge builds towards MAX (100%), the landing marker moves further away (up to 300 units).
- [ ] **Swing Impact Timing**:
      - Release `Space`:
      - Notice the ball does not fly off instantly on release; it waits ~110 ms until the club downswing sweeps down to the ball, matching the visual hit.
- [ ] **3D Ball Flight, Height & Shadow**:
      - Watch the ball launch in a 3D arc:
      - The ball grows larger as it climbs higher into the air (perspective depth).
      - The shadow remains on the ground, sliding away along the sun angle, shrinking and fading as the ball reaches peak altitude.
      - When the ball touches down, it bounces with reduced speed, bounces again, rolls along the turf with deceleration, and comes to rest.
- [ ] **Whiff (Missed Shot)**:
      - Walk away from any ball (indicator is faint white).
      - Charge and release `Space`:
      - The swing animation plays normally, but no ball is hit.
- [ ] **Multiplayer Ball Sharing & Dead Reckoning**:
      - In window 2, walk over to player 1's ball (the range indicator lights up green).
      - Hit player 1's ball: both windows see the ball launch, arc through the air, bounce, and roll in real time without teleporting or jitter.
