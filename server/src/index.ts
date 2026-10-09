import { parseClientMessage } from "../../shared/protocol";
import { RoomManager } from "./roomManager";
import type { SocketData } from "./world";

const PORT = Number(process.env.PORT ?? 3332);

const roomManager = new RoomManager();

const server = Bun.serve<SocketData>({
  port: PORT,
  fetch(req, srv) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      const playerId = crypto.randomUUID();
      const requestedRoom = url.searchParams.get("room") || undefined;
      const upgraded = srv.upgrade(req, {
        data: { playerId, requestedRoom },
      });
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
      const room = roomManager.getOrCreateRoom(ws.data.requestedRoom);
      ws.data.roomId = room.id;
      console.log(
        `[golfi:ws] open ${ws.data.playerId} in room "${room.id}" (topic: ${room.topic})`,
      );
      ws.subscribe(room.topic);
      room.addPlayer(ws.data.playerId, ws);
    },
    message(ws, raw) {
      const message = parseClientMessage(raw);
      if (!message) {
        console.warn(
          `[golfi:ws] dropped malformed message from ${ws.data.playerId}`,
        );
        return;
      }
      const room = roomManager.getRoom(ws.data.roomId ?? "");
      if (room) {
        room.handleMessage(ws.data.playerId, message);
      }
    },
    close(ws) {
      console.log(
        `[golfi:ws] close ${ws.data.playerId} from room "${ws.data.roomId}"`,
      );
      if (ws.data.roomId) {
        roomManager.removePlayer(ws.data.playerId, ws.data.roomId);
      }
    },
  },
});

roomManager.setServer(server);

console.log(`golfi server listening on ws://localhost:${server.port}/ws`);
