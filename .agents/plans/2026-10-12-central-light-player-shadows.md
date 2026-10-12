## Goal

Give each player a ground shadow that reads as cast from one central light hanging low above the map center, so shadows point radially outward and get long toward the map edges.

## Success Criteria

- Every visible player (character model and fallback dot) has a shadow on the ground.
- Shadow direction is away from the map center (`WORLD_WIDTH/2`, `WORLD_HEIGHT/2` in `shared/constants.ts`), updating as the player moves.
- Shadow length grows with distance from center and is tunable via a single "light height" value; default looks deliberately long (low-hanging light).
- Knocked-down players hide character + shadow and show only the blood stain (existing `setKnockdown` behavior in `src/app/screens/game/WorldScene.ts`).
- No regression to existing look, camera, animation, or networking; performance stays flat with ~12 players.

## Approach

Use fake projected blob shadows, plus a cheap central `PointLight` for illumination falloff — not real shadow maps.

Why, given the current code in `src/app/screens/game/WorldScene.ts`:

- Current renderer has shadow maps disabled; lighting is a hemisphere light plus a directional light, and the field is a standard material at `z=-1`.
- A real shadow-casting central light is the physically literal match for radial shadows, but it would need to cover the full 3000×3000 world from one low light at usable resolution, with per-frame shadow cost for every player. Over this world size that trades crispness for blur and cost.
- A per-player dark ellipse plane is the standard top-down/ortho trick: crisp at `CAMERA_ZOOM = 3`, no shadow-map cost, no acne on the skinned character clones, trivially tunable for the "hangs low, long shadows" look. A non-shadow-casting central point light still gives warm falloff from the center while the existing lights stay as base fill.

Rejected alternative: enabling `renderer.shadowMap` plus `castShadow`/`receiveShadow` on characters and field now — keep as an optional follow-up only if fake shadows look too flat in playtest.

## Steps

1. Central light definition (`WorldScene.ts` constructor):
   - Add `CENTRAL_LIGHT_HEIGHT` (~80–150 world units vs ~28u character height for long shadows) and color/intensity constants; place a non-shadow-casting point light at map center at that height with distance/decay falloff.
   - Keep existing hemisphere + directional lights untouched as fill; enable no shadow flags anywhere.
2. Pure shadow math helper (unit-testable like `yawForDirection` in `WorldScene.test.ts`):
   - `shadowForPlayer(x, y, lightHeight)` returns offset vector (away from center, world units) plus length/scale factor and opacity falloff.
   - Rule: `dir = normalize(player - center)`; `offset = dir * k * dist / lightHeight`; `length = base + m * dist / lightHeight`; center players get a short under-foot blob, edge players get long streaks.
3. Per-player shadow mesh lifecycle (`WorldScene.ts`):
   - `instantiate()`: create ellipse/gradient plane (scaled circle geometry, basic black material, transparent ~0.35, `depthWrite:false`), add to scene, store in `PlayerView`.
   - `move()` / `render()`: position at player ground pos + offset, rotate so the long axis points outward, scale by length factor.
   - `setKnockdown()`, `remove()`, `clear()`, `destroy()`: hide/dispose the shadow alongside the character; fallback dots use the same shadow path.
   - Keep z-order just above field/terrain (`z≈0.02`, below the range indicator at `0.03`) to avoid z-fighting.
4. Tune + tests:
   - Add a `WorldScene.shadow.test.ts` (`bun:test`) for center/edge/cardinal cases and continuity, following existing `WorldScene.test.ts` conventions.
   - Manual tune pass on light height, opacity, and length clamps so shadows stay visible but don't dominate at edge distances.

## Validation Plan

- `bun test src/app/screens/game/WorldScene.shadow.test.ts` — offset direction is radially outward, length increases with radius, zero-dist case is a centered short blob.
- `npm run lint` and `tsc` — no type/lint regressions.
- Manual two-window playtest (`npm run dev:server` + `npm run dev`): spawn near center vs near border, confirm shadows point away from center and edge shadows are clearly longer; check knockdown hides the shadow, reconnect/respawn restores it, camera follow unchanged.

## Risks / Open Questions

- Risk: ellipse blobs can look flat vs true projected character silhouettes. Mitigation: stretch + soften opacity with distance; real shadow maps remain a follow-up, not this change.
- Risk: overly long/opaque shadows clutter team fights at edges. Mitigation: clamp max length and fade opacity with distance; single tunable constants.
- Open question: none blocking — assuming shadows for players only (not balls, holes, trampolines, clubs) in v1; say so if balls should also cast.
