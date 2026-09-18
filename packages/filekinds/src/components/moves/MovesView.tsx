/**
 * A `.moves` open — the memory's MOVEMENT LOG, harvested by looking.
 *
 * On every open the view rebuilds "unit → answer path" from the live store,
 * diffs it against the snapshot saved in this document's tail, appends the
 * differences to the log, and persists the new state (fresh-read merge,
 * same discipline as the memory's locks). What you see:
 *
 *   Since last look — what this open just harvested.
 *   Movement log    — everything harvested so far, newest first: nodes
 *                     moving between foci, arrivals and departures, answers
 *                     parked under Everything else or retrieved from it.
 */
import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, ArrowRightLeft, Archive, ArchiveRestore, LogIn, LogOut, Plus, Minus } from "lucide-react";
import { CopyHandleButton, cn } from "crosscut";
import { ViewerProps } from "../../lib/filePreviews";
import { configuredWriter, readVirtualDirectoryFile } from "../../api";
import { memoryScope, parseMemory } from "../../lib/memoryDoc";
import {
  computeSnapshot, diffMoves, parseMoves, parseMovesState, writeMovesState, type MoveEvent,
} from "../../lib/movesDoc";
import { localDay } from "../../lib/nodeIndex";
import { loadMemoryStore, memoryOver } from "../memory/memoryLoad";

function EventLine({ e }: { e: MoveEvent }) {
  const when = <span className="shrink-0 font-mono text-xs text-muted-foreground">{e.at.slice(0, 16).replace("T", " · ")}</span>;
  const body = (() => {
    switch (e.kind) {
      case "node-moved":
        return <><ArrowRightLeft className="size-3 shrink-0 text-primary" />
          <span className="min-w-0 truncate"><b>{e.node}</b> — {e.from} <ArrowRight className="inline size-3" /> {e.to}</span></>;
      case "arrived":
        return <><LogIn className="size-3 shrink-0 text-red-600" />
          <span className="min-w-0 truncate">{e.count} arrived → {e.to}</span></>;
      case "gone":
        return <><LogOut className="size-3 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate">{e.count} left — {e.from}</span></>;
      case "answer-moved":
        return <>{e.parked ? <Archive className="size-3 shrink-0 text-muted-foreground" /> : e.retrieved ? <ArchiveRestore className="size-3 shrink-0 text-primary" /> : <ArrowRightLeft className="size-3 shrink-0 text-primary" />}
          <span className="min-w-0 truncate">
            answer <b>{e.answer}</b> {e.parked ? "parked under Everything else" : e.retrieved ? "retrieved from Everything else" : "moved"} — {e.from || "top"} <ArrowRight className="inline size-3" /> {e.to || "top"}
          </span></>;
      case "answer-added":
        return <><Plus className="size-3 shrink-0 text-primary" />
          <span className="min-w-0 truncate">answer <b>{e.answer}</b> added{e.under ? ` under ${e.under}` : ""}</span></>;
      case "answer-removed":
        return <><Minus className="size-3 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate">answer <b>{e.answer}</b> removed{e.from ? ` from ${e.from}` : ""}</span></>;
    }
  })();
  return <div className="flex items-center gap-2 text-[13px]">{when}{body}</div>;
}

export default function MovesView(props: ViewerProps & { now?: string }) {
  const { content, height = "100%", onChange, now, path, agentId } = props;
  const docPath = path ?? agentId ?? null;
  const doc = useMemo(() => parseMoves(content), [content]);

  const [state, setState] = useState<{ fresh: MoveEvent[]; log: MoveEvent[]; since: string | null; baseline: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!doc.memory) { setErr("The moves doc names no memory: add `memory: /memory/desk.memory`."); return; }
    let live = true;
    setState(null); setErr(null);
    (async () => {
      const at = now ?? new Date().toISOString();
      const authored = parseMemory((await readVirtualDirectoryFile(doc.memory, doc.memory)).content);
      const today = localDay(at)!;
      // The memory over its folder — folder splits and nested memories included.
      const over = memoryOver(authored, doc.memory, await loadMemoryStore(memoryScope(authored, doc.memory), today));
      const memory = over.doc;
      const units = over.units.map(({ item, fields }) => ({ path: item.entry.path, fields }));
      const current = computeSnapshot(memory, units, at);

      // Diff against the LIVE file's own snapshot — never this tab's copy.
      const text = docPath ? (await readVirtualDirectoryFile(docPath, docPath)).content : content;
      const prior = parseMovesState(text);
      const fresh = prior.snapshot ? diffMoves(prior.snapshot, current, memory, at) : [];
      const log = [...prior.events, ...fresh].slice(-doc.keep);
      const baseline = !prior.snapshot;

      // Persist when something was harvested (or the baseline is being laid):
      // an unchanged world writes nothing, so looking doesn't churn the store.
      const writer = configuredWriter();
      if (writer && docPath && (baseline || fresh.length)) {
        const nextText = writeMovesState(text, current, log, doc.keep);
        await writer(docPath, nextText);
        onChange?.(nextText);
      }
      if (live) setState({ fresh, log, since: prior.snapshot?.at ?? null, baseline });
    })().catch((e: unknown) => { if (live) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [doc.memory, doc.keep, docPath, now]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ height }} className="min-h-0 overflow-y-auto bg-background">
      <div className="mx-auto max-w-4xl p-4">
        <div className="mb-1 flex items-center gap-2">
          <ArrowRightLeft className="size-4 text-primary" />
          <h2 className="text-base font-semibold">{doc.title}</h2>
          <span className="font-mono text-xs text-muted-foreground">{doc.memory}</span>
          {doc.memory && <CopyHandleButton path={doc.memory} />}
        </div>
        {doc.description && <p className="mb-3 max-w-2xl text-[12px] leading-snug text-muted-foreground">{doc.description}</p>}

        {err ? <p className="text-sm text-destructive">{err}</p>
          : !state ? <p className="text-sm text-muted-foreground">Diffing against the last look…</p>
            : (
              <div className="space-y-6">
                <section>
                  <h3 className="mb-2 text-xs font-bold">
                    Since last look
                    {state.since && <span className="font-normal text-muted-foreground"> · {state.since.slice(0, 16).replace("T", " ")}</span>}
                  </h3>
                  {state.baseline
                    ? <p className="text-[13px] text-muted-foreground">Baseline recorded — movement shows from the next change onward.</p>
                    : state.fresh.length
                      ? <div className="space-y-1">{state.fresh.map((e, i) => <EventLine key={i} e={e} />)}</div>
                      : <p className="text-[13px] text-muted-foreground">Nothing moved.</p>}
                </section>

                <section>
                  <h3 className="mb-2 text-xs font-bold">
                    Movement log <span className="font-normal text-muted-foreground">· {state.log.length} events kept</span>
                  </h3>
                  {state.log.length
                    ? <div className="space-y-1">{[...state.log].reverse().map((e, i) => <EventLine key={i} e={e} />)}</div>
                    : <p className="text-[13px] text-muted-foreground">Empty — it fills as things move.</p>}
                </section>
              </div>
            )}
      </div>
    </div>
  );
}
