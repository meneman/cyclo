/**
 * World size, in world units — a big plain open area with no obstacles.
 * At ~3000 units across it spans about 100 character footprints, so players
 * roam freely while each client's viewport shows only a window of it.
 */
export const WORLD_WIDTH = 3000;
export const WORLD_HEIGHT = 3000;

/** Server simulation rate */
export const TICK_RATE_HZ = 20;
export const TICK_INTERVAL_MS = 1000 / TICK_RATE_HZ;

/** How often the client re-sends its current input to the server */
export const INPUT_SEND_RATE_HZ = 20;
export const INPUT_SEND_INTERVAL_MS = 1000 / INPUT_SEND_RATE_HZ;

/** How far in the past the client renders remote players, to smooth out jitter */
export const INTERPOLATION_DELAY_MS = 100;

/** Constant movement speed, world units per second */
export const PLAYER_SPEED = 260;
export const PLAYER_RADIUS = 14; // visual size (marker, world-bound clamp)

/** Bun pub/sub topic every connected socket subscribes to for world-state broadcasts */
export const WORLD_TOPIC = "world";

/** Time in seconds of holding Space required to reach 100% swing power */
export const MAX_CHARGE_DURATION_SECONDS = 1.5;

/** Duration of the active golf swing animation in seconds */
export const SWING_ANIMATION_DURATION_SECONDS = 0.32;
