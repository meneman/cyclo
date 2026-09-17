/**
 * Minimal ambient declarations for Bun's test runner, so the root
 * `tsc --noEmit` (which has no bun-types on its module path) can check the
 * colocated `*.test.ts` files. At runtime Bun provides the real module.
 */
declare module "bun:test" {
  export function describe(name: string, fn: () => void): void;
  export function test(name: string, fn: () => void | Promise<void>): void;
}
