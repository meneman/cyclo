import { storage } from "../../engine/utils/storage";

const KEY_CHAT_HISTORY = "chat-history";
const MAX_MESSAGES = 100;

export interface ChatMessage {
  name: string;
  text: string;
}

/** Chat log persisted client-side only — the server never stores history */
export function loadChatHistory(): ChatMessage[] {
  const raw = storage.getString(KEY_CHAT_HISTORY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

/** Appends a message, trimming the saved log to the last MAX_MESSAGES */
export function appendChatMessage(message: ChatMessage): void {
  const history = [...loadChatHistory(), message].slice(-MAX_MESSAGES);
  storage.setString(KEY_CHAT_HISTORY, JSON.stringify(history));
}
