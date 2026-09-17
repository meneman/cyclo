/** Open-arena size, in world units — no map, free movement on a black canvas. */
export const WORLD_WIDTH = 2468;
export const WORLD_HEIGHT = 1848;

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
/** How long a jump (Space) lasts, in seconds (visual only — no collision to ignore) */
export const JUMP_DURATION_SECONDS = 0.5;

/** Bun pub/sub topic every connected socket subscribes to for world-state broadcasts */
export const WORLD_TOPIC = "world";
