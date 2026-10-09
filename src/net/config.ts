/**
 * Using a relative URL scheme ensures that WebSocket connections work whether
 * accessed directly via the dev server (which proxies /ws to the Bun server)
 * or through reverse proxies (e.g. Zoraxy on golfi.wohnli.com).
 */
export function resolveWsUrl(customRoomId?: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const params = new URLSearchParams(window.location.search);
  const room = customRoomId ?? params.get("room");
  const query = room ? `?room=${encodeURIComponent(room)}` : "";
  return `${protocol}//${window.location.host}/ws${query}`;
}

export function getUrlRoomId(): string | null {
  return new URLSearchParams(window.location.search).get("room");
}
