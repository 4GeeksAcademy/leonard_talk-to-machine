import { isModelId } from "@/lib/models";
import type { StreamEvent } from "@/lib/types";

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MAX_MESSAGES = 100;
const MAX_MESSAGE_CHARS = 20_000;
const MAX_TOTAL_CHARS = 200_000;

type ChatMessage = { role: "user" | "assistant"; content: string };

function parseBody(body: unknown): { model: string; messages: ChatMessage[] } | string {
  if (typeof body !== "object" || body === null) return "Invalid request body.";
  const { model, messages } = body as { model?: unknown; messages?: unknown };
  if (!isModelId(model)) return "Unsupported model.";
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return `Messages must be a non-empty array of at most ${MAX_MESSAGES} items.`;
  }
  let total = 0;
  const clean: ChatMessage[] = [];
  for (const m of messages) {
    const { role, content } = (m ?? {}) as { role?: unknown; content?: unknown };
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
      return "Each message needs a role of 'user' or 'assistant' and string content.";
    }
    if (content.length > MAX_MESSAGE_CHARS) return "A message is too long.";
    total += content.length;
    clean.push({ role, content });
  }
  if (total > MAX_TOTAL_CHARS) return "Conversation is too long.";
  if (clean[clean.length - 1].role !== "user") return "The last message must be from the user.";
  return { model, messages: clean };
}

export async function POST(req: Request) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "NVIDIA_API_KEY is not set on the server." }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const parsed = parseBody(body);
  if (typeof parsed === "string") return Response.json({ error: parsed }, { status: 400 });

  let upstream: Response;
  try {
    upstream = await fetch(NVIDIA_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model: parsed.model,
        messages: parsed.messages,
        stream: true,
        stream_options: { include_usage: true },
        max_tokens: 2048,
      }),
      signal: req.signal,
    });
  } catch {
    return Response.json({ error: "Could not reach the NVIDIA API." }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    const message =
      upstream.status === 401 || upstream.status === 403
        ? "NVIDIA API rejected the API key."
        : upstream.status === 429
          ? "NVIDIA API rate limit reached. Try again shortly."
          : `NVIDIA API error (${upstream.status}).`;
    console.error("NVIDIA API error", upstream.status, await upstream.text().catch(() => ""));
    return Response.json({ error: message }, { status: 502 });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";

  const emit = (controller: TransformStreamDefaultController<Uint8Array>, event: StreamEvent) =>
    controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));

  // Convert OpenAI-style SSE into newline-delimited JSON events for the client.
  const handleLine = (line: string, controller: TransformStreamDefaultController<Uint8Array>) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") return;
    let chunk;
    try {
      chunk = JSON.parse(data);
    } catch {
      return;
    }
    const delta = chunk.choices?.[0]?.delta?.content;
    if (typeof delta === "string" && delta) emit(controller, { type: "text", delta });
    if (chunk.usage) {
      emit(controller, {
        type: "usage",
        inputTokens: chunk.usage.prompt_tokens ?? 0,
        outputTokens: chunk.usage.completion_tokens ?? 0,
        cachedInputTokens: chunk.usage.prompt_tokens_details?.cached_tokens ?? 0,
      });
    }
  };

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) handleLine(line, controller);
    },
    flush(controller) {
      buffer += decoder.decode();
      if (buffer) handleLine(buffer, controller);
      emit(controller, { type: "done" });
    },
  });

  return new Response(upstream.body.pipeThrough(transform), {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
