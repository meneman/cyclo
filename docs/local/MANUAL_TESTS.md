# Manual tests — Round 3D Golf Swing & Body Coil

Start the dev loop: `npm run dev` (starts server on port 3332 and client on
http://localhost:3331). Automated test suite (`bun test`), linter (`eslint`), and
production build (`vite build`) are all passing cleanly. Test the following in the browser:

## Round, Golf-like Swing Dynamics

- [ ] Open `http://localhost:3331` in two browser windows.
- [ ] **3D Circular Backswing (Ausholen)**:
      Press and hold `Space`:
      - Notice the club does not just move straight back like a pendulum:
      - The club sweeps in a **round circular arc** wide to the right side of the character's body.
      - The character's torso visibly coils ~15° back into the turn.
      - The wrists hinge naturally as the club lifts high behind the right shoulder.
- [ ] **Sweeping Downswing & Impact**:
      Release `Space`:
      - The club sweeps along the round inclined swing plane from behind the shoulder, dipping down across the turf in front.
      - The torso rapidly uncoils and turns toward the target direction.
- [ ] **Wrap-around Follow-Through**:
      - After impact in front, the clubhead wraps around the left side of the body in a circular arc.
      - It reaches a high finish over the lead shoulder, with the character's hips/torso turned through into the shot.
      - The club and torso smoothly settle back into the relaxed carrying stance.
- [ ] **Varying swing power**:
      - **Short tap on Space**: Compact, gentle tap with subtle round takeaway and short finish.
      - **Full hold ("MAX")**: Wide, full-turn backswing coil and explosive wrap-around finish.
- [ ] **Multiplayer synchronization**:
      In window 2, watch player 1 swinging in window 1:
      - Player 2 sees the full 3D round swing arc and torso turn of player 1 in real time.
