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
export const PLAYER_SPEED = 180;
export const PLAYER_RADIUS = 14; // visual size (marker, world-bound clamp)

/** Bun pub/sub topic every connected socket subscribes to for world-state broadcasts */
export const WORLD_TOPIC = "world";

/** Time in seconds of holding Space required to reach 100% swing power */
export const MAX_CHARGE_DURATION_SECONDS = 1.5;

/** Duration of the active golf swing animation in seconds */
export const SWING_ANIMATION_DURATION_SECONDS = 0.32;

/**
 * Fraction of the swing animation spent on the downswing — the club reaches
 * the ball at the end of it. Shared so the client animation and the server's
 * impact timing stay in lockstep.
 */
export const SWING_DOWNSWING_RATIO = 0.35;

/**
 * Seconds from releasing Space until the club meets the ball (~0.11s). The
 * hit is resolved at this moment, not on release, so it matches the
 * animation — and the delay also hides most of the network round trip.
 * Movement stays locked during the downswing.
 */
export const IMPACT_DELAY_SECONDS =
  SWING_ANIMATION_DURATION_SECONDS * SWING_DOWNSWING_RATIO;

// ── Golf ball ────────────────────────────────────────────────────────────

/**
 * Ball radius in world units. Deliberately oversized: true scale next to the
 * ~29u characters would be ~0.35u, about 2 screen px.
 */
export const BALL_RADIUS = 1.5;

/** Game gravity (u/s²) — tuned for ~1.6s hang time on a full shot, not realism */
export const BALL_GRAVITY = 135;
/** Launch elevation of every shot, in radians (45°) */
export const BALL_LAUNCH_ANGLE = Math.PI / 4;
/** Carry (distance to the first ground contact) at minimal power, world units */
export const BALL_MIN_CARRY = 20;
/** Carry at full power — a tenth of the field width */
export const BALL_MAX_CARRY = 300;
/** Power curve exponent: >1 makes low charges more precise for short shots */
export const BALL_POWER_EXP = 1.2;

/** Fraction of vertical speed kept on each bounce */
export const BALL_RESTITUTION = 0.3;
/** Fraction of horizontal speed kept on each bounce */
export const BALL_BOUNCE_FRICTION = 0.6;
/** Below this downward speed (u/s) a landing stops bouncing and starts rolling */
export const BALL_MIN_BOUNCE_SPEED = 15;
/** Rolling deceleration on grass (u/s²) */
export const BALL_ROLL_DECEL = 120;
/** Rolling speed (u/s) below which the ball comes to rest */
export const BALL_REST_SPEED = 2;
/** Fraction of speed kept when bouncing off the field border */
export const BALL_WALL_RESTITUTION = 0.5;
/** Fixed physics sub-step (s) — server ticks and client frames both split into these */
export const BALL_SUBSTEP_SECONDS = 1 / 240;

// ── Hit zone ─────────────────────────────────────────────────────────────

/**
 * Center of the hit zone in the player's local frame: `forward` along the
 * facing, `right` toward the player's right hand (the club side). Tune these
 * visually so the zone sits where the club head bottoms out.
 */
export const HIT_OFFSET_FORWARD = 18;
export const HIT_OFFSET_RIGHT = 6;
/** Hit zone radius — a ball whose edge touches this circle can be hit */
export const HIT_RADIUS = 12;
