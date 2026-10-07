"use client";

import { useEffect, useRef, useState } from "react";
import { Card, JsonBlock, Pill, Spinner, CopyButton } from "@/components/ui";

const PRESETS = [
  "Should I hedge BTC? Analyze on-chain activity over the last 3 blocks and give me a HEDGE or NO HEDGE recommendation",
  "What is the BTC whale flow over the last 3 blocks?",
  "What is the price of BTC and SOL right now?",
  "Which coins are trending?",
  "Are gas fees cheap on Base right now? Check the fee market on eth, base and arb.",
];

const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

type Receipt = { settled?: boolean; txHash?: string | null; error?: string };
type Task = Record<string, unknown> & { id?: string; status?: string };

/** Find the worker's result text inside whatever task shape Core returns. */
function pickResult(task: Task): string | undefined {
  for (const key of ["result", "output", "answer", "resultText", "response"]) {
    const v = task[key];
    if (typeof v === "string" && v.trim()) return v;
    if (v && typeof v === "object" && "text" in (v as object)) {
      const t = (v as { text?: unknown }).text;
      if (typeof t === "string" && t.trim()) return t;
    }
  }
  const events = task.events;
  if (Array.isArray(events)) {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i] as { status?: string; comment?: string };
      if (e.status === "COMPLETED" && typeof e.comment === "string" && e.comment.trim()) {
        return e.comment;
      }
    }
  }
  return undefined;
}

function statusTone(s?: string): "gray" | "blue" | "green" | "red" {
  const u = (s ?? "").toUpperCase();
  if (u === "COMPLETED") return "green";
  if (u === "FAILED" || u === "CANCELLED") return "red";
  if (u === "RUNNING" || u === "IN_PROGRESS") return "blue";
  return "gray";
}

