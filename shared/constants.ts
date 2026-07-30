/** Top-down world dimensions, in world units (pixels at 1:1 zoom) */
export const WORLD_WIDTH = 4000;
export const WORLD_HEIGHT = 4000;

/** Server simulation rate */
export const TICK_RATE_HZ = 20;
export const TICK_INTERVAL_MS = 1000 / TICK_RATE_HZ;

/** How often the client re-sends its current input to the server */
export const INPUT_SEND_RATE_HZ = 20;
export const INPUT_SEND_INTERVAL_MS = 1000 / INPUT_SEND_RATE_HZ;

/** How far in the past the client renders remote players, to smooth out jitter */
export const INTERPOLATION_DELAY_MS = 100;

export const PLAYER_SPEED = 260; // world units per second
export const PLAYER_RADIUS = 18;

/** Bun pub/sub topic every connected socket subscribes to for world-state broadcasts */
export const WORLD_TOPIC = "world";
