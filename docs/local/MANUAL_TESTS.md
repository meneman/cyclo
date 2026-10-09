# Manual tests — Big KILL Monitor Banner & FRAGS / Holes Side Stats (2026-10-09)

Start the dev loop: `npm run dev` (starts Bun server on port 3332 and Vite client on http://localhost:3331).
Automated tests (`bun test` — 86 passing tests), linter (`eslint`), and client build (`vite build`) are all passing cleanly.
Test the following in the browser:

## 1. Side Stats Display (FRAGS & Holes)

- [ ] Open `http://localhost:3331` in your browser and enter the game.
- [ ] Look at the top-right side of the screen below the connection text.
- [ ] Verify the side stats panel is visible with dark rounded background and clear text:
  - `FRAGS: 0` (bright red)
  - `Holes: 0` (bright green)
- [ ] Toggle debug readout with the backquote key (` ` `) and verify the stats panel and debug readout do not overlap.

## 2. Big "KILL" Monitor Banner & FRAGS Increment

- [ ] Walk up to your golf ball near a bot (e.g. `Bot Arnie` or `Bot Tiger` near spawn/Clubhouse).
- [ ] Face the bot or aim with your mouse toward the bot.
- [ ] Hold `Space` to charge swing power, then release to strike the ball:
  - [ ] Sound `card-slide-2.ogg` plays as the ball is struck.
- [ ] When your ball strikes a bot:
  - [ ] Sound `card-place-3.ogg` plays on impact.
  - [ ] The victim bot turns into a blood stain on the ground for 1.5 seconds.
  - [ ] A big, bold, vibrant red **"KILL"** banner slams onto the upper center of the monitor with punchy scale animation (1.5x down to 1.0x).
  - [ ] Directly below "KILL", the subtitle displays `+1 FRAG · ELIMINATED <BOT_NAME>`.
  - [ ] The banner holds steady for ~1 second, then smoothly fades out.
  - [ ] Chat displays a system announcement: `<YourName> killed <BotName>!`.
  - [ ] On the side stats panel, `FRAGS:` increments from `0` to `1` (and continues incrementing on subsequent kills).

## 3. Holes Sinking & Scoring (Direct Landing & Rolling)

- [ ] Locate one of the black hole circles on the course (e.g. on fairways or greens).
- [ ] Test **direct landing from the air**: Aim a shot so the ball's arc lands directly on/inside the hole circle:
  - [ ] As soon as the ball descends and touches down inside the hole radius, it is immediately captured (stops in the cup without bouncing past).
  - [ ] Chat announces: `<YourName> sunk a hole! (<count> total)`.
  - [ ] On the side stats panel, `Holes:` increments by 1.
  - [ ] Your ball resets resting at your feet ready for your next shot.
  - [ ] The sunk hole relocates to a fresh random location on the course.
- [ ] Test **rolling into the hole**: Hit a putt or chip that rolls across the turf into a hole circle:
  - [ ] Ball drops in upon crossing the hole radius, awarding +1 hole point and resetting the ball.

## 4. Sound Effects (@pixi/sound)

- [ ] Verify `card-slide-2.ogg` plays whenever a golf ball is struck (by local player, other players, or bots).
- [ ] Verify `card-place-3.ogg` plays whenever any player or bot is struck/eliminated by a golf ball.
