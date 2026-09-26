import type { ModelId } from "./models";

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: ModelId;
  usage?: Usage;
  /** Request start to last byte. */
  durationMs?: number;
  /** First token to last byte, used for tokens/sec. */
  streamMs?: number;
  status?: "streaming" | "done" | "stopped" | "error";
  error?: string;
}

export interface Conversation {
  id: string;
  title: string;
  model: ModelId;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export type StreamEvent =
  | { type: "text"; delta: string }
  | ({ type: "usage" } & Usage)
  | { type: "done" }
  | { type: "error"; message: string };
