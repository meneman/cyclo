/** Which map under public/maps/<name>/ (map.svg + collision.bin + collision.meta.json) to load */
export const MAP_NAME = "neustadt";
/**
 * SVG rasterization density multiplier. Shared by the offline collision-map
 * generator (scripts/generate-collision-map.mjs, via sharp) and the client's
 * `Assets.load` SVG resolution option, so the background texture and the
 * collision mask are rasterized from the same source.svg at the same scale
 * and land on the exact same pixel grid.
 */
export const MAP_RENDER_SCALE = 2;
/** maps/{MAP_NAME}/source.svg's native viewBox size, in SVG user units */
const MAP_NATIVE_WIDTH = 1234;
const MAP_NATIVE_HEIGHT = 924;
/** Must match public/maps/{MAP_NAME}/collision.meta.json dimensions */
export const WORLD_WIDTH = MAP_NATIVE_WIDTH * MAP_RENDER_SCALE;
export const WORLD_HEIGHT = MAP_NATIVE_HEIGHT * MAP_RENDER_SCALE;

/** Server simulation rate */
export const TICK_RATE_HZ = 20;
export const TICK_INTERVAL_MS = 1000 / TICK_RATE_HZ;

/** How often the client re-sends its current input to the server */
export const INPUT_SEND_RATE_HZ = 20;
export const INPUT_SEND_INTERVAL_MS = 1000 / INPUT_SEND_RATE_HZ;

/** How far in the past the client renders remote players, to smooth out jitter */
export const INTERPOLATION_DELAY_MS = 100;

export const PLAYER_MAX_SPEED = 260; // top forward speed, world units per second
/** How fast speed ramps toward PLAYER_MAX_SPEED while any directional input is
 *  held, units/sec². Tunable: reaches max speed from a stop in ~0.65s. */
export const PLAYER_ACCELERATION = 400;
/** How fast speed decays toward 0 with no input held (coasting friction),
 *  units/sec². Tunable: coasts to a stop from max speed in ~0.52s. */
export const PLAYER_FRICTION = 500;
/** Turn rate used near-stationary — how tightly the bike can pivot at low
 *  speed, rad/sec. Tunable. */
export const PLAYER_MAX_TURN_RATE = 4.0;
/** Turn rate used at PLAYER_MAX_SPEED — wide turning radius at top speed,
 *  rad/sec. Tunable. */
export const PLAYER_MIN_TURN_RATE = 1.0;
/** Speed shed per radian of heading actually turned in a tick — "turning
 *  slows you down a little". Units/sec per radian. Tunable. */
export const TURN_SPEED_PENALTY_PER_RADIAN = 40;
export const PLAYER_RADIUS = 14; // visual size (sprite, world-bound clamp)
/**
 * Radius used for the street-collision check — deliberately smaller than
 * PLAYER_RADIUS, since a full-size hitbox gets stuck in the narrower streets.
 * Keeps the bike's visual size while still fitting through tight spots.
 */
export const COLLISION_RADIUS = 4;
/**
 * Radius required when picking a *spawn* point — bigger than COLLISION_RADIUS
 * on purpose. A point can pass the small movement-collision disc check while
 * sitting right at a building corner with zero room to move (every direction,
 * including diagonals, immediately pokes the disc rim into a wall). Requiring
 * a larger clear radius here guarantees new players land somewhere with
 * actual room, not just a technically-legal pixel.
 */
export const SPAWN_CLEARANCE_RADIUS = COLLISION_RADIUS * 3;
/** How long a jump (Space) ignores collision, in seconds */
export const JUMP_DURATION_SECONDS = 0.5;

/** Bun pub/sub topic every connected socket subscribes to for world-state broadcasts */
export const WORLD_TOPIC = "world";
