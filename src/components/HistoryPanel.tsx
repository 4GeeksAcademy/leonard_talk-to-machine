"use client";

import { useEffect, useState } from "react";
import { conversationTotals, formatTokens, relativeTime } from "@/lib/format";
import type { Conversation } from "@/lib/types";

interface Props {
  conversations: Conversation[];
  activeId: string;
  streamingConversationId: string | null;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export function HistoryPanel({ conversations, activeId, streamingConversationId, onNew, onSelect, onDelete }: Props) {
  // Re-render periodically so relative timestamps stay fresh.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-200">History</h2>
        <button
          type="button"
          onClick={onNew}
          className="rounded-md bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-900 hover:bg-white"
        >
          + New chat
        </button>
      </div>
      <ul className="flex-1 space-y-1 overflow-y-auto p-2">
        {sorted.map((c) => {
          const totals = conversationTotals(c);
          const active = c.id === activeId;
          return (
            <li key={c.id}>
              <div
                className={`group flex items-start gap-2 rounded-lg px-3 py-2 ${
                  active ? "bg-zinc-800" : "hover:bg-zinc-900"
                }`}
              >
                <button type="button" onClick={() => onSelect(c.id)} className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-1.5">
                    {streamingConversationId === c.id && (
                      <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-400" />
                    )}
                    <span className="truncate text-sm text-zinc-100">{c.title}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {c.messages.length} msgs · {formatTokens(totals.total)} tokens · {relativeTime(c.updatedAt, now)}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(c.id)}
                  aria-label={`Delete ${c.title}`}
                  className="rounded p-1 text-zinc-500 opacity-100 hover:bg-zinc-700 hover:text-red-400 lg:opacity-0 lg:group-hover:opacity-100 lg:focus:opacity-100"
                >
                  ✕
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
