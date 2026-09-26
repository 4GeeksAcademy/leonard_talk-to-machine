"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { formatDuration } from "@/lib/format";
import { MODELS, modelLabel, type ModelId } from "@/lib/models";
import type { Conversation, Message } from "@/lib/types";
import { Markdown } from "./Markdown";

interface Props {
  conversation: Conversation;
  isStreaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  onModelChange: (model: ModelId) => void;
  onOpenHistory: () => void;
  onOpenUsage: () => void;
}

function ReplyMeta({ m }: { m: Message }) {
  const parts: string[] = [modelLabel(m.model ?? "")];
  if (m.usage) {
    parts.push(`${m.usage.inputTokens.toLocaleString()} in`, `${m.usage.outputTokens.toLocaleString()} out`);
  } else if (m.status !== "streaming") {
    parts.push("usage unavailable");
  }
  if (m.durationMs !== undefined) parts.push(formatDuration(m.durationMs));
  if (m.status === "stopped") parts.push("stopped");
  return <div className="mt-2 text-xs text-zinc-500 tabular-nums">{parts.join(" · ")}</div>;
}

export function ChatPanel({ conversation, isStreaming, onSend, onStop, onModelChange, onOpenHistory, onOpenUsage }: Props) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const last = conversation.messages[conversation.messages.length - 1];

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversation.id, conversation.messages.length, last?.content]);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;
    onSend(text);
    setInput("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-col">
      <header className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2.5">
        <button
          type="button"
          onClick={onOpenHistory}
          className="rounded-md px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-800 lg:hidden"
          aria-label="Open history"
        >
          ☰
        </button>
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-100">{conversation.title}</h1>
        <select
          value={conversation.model}
          onChange={(e) => onModelChange(e.target.value as ModelId)}
          disabled={isStreaming}
          aria-label="Model"
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 disabled:opacity-50"
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onOpenUsage}
          className="rounded-md px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-800 lg:hidden"
          aria-label="Open token usage"
        >
          ▤
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
          {conversation.messages.length === 0 && (
            <div className="pt-24 text-center text-zinc-500">
              <p className="text-lg text-zinc-300">Talk to the machine</p>
              <p className="mt-1 text-sm">Pick a model and send a message.</p>
            </div>
          )}
          {conversation.messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={m.id} className="text-sm text-zinc-200">
                {m.content ? (
                  <Markdown>{m.content}</Markdown>
                ) : m.status === "streaming" ? (
                  <span className="inline-block h-4 w-2 animate-pulse bg-zinc-400" />
                ) : null}
                {m.status === "error" && (
                  <div className="mt-2 rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-xs text-red-300">
                    {m.error}
                  </div>
                )}
                {m.status !== "error" && <ReplyMeta m={m} />}
              </div>
            ),
          )}
        </div>
      </div>

      <form onSubmit={submit} className="border-t border-zinc-800 p-3">
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-xl border border-zinc-700 bg-zinc-900 p-2 focus-within:border-zinc-500">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Send a message…"
            className="max-h-48 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              className="rounded-lg bg-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-white"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="rounded-lg bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-white disabled:opacity-40"
            >
              Send
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
