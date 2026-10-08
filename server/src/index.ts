import { WORLD_TOPIC } from "../../shared/constants";
import { parseClientMessage } from "../../shared/protocol";

import type { SocketData } from "./world";
import { World } from "./world";

const PORT = Number(process.env.PORT ?? 3332);

const world = new World();

const server = Bun.serve<SocketData>({
  port: PORT,
  fetch(req, srv) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      const playerId = crypto.randomUUID();
      const upgraded = srv.upgrade(req, { data: { playerId } });
      return upgraded
        ? undefined
        : new Response("WebSocket upgrade failed", { status: 400 });
    }

    if (url.pathname === "/health") {
      return new Response("ok");
    }

    return new Response("Not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      console.log(`[cyclo:ws] open ${ws.data.playerId}`);
      ws.subscribe(WORLD_TOPIC);
      world.addPlayer(ws.data.playerId, ws);
    },
    message(ws, raw) {
      const message = parseClientMessage(raw);
      if (!message) {
        console.warn(
          `[cyclo:ws] dropped malformed message from ${ws.data.playerId}`,
        );
        return;
      }
      world.handleMessage(ws.data.playerId, message);
    },
    close(ws) {
      console.log(`[cyclo:ws] close ${ws.data.playerId}`);
      world.removePlayer(ws.data.playerId);
    },
  },
});

world.start(server);

console.log(`cyclo server listening on ws://localhost:${server.port}/ws`);
