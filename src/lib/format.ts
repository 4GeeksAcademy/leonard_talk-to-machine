import type { Conversation } from "./types";

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function formatDuration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function relativeTime(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleDateString();
}

export function conversationTotals(conv: Conversation) {
  let input = 0;
  let output = 0;
  let cached = 0;
  let turns = 0;
  let streamMs = 0;
  let streamedOutput = 0;
  for (const m of conv.messages) {
    if (m.role !== "assistant" || !m.usage) continue;
    turns++;
    input += m.usage.inputTokens;
    output += m.usage.outputTokens;
    cached += m.usage.cachedInputTokens;
    if (m.streamMs && m.streamMs > 0) {
      streamMs += m.streamMs;
      streamedOutput += m.usage.outputTokens;
    }
  }
  return {
    input,
    output,
    cached,
    total: input + output,
    turns,
    tokensPerSecond: streamMs > 0 ? streamedOutput / (streamMs / 1000) : 0,
  };
}
