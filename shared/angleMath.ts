/** Shortest signed angular distance from `a` to `b`, in radians, range (-π, π] */
export function shortestAngleDelta(a: number, b: number): number {
  return ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
}

/** Wraps an arbitrary-magnitude radian angle back into (-π, π] */
export function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/** Eases angle `a` toward `b` by fraction `t`, along the shortest path */
export function lerpAngle(a: number, b: number, t: number): number {
  return a + shortestAngleDelta(a, b) * t;
}
