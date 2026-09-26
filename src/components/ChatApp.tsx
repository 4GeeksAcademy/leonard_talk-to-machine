"use client";

import { useRef, useState } from "react";
import { DEFAULT_MODEL, type ModelId } from "@/lib/models";
import type { Conversation, Message, StreamEvent } from "@/lib/types";
import { ChatPanel } from "./ChatPanel";
import { HistoryPanel } from "./HistoryPanel";
import { UsagePanel } from "./UsagePanel";

function newConversation(model: ModelId = DEFAULT_MODEL): Conversation {
  const now = Date.now();
  return { id: crypto.randomUUID(), title: "New chat", model, messages: [], createdAt: now, updatedAt: now };
}

export function ChatApp() {
  const [conversations, setConversations] = useState<Conversation[]>(() => [newConversation()]);
  const [activeId, setActiveId] = useState(() => conversations[0].id);
  const [streaming, setStreaming] = useState<{ conversationId: string } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const active = conversations.find((c) => c.id === activeId) ?? conversations[0];

  function updateConversation(id: string, fn: (c: Conversation) => Conversation) {
    setConversations((cs) => cs.map((c) => (c.id === id ? fn(c) : c)));
  }

  function patchMessage(convId: string, msgId: string, patch: (m: Message) => Partial<Message>) {
    updateConversation(convId, (c) => ({
      ...c,
      updatedAt: Date.now(),
      messages: c.messages.map((m) => (m.id === msgId ? { ...m, ...patch(m) } : m)),
    }));
  }

  function handleNew() {
    const conv = newConversation(active.model);
    setConversations((cs) => [conv, ...cs]);
    setActiveId(conv.id);
    setHistoryOpen(false);
  }

  function handleSelect(id: string) {
    setActiveId(id);
    setHistoryOpen(false);
  }

  function handleDelete(id: string) {
    if (streaming?.conversationId === id) abortRef.current?.abort();
    const remaining = conversations.filter((c) => c.id !== id);
    if (remaining.length === 0) {
      const conv = newConversation(active.model);
      setConversations([conv]);
      setActiveId(conv.id);
      return;
    }
    setConversations(remaining);
    if (id === activeId) {
      setActiveId([...remaining].sort((a, b) => b.updatedAt - a.updatedAt)[0].id);
    }
  }

  async function handleSend(text: string) {
    if (streaming) return;
    const conv = active;
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text };
    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      model: conv.model,
      status: "streaming",
    };
    const history = [...conv.messages, userMsg]
      .filter((m) => m.status !== "error" && m.content)
      .map(({ role, content }) => ({ role, content }));

    updateConversation(conv.id, (c) => ({
      ...c,
      title: c.messages.length === 0 ? text.slice(0, 48) : c.title,
      updatedAt: Date.now(),
      messages: [...c.messages, userMsg, assistantMsg],
    }));

    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming({ conversationId: conv.id });
    const start = performance.now();
    let firstTokenAt: number | undefined;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: conv.model, messages: history }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Request failed (${res.status}).`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      while (!finished) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as StreamEvent;
          if (event.type === "text") {
            firstTokenAt ??= performance.now();
            patchMessage(conv.id, assistantMsg.id, (m) => ({ content: m.content + event.delta }));
          } else if (event.type === "usage") {
            const { inputTokens, outputTokens, cachedInputTokens } = event;
            patchMessage(conv.id, assistantMsg.id, () => ({ usage: { inputTokens, outputTokens, cachedInputTokens } }));
          } else if (event.type === "error") {
            throw new Error(event.message);
          } else if (event.type === "done") {
            finished = true;
          }
        }
      }
      if (!finished) throw new Error("The reply ended unexpectedly.");

      const end = performance.now();
      patchMessage(conv.id, assistantMsg.id, () => ({
        status: "done",
        durationMs: end - start,
        streamMs: firstTokenAt !== undefined ? end - firstTokenAt : undefined,
      }));
    } catch (err) {
      const end = performance.now();
      if (controller.signal.aborted) {
        patchMessage(conv.id, assistantMsg.id, () => ({ status: "stopped", durationMs: end - start }));
      } else {
        patchMessage(conv.id, assistantMsg.id, () => ({
          status: "error",
          error: err instanceof Error ? err.message : "Something went wrong.",
        }));
      }
    } finally {
      abortRef.current = null;
      setStreaming(null);
    }
  }

  const drawerBase =
    "fixed inset-y-0 z-40 w-72 border-zinc-800 bg-zinc-950 transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0";

  return (
    <div className="flex h-dvh overflow-hidden bg-zinc-950 text-zinc-100">
      {(historyOpen || usageOpen) && (
        <button
          type="button"
          aria-label="Close panel"
          onClick={() => {
            setHistoryOpen(false);
            setUsageOpen(false);
          }}
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
        />
      )}

      <aside className={`${drawerBase} left-0 border-r ${historyOpen ? "translate-x-0" : "-translate-x-full"} lg:w-64`}>
        <HistoryPanel
          conversations={conversations}
          activeId={active.id}
          streamingConversationId={streaming?.conversationId ?? null}
          onNew={handleNew}
          onSelect={handleSelect}
          onDelete={handleDelete}
        />
      </aside>

      <main className="min-w-0 flex-1">
        <ChatPanel
          conversation={active}
          isStreaming={streaming !== null}
          onSend={handleSend}
          onStop={() => abortRef.current?.abort()}
          onModelChange={(model) => updateConversation(active.id, (c) => ({ ...c, model }))}
          onOpenHistory={() => setHistoryOpen(true)}
          onOpenUsage={() => setUsageOpen(true)}
        />
      </main>

      <aside className={`${drawerBase} right-0 border-l ${usageOpen ? "translate-x-0" : "translate-x-full"} lg:w-80`}>
        <UsagePanel conversation={active} conversations={conversations} />
      </aside>
    </div>
  );
}
