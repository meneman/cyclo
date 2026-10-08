# Manual Testing Checklist: Viewport Dimension Consistency & Edge Clamping

- [ ] Start the server and client (`npm run dev`)
- [ ] Open two browser windows at `http://localhost:3331`
- [ ] Join the game in both windows with different names
- [ ] Resize one browser window so it is narrow (e.g. width < 1000px, triggering minWidth scaling)
- [ ] Move the other player out of view towards each edge (top, bottom, left, right)
- [ ] Verify that the edge indicators clamp cleanly against the visual canvas edges without clipping or premature off-screen triggering
- [ ] Verify indicator angles point accurately towards the off-screen player from the true center of the screen
- [ ] Maximize or resize the window dynamically and ensure indicators immediately track the new boundaries correctly
