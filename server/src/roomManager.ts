import type { Server } from "bun";
import { MatchStatus } from "../../shared/types";
import type { SocketData } from "./world";
import { World } from "./world";

export class RoomManager {
  private readonly rooms = new Map<string, World>();
  private server: Server<SocketData> | null = null;

  public setServer(server: Server<SocketData>): void {
    this.server = server;
  }

  public getOrCreateRoom(requestedRoomId?: string): World {
    if (requestedRoomId && requestedRoomId.trim().length > 0) {
      const id = requestedRoomId.trim().slice(0, 32);
      let room = this.rooms.get(id);
      if (!room) {
        room = new World(id);
        this.rooms.set(id, room);
        if (this.server) room.start(this.server);
        console.log(
          `[golfi:rooms] created custom room "${id}" (total rooms: ${this.rooms.size})`,
        );
      }
      return room;
    }

    // Matchmaking: Find an existing room in Waiting status with 1 player
    for (const room of this.rooms.values()) {
      if (
        room.getPlayerCount() === 1 &&
        room.getMatchState().status === MatchStatus.Waiting
      ) {
        console.log(
          `[golfi:rooms] matched player into existing room "${room.id}"`,
        );
        return room;
      }
    }

    // Otherwise, create a new room with a random 6-character code
    const newId = Math.random().toString(36).substring(2, 8);
    const room = new World(newId);
    this.rooms.set(newId, room);
    if (this.server) room.start(this.server);
    console.log(
      `[golfi:rooms] created new matchmaking room "${newId}" (total rooms: ${this.rooms.size})`,
    );
    return room;
  }

  public getRoom(roomId: string): World | undefined {
    return this.rooms.get(roomId);
  }

  public removePlayer(playerId: string, roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.removePlayer(playerId);
    if (room.getPlayerCount() === 0) {
      room.stop();
      this.rooms.delete(roomId);
      console.log(
        `[golfi:rooms] closed empty room "${roomId}" (active rooms: ${this.rooms.size})`,
      );
    }
  }

  public getRoomCount(): number {
    return this.rooms.size;
  }
}
