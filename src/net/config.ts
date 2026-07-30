/**
 * The Bun server always runs on its own port, separate from the Vite dev
 * server / static build. Deriving the host from `window.location` (instead
 * of hardcoding `localhost`) lets you open the game from another device on
 * the same network and still reach the right machine.
 */
const WS_PORT = 3001;

export function resolveWsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.hostname}:${WS_PORT}/ws`;
}
