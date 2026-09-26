import { conversationTotals, formatTokens } from "@/lib/format";
import { MODELS, modelLabel } from "@/lib/models";
import type { Conversation } from "@/lib/types";

const INPUT_COLOR = "bg-blue-500";
const OUTPUT_COLOR = "bg-amber-400";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-900 p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-zinc-100 tabular-nums">{value}</div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex gap-3 text-xs text-zinc-400">
      <span className="flex items-center gap-1">
        <span className={`h-2 w-2 rounded-sm ${INPUT_COLOR}`} /> Input
      </span>
      <span className="flex items-center gap-1">
        <span className={`h-2 w-2 rounded-sm ${OUTPUT_COLOR}`} /> Output
      </span>
    </div>
  );
}

export function UsagePanel({ conversation, conversations }: { conversation: Conversation; conversations: Conversation[] }) {
  const t = conversationTotals(conversation);
  const inputPct = t.total > 0 ? (t.input / t.total) * 100 : 0;

  const turns = conversation.messages.filter((m) => m.role === "assistant" && m.usage);
  const maxTurnValue = Math.max(1, ...turns.flatMap((m) => [m.usage!.inputTokens, m.usage!.outputTokens]));

  const byModel = new Map<string, { input: number; output: number; turns: number }>();
  for (const c of conversations) {
    for (const m of c.messages) {
      if (m.role !== "assistant" || !m.usage || !m.model) continue;
      const entry = byModel.get(m.model) ?? { input: 0, output: 0, turns: 0 };
      entry.input += m.usage.inputTokens;
      entry.output += m.usage.outputTokens;
      entry.turns++;
      byModel.set(m.model, entry);
    }
  }
  const sessionInput = [...byModel.values()].reduce((s, v) => s + v.input, 0);
  const sessionOutput = [...byModel.values()].reduce((s, v) => s + v.output, 0);
  const sessionTotal = sessionInput + sessionOutput;
  const modelRows = MODELS.map((m) => m.id).filter((id) => byModel.has(id));

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-200">Token usage</h2>
      </div>
      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">This conversation</h3>
          <div>
            <div className="text-2xl font-semibold text-zinc-100 tabular-nums">{t.total.toLocaleString()}</div>
            <div className="text-xs text-zinc-500">total tokens</div>
          </div>
          <div>
            <div className="flex h-2 overflow-hidden rounded-full bg-zinc-800">
              <div className={INPUT_COLOR} style={{ width: `${inputPct}%` }} />
              <div className={OUTPUT_COLOR} style={{ width: `${t.total > 0 ? 100 - inputPct : 0}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between text-xs text-zinc-400 tabular-nums">
              <span>{t.input.toLocaleString()} in</span>
              <span>{t.output.toLocaleString()} out</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Turns" value={String(t.turns)} />
            <Stat label="Avg / turn" value={t.turns ? formatTokens(Math.round(t.total / t.turns)) : "–"} />
            <Stat label="Cached input" value={formatTokens(t.cached)} />
            <Stat label="Output tok/s" value={t.tokensPerSecond ? t.tokensPerSecond.toFixed(1) : "–"} />
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Per turn</h3>
            <Legend />
          </div>
          {turns.length === 0 ? (
            <p className="text-xs text-zinc-500">No completed turns yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="flex h-32 items-end gap-2">
                {turns.map((m, i) => (
                  <div key={m.id} className="flex h-full min-w-6 flex-1 flex-col items-center justify-end gap-1">
                    <div
                      className="flex w-full flex-1 items-end justify-center gap-0.5"
                      title={`Turn ${i + 1}: ${m.usage!.inputTokens} in / ${m.usage!.outputTokens} out`}
                    >
                      <div
                        className={`w-1/2 max-w-3 rounded-t-sm ${INPUT_COLOR}`}
                        style={{ height: `${(m.usage!.inputTokens / maxTurnValue) * 100}%` }}
                      />
                      <div
                        className={`w-1/2 max-w-3 rounded-t-sm ${OUTPUT_COLOR}`}
                        style={{ height: `${(m.usage!.outputTokens / maxTurnValue) * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-zinc-500">{i + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Session</h3>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Total" value={formatTokens(sessionTotal)} />
            <Stat label="Input" value={formatTokens(sessionInput)} />
            <Stat label="Output" value={formatTokens(sessionOutput)} />
          </div>
          {modelRows.length === 0 ? (
            <p className="text-xs text-zinc-500">No usage yet.</p>
          ) : (
            <ul className="space-y-3">
              {modelRows.map((id) => {
                const v = byModel.get(id)!;
                const share = sessionTotal > 0 ? ((v.input + v.output) / sessionTotal) * 100 : 0;
                return (
                  <li key={id} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-200">{modelLabel(id)}</span>
                      <span className="text-zinc-400 tabular-nums">
                        {formatTokens(v.input + v.output)} · {v.turns} turns
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                      <div className="h-full bg-zinc-300" style={{ width: `${share}%` }} />
                    </div>
                    <div className="text-[11px] text-zinc-500 tabular-nums">
                      {v.input.toLocaleString()} in · {v.output.toLocaleString()} out
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
