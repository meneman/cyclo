/**
 * Using a relative URL scheme ensures that WebSocket connections work whether
 * accessed directly via the dev server (which proxies /ws to the Bun server)
 * or through reverse proxies (e.g. Zoraxy on cyclo.wohnli.com).
 */
export function resolveWsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}
