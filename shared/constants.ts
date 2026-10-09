/**
 * World size, in world units — a big plain open area with no obstacles.
 * At ~3000 units across it spans about 100 character footprints, so players
 * roam freely while each client's viewport shows only a window of it.
 */
export const WORLD_WIDTH = 3000;
export const WORLD_HEIGHT = 3000;

/**
 * Locked design viewbox dimensions (16:9).
 * Both Three.js camera frustum and PixiJS UI overlay are locked to this logical
 * viewport so browser zoom or window resizing cannot reveal more of the map.
 */
export const VIEWBOX_WIDTH = 1920;
export const VIEWBOX_HEIGHT = 1080;
export const VIEWBOX_ASPECT_RATIO = VIEWBOX_WIDTH / VIEWBOX_HEIGHT;

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
/** Character height in world units. Balls flying above this pass over players */
export const PLAYER_HEIGHT = 29;
/** Duration in seconds that a player stays despawned as a blood stain after being hit */
export const KNOCKDOWN_DURATION_SECONDS = 1.5;
/** Fraction of velocity kept when a golf ball bounces off a player — punchy arcade deflection */
export const BALL_PLAYER_RESTITUTION = 0.75;

/** Bun pub/sub topic every connected socket subscribes to for world-state broadcasts */
export const WORLD_TOPIC = "world";

/**
 * Static palette of distinct colors assigned to players.
 * When joining, players get a dedicated random color from this list.
 */
export const PLAYER_COLORS: readonly number[] = [
  0xef4444, // Red
  0x3b82f6, // Blue
  0x22c55e, // Green
  0xf59e0b, // Amber / Yellow
  0xa855f7, // Purple
  0xec4899, // Pink
  0x14b8a6, // Teal
  0xf97316, // Orange
  0x06b6d4, // Cyan
  0x84cc16, // Lime
  0xe11d48, // Rose
  0x8b5cf6, // Violet
];

/** Color used for bot off-screen indicators */
export const BOT_INDICATOR_COLOR = 0xffffff;

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

/** Game gravity (u/s²) — snappy arcade gravity for fast, punchy flight */
export const BALL_GRAVITY = 220;
/** Launch elevation of every shot, in radians (22.5° for low, screaming drives) */
export const BALL_LAUNCH_ANGLE = Math.PI / 8;
/** Carry (distance to the first ground contact) at minimal power, world units */
export const BALL_MIN_CARRY = 25;
/** Carry at full power — fast and rewarding across the open course */
export const BALL_MAX_CARRY = 350;
/** Power curve exponent: >1 makes low charges more precise for short shots */
export const BALL_POWER_EXP = 1.2;

/** Fraction of vertical speed kept on each bounce — crisp, elastic arcade bounce */
export const BALL_RESTITUTION = 0.55;
/** Fraction of horizontal speed kept on each bounce — skips forward with high speed */
export const BALL_BOUNCE_FRICTION = 0.75;
/** Below this downward speed (u/s) a landing stops bouncing and starts rolling */
export const BALL_MIN_BOUNCE_SPEED = 20;
/** Rolling deceleration on grass (u/s²) */
export const BALL_ROLL_DECEL = 95;
/** Rolling speed (u/s) below which the ball comes to rest */
export const BALL_REST_SPEED = 2;
/** Fraction of speed kept when bouncing off the field border — energetic ricochets */
export const BALL_WALL_RESTITUTION = 0.75;
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