export function CoworkerConsole() {
  const [brief, setBrief] = useState(PRESETS[0]);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavail, setUnavail] = useState<string | null | undefined>(undefined);
  const polls = useRef(0);

  const terminal = TERMINAL.has((task?.status ?? "").toUpperCase());

  // Probe availability once: the GET route answers 503 when the sokosumi
  // credentials are missing (hosted deploy), 400 when configured.
  useEffect(() => {
    let stop = false;
    fetch("/api/coworker/task", { cache: "no-store" })
      .then(async res => {
        if (stop) return;
        if (res.status === 503) {
          const body = await res.json().catch(() => ({}));
          setUnavail(body.error ?? "coworker not configured on this server");
        } else {
          setUnavail(null);
        }
      })
      .catch(() => { if (!stop) setUnavail(null); });
    return () => { stop = true; };
  }, []);

  async function submit() {
    setBusy(true);
    setError(null);
    setTask(null);
    setReceipt(null);
    setTaskId(null);
    try {
      const res = await fetch("/api/coworker/task", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brief }),
      });
      const body = await res.json();
      if (res.status === 503) { setUnavail(body.error ?? "coworker not configured"); return; }
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setTaskId(body.id);
      setTask(body.task ?? null);
      polls.current = 0;
    } catch (e) {
      setError(e instanceof Error ? e.message : "create failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!taskId || terminal) return;
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/coworker/task?id=${encodeURIComponent(taskId)}`, { cache: "no-store" });
        const body = await res.json();
        if (stop || !res.ok) return;
        setTask(body.task ?? null);
        if (body.receipt) setReceipt(body.receipt);
        polls.current += 1;
      } catch { /* transient poll errors are fine */ }
    };
    const t = setInterval(() => {
      if (polls.current > 120) { setError("still running: check Tasks in Sokosumi"); clearInterval(t); return; }
      tick();
    }, 6_000);
    tick();
    return () => { stop = true; clearInterval(t); };
  }, [taskId, terminal]);

  if (unavail) {
    return (
      <Card className="p-6 sm:p-8">
        <p className="text-[17px] font-semibold text-label">Runs on your machine, not here</p>
        <p className="mt-2 text-[14.5px] leading-relaxed text-muted">
          Coworker tasks are created through the Sokosumi CLI, which holds the operator
          credentials on the machine that runs <code className="font-mono text-[13px]">npm run coworker</code>.
          This hosted build has none, so task creation is local only. The marketplace,
          playground and activity pages work everywhere.
        </p>
        <div className="mt-5 space-y-2 rounded-xl border border-sep-soft bg-surface px-4 py-3">
          <p className="text-[13px] text-muted">
            <span className="font-medium text-label">1.</span>{" "}
            <code className="font-mono text-[13px] text-label">npm run web:dev</code>
            {" "}then open localhost:3000/coworker
          </p>
          <p className="text-[13px] text-muted">
            <span className="font-medium text-label">2.</span>{" "}
            <code className="font-mono text-[13px] text-label">npm run coworker</code>
            {" "}keeps the worker executing tasks
          </p>
        </div>
      </Card>
    );
  }

  const resultText = task ? pickResult(task) : undefined;
  let resultJson: Record<string, unknown> | undefined;
  if (resultText?.trim().startsWith("{")) {
    try { resultJson = JSON.parse(resultText); } catch { /* plain text result */ }
  }
  const decision = resultJson?.decision as { signal?: string; rationale?: string; rule?: string } | undefined;

  return (
    <div className="space-y-5">
      <Card className="p-5 sm:p-6">
        <p className="text-[13px] font-medium text-muted">Task brief</p>
        <textarea
          value={brief}
          onChange={e => setBrief(e.target.value)}
          rows={3}
          className="mt-2 w-full rounded-xl border border-sep-soft bg-surface px-4 py-3 text-[14.5px] leading-relaxed text-label outline-none focus:border-blue"
          placeholder="What should Argus do?"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map(p => (
            <button
              key={p}
              onClick={() => setBrief(p)}
              className="rounded-full border border-sep-soft px-3 py-1 text-[12px] text-muted transition-colors hover:border-blue hover:text-link"
            >
              {p.length > 52 ? `${p.slice(0, 52)}…` : p}
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-4">
          <button
            onClick={submit}
            disabled={busy || !brief.trim()}
            className="rounded-full bg-blue px-5 py-2 text-[13.5px] font-medium text-white transition-colors hover:bg-blue-hover disabled:opacity-50"
          >
            {busy ? "Creating task…" : "Send to Argus"}
          </button>
          <p className="text-[12.5px] text-meta">Creates a Sokosumi task; the worker picks it up within seconds.</p>
        </div>
      </Card>

      {error && (
        <Card className="border border-red/20 p-5">
          <p className="text-[14px] text-red-deep">{error}</p>
        </Card>
      )}

      {taskId && (
        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <Pill tone={statusTone(task?.status)}>{task?.status ?? "CREATED"}</Pill>
            {!terminal && <Spinner label="worker is on it" />}
            <span className="font-mono text-[12px] text-meta">{taskId}</span>
            <CopyButton text={taskId} />
          </div>

          {decision?.signal && (
            <div className="mt-5 flex items-center gap-3">
              <Pill tone={decision.signal === "HEDGE" ? "red" : "green"}>{decision.signal}</Pill>
              <p className="text-[13.5px] text-muted">{decision.rationale ?? decision.rule}</p>
            </div>
          )}

          {resultText && (
            <div className="mt-4">
              <p className="mb-2 text-[13px] font-medium text-muted">Result</p>
              <JsonBlock value={resultJson ?? resultText} />
            </div>
          )}

          {receipt && (
            <div className="mt-4 rounded-xl border border-sep-soft bg-surface px-4 py-3">
              {"error" in receipt && receipt.error ? (
                <p className="text-[13px] text-meta">Receipt unavailable on this machine: {receipt.error}</p>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <Pill tone={receipt.settled ? "green" : "gray"}>
                    {receipt.settled ? "payment settled" : "payment pending"}
                  </Pill>
                  {receipt.txHash && (
                    <a
                      className="font-mono text-[12.5px] text-link hover:underline"
                      href={`https://preprod.cardanoscan.io/transaction/${receipt.txHash}`}
                      target="_blank" rel="noreferrer"
                    >
                      {receipt.txHash.slice(0, 20)}… ↗
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
