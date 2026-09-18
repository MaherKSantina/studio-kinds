/**
 * A `.pulse` open — the referenced memory's MOVEMENT on one page:
 *
 *   top    — the heat grid: foci as rows, the last N days as columns, cell
 *            intensity = units that ARRIVED that day (ring = touched only).
 *            Derived live from the store's timestamps; nothing cached.
 *   below  — the attention trail: the memory's journal, newest first — every
 *            state the taken answers passed through, logged by the pills.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Activity } from "lucide-react";
import { CopyHandleButton, cn } from "crosscut";
import { ViewerProps } from "../../lib/filePreviews";
import { readVirtualDirectoryFile } from "../../api";
import { memoryScope, parseMemory, splitLabel, type MemoryDoc } from "../../lib/memoryDoc";
import { fillColor, parsePulse, pulseGrid, type PulseGrid } from "../../lib/pulseDoc";
import { localToday } from "../../lib/nodeIndex";
import { loadMemoryStore, memoryOver } from "../memory/memoryLoad";

function Trail({ memory }: { memory: MemoryDoc }) {
  const entries = [...memory.journal].reverse();
  if (!entries.length) {
    return <p className="text-[13px] text-muted-foreground">No movements logged yet — the trail writes itself as answers are taken on the memory.</p>;
  }
  return (
    <div className="space-y-1">
      {entries.map((j, i) => (
        <div key={i} className="flex items-baseline gap-2 text-[13px]">
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {j.at.slice(0, 16).replace("T", " · ")}
          </span>
          <span className="min-w-0 truncate">
            {j.locks.length
              ? j.locks.map((l) => splitLabel(memory, l)).join("  →  ")
              : <span className="text-muted-foreground">cleared — the whole store</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function PulseView(props: ViewerProps & { now?: string }) {
  const { content, height = "100%", now } = props;
  const doc = useMemo(() => parsePulse(content), [content]);
  const today = useMemo(() => now ?? localToday(), [now]);

  const [state, setState] = useState<{ memory: MemoryDoc; grid: PulseGrid } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!doc.memory) { setErr("The pulse names no memory: add `memory: /memory/desk.memory`."); return; }
    let live = true;
    setState(null); setErr(null);
    (async () => {
      const authored = parseMemory((await readVirtualDirectoryFile(doc.memory, doc.memory)).content);
      // The memory over its folder — folder splits and nested memories included.
      const over = memoryOver(authored, doc.memory, await loadMemoryStore(memoryScope(authored, doc.memory), today));
      const units = over.units.map(({ item, fields }) => ({ fields, createdAt: item.entry.createdAt, updatedAt: item.entry.updatedAt }));
      if (live) setState({ memory: over.doc, grid: pulseGrid(over.doc, units, today, doc.days) });
    })().catch((e: unknown) => { if (live) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [doc.memory, doc.days, today]);

  return (
    <div style={{ height }} className="min-h-0 overflow-y-auto bg-background">
      <div className="mx-auto max-w-5xl p-4">
        <div className="mb-1 flex items-center gap-2">
          <Activity className="size-4 text-primary" />
          <h2 className="text-base font-semibold">{doc.title}</h2>
          <span className="font-mono text-xs text-muted-foreground">{doc.memory}</span>
          {doc.memory && <CopyHandleButton path={doc.memory} />}
        </div>
        {doc.description && <p className="mb-3 max-w-2xl text-[12px] leading-snug text-muted-foreground">{doc.description}</p>}

        {err ? <p className="text-sm text-destructive">{err}</p>
          : !state ? <p className="text-sm text-muted-foreground">Reading the store…</p>
            : (
              <div className="space-y-6">
                <section>
                  <h3 className="mb-2 text-xs font-bold">
                    Saturation by focus <span className="font-normal text-muted-foreground">· last {doc.days} days · each box = how full the focus was that day (deeper red = more saturated), ring = touched, grey = parked/else</span>
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="border-separate" style={{ borderSpacing: 2 }}>
                      <thead>
                        <tr>
                          <th />
                          {state.grid.dates.map((d) => (
                            <th key={d} className="p-0 text-center font-mono text-xs font-normal text-muted-foreground">
                              {d.endsWith("01") || d === state.grid.dates[0] ? d.slice(5) : d.slice(8) === "15" ? d.slice(5) : ""}
                            </th>
                          ))}
                          <th className="pl-2 text-right font-mono text-xs font-normal text-muted-foreground">now</th>
                        </tr>
                      </thead>
                      <tbody>
                        {state.grid.rows.map((r) => (
                          <tr key={r.key}>
                            <td className={cn("whitespace-nowrap pr-2 text-left text-[13px]",
                              r.isElse || r.parked ? "text-muted-foreground" : "font-medium")}>
                              <span style={{ paddingLeft: r.depth * 14 }}>
                                {r.depth > 0 ? "└ " : ""}{r.label}
                                {r.context && <span className="text-xs text-muted-foreground"> · {r.context}</span>}
                              </span>
                            </td>
                            {r.cells.map((c, i) => (
                              <td key={i} className="p-0">
                                <div title={`${state.grid.dates[i]} — ${c.total} in memory${c.added ? `, +${c.added} that day` : ""}${c.touched ? `, ${c.touched} touched` : ""}`}
                                  style={{ backgroundColor: fillColor(c.total / Math.max(r.units, 1), r.isElse || r.parked) }}
                                  className={cn("size-[15px] rounded-[3px]",
                                    c.touched > 0 && "ring-1 ring-inset ring-red-400/70",
                                    c.touched > 0 && (r.isElse || r.parked) && "ring-gray-400/80")} />
                              </td>
                            ))}
                            <td className="pl-2 text-right font-mono text-xs text-muted-foreground" title={`${r.addedTotal} added in window`}>
                              {r.units}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section>
                  <h3 className="mb-2 text-xs font-bold">
                    Attention trail <span className="font-normal text-muted-foreground">· every change of the taken answers, newest first</span>
                  </h3>
                  <Trail memory={state.memory} />
                </section>
              </div>
            )}
      </div>
    </div>
  );
}
