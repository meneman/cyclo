import type { ClientMessage, ServerMessage } from "../../shared/protocol";

export type ServerMessageHandler = (message: ServerMessage) => void;
export type ConnectionStateHandler = (connected: boolean) => void;

const RECONNECT_DELAY_MS = 1500;

/**
 * Thin wrapper around a browser WebSocket: typed send/receive, JSON framing,
 * and automatic reconnect. Screens don't touch the raw socket directly.
 */
export class NetworkClient {
  private socket: WebSocket | null = null;
  private shouldReconnect = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;

  private readonly messageHandlers = new Set<ServerMessageHandler>();
  private readonly connectionHandlers = new Set<ConnectionStateHandler>();

  constructor(private readonly url: string) {}

  public connect(): void {
    this.shouldReconnect = true;
    this.open();
  }

  public disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
  }

  public send(message: ClientMessage): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(message));
  }

  /** Monotonically increasing sequence number for input messages */
  public nextSeq(): number {
    return ++this.seq;
  }

  public onMessage(handler: ServerMessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  public onConnectionChange(handler: ConnectionStateHandler): () => void {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }

  private open(): void {
    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.addEventListener("open", () => {
      for (const handler of this.connectionHandlers) handler(true);
    });

    socket.addEventListener("message", (event: MessageEvent<unknown>) => {
      const message = parseServerMessage(event.data);
      if (!message) return;
      for (const handler of this.messageHandlers) handler(message);
    });

    socket.addEventListener("close", () => {
      for (const handler of this.connectionHandlers) handler(false);
      if (!this.shouldReconnect) return;
      this.reconnectTimer = setTimeout(() => this.open(), RECONNECT_DELAY_MS);
    });

    socket.addEventListener("error", () => socket.close());
  }
}

function parseServerMessage(data: unknown): ServerMessage | null {
  if (typeof data !== "string") return null;
  try {
    return JSON.parse(data) as ServerMessage;
  } catch {
    return null;
  }
}
