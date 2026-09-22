/**
 * A `.pipeline` open — the items, the stages down a rail with what each did,
 * the output's views. A stage clicked shows the rows as of it (the cells it
 * set highlighted, each with its circumstance) or its logic: rules in words
 * with a button carrying the match count (the items it set, in a dialog), a
 * filter's clauses with the items it dropped, a sort's keys. Output shows
 * one view at a time, its rules in a line above the grid. The decisions are
 * pills at the top: taken for the session, never written back. The row
 * dialog carries the item's id and every field's trail through the stages.
 * Nothing is edited here.
 */
import React, { useMemo, useState } from "react";
import { Button, DecisionPills, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, cn } from "crosscut";
import { ViewerProps } from "../../lib/filePreviews";
import { cellText, type DataRow } from "../../lib/dataRows";
import { setText } from "../../lib/middlewareDoc";
import {
  cellKey, contest, holdsUnder, parsePipeline, ruleSentence, runPipeline, shownColumns, stageText, trail, whenText,
  type Claim, type PipelineDoc, type PipelineRun, type StageRun, type ViewRun,
} from "../../lib/pipelineDoc";
import { clauseSentence, columnsOf, rulesSummary } from "../../lib/tablePolicy";
import { CopyButton } from "../data/cells";
import { DataGrid, type CellMark } from "../data/DataTableView";

type Pick = { kind: "items" } | { kind: "stage"; key: string } | { kind: "output" };

export default function PipelineView({ content, path, agentId, height = "100%" }: ViewerProps) {
  const doc = useMemo(() => parsePipeline(content ?? ""), [content]);
  const base = path ?? agentId ?? "/";
  const name = base.slice(base.lastIndexOf("/") + 1);
  const [taken, setTaken] = useState<string[]>([]);
  const run = useMemo(() => runPipeline(doc, taken), [doc, taken]);
  const [picked, setPicked] = useState<Pick>({ kind: "items" });
  const [tab, setTab] = useState<"rows" | "logic">("rows");
  const [viewKey, setViewKey] = useState<string | null>(null);

  // A stage the file no longer has falls back to the items; a view likewise to the first.
  const pick: Pick = picked.kind === "stage" && !run.stages.some((s) => s.key === picked.key) ? { kind: "items" } : picked;
  const stage = pick.kind === "stage" ? run.stages.find((s) => s.key === pick.key)! : null;
  const view = run.views.find((v) => v.key === viewKey) ?? run.views[0] ?? null;

  const problemsOf = (key: string) => run.problems.filter((p) => p.startsWith(`stage ${key} `) || p.startsWith(`stage ${key}:`)).length;
  const itemProblems = doc.problems.filter((p) => /^(item|items|decision|decisions|labels)\b/.test(p));
  const viewProblems = run.problems.filter((p) => /^view\b/.test(p));

  const rowExtra = (row: DataRow) => <Trail run={run} doc={doc} row={row} />;

  return (
    <div style={{ height }} className="flex min-h-0 flex-col bg-background text-sm">
      <div className="shrink-0 border-b px-4 py-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-[15px] font-semibold">{doc.title || name}</h2>
          <span className="text-[13px] text-muted-foreground">
            {run.items.length.toLocaleString()} item{run.items.length === 1 ? "" : "s"} · {run.stages.length} stage{run.stages.length === 1 ? "" : "s"} · {run.output.length.toLocaleString()} out
          </span>
          {run.problems.length > 0 && (
            <span className="text-[13px] text-amber-900" title={run.problems.join("\n")}>{run.problems.length} problem{run.problems.length === 1 ? "" : "s"}</span>
          )}
        </div>
        {doc.decisions.length > 0 && (
          <DecisionPills decisions={doc.decisions} value={taken} onChange={setTaken} includeSingles className="mt-1.5" />
        )}
      </div>
      <div className="flex min-h-0 flex-1">
        <ol className="w-56 shrink-0 overflow-auto border-r py-1">
          <RailRow active={pick.kind === "items"} onClick={() => { setPicked({ kind: "items" }); }} label="Items"
            detail={`${run.items.length.toLocaleString()}`} problems={itemProblems.length} />
          {run.stages.map((s) => (
            <RailRow key={s.key} active={pick.kind === "stage" && pick.key === s.key} onClick={() => setPicked({ kind: "stage", key: s.key })}
              label={s.label} detail={stageText(s)} dim={!s.applied} problems={problemsOf(s.key)} />
          ))}
          <li className="mx-3 my-1 border-t" aria-hidden />
          <RailRow active={pick.kind === "output"} onClick={() => setPicked({ kind: "output" })} label="Output"
            detail={`${run.output.length.toLocaleString()}${run.views.length ? ` · ${run.views.length} view${run.views.length === 1 ? "" : "s"}` : ""}`} problems={viewProblems.length} />
        </ol>
        <div className="flex min-w-0 flex-1 flex-col">
          {pick.kind === "items" && (
            <DataGrid rows={run.items} columns={shownColumns(run.items)} labels={doc.labels} problems={itemProblems} rowExtra={rowExtra}
              lead={<span className="font-medium text-foreground">Items</span>} />
          )}
          {stage && (
            <>
              <div className="flex shrink-0 items-center gap-3 border-b px-3 py-1.5 text-[13px]">
                <span className="font-medium">{stage.label}</span>
                <span className="text-muted-foreground">{stageText(stage)}</span>
                {stage.when.length > 0 && <span className="text-muted-foreground">under {whenText(stage.when, doc.decisions)}</span>}
                <span className="ml-auto flex overflow-hidden rounded-md border text-[12px]">
                  <button type="button" onClick={() => setTab("rows")} className={cn("px-2 py-0.5", tab === "rows" ? "bg-accent" : "hover:bg-accent/40")}>Rows</button>
                  <button type="button" onClick={() => setTab("logic")} className={cn("border-l px-2 py-0.5", tab === "logic" ? "bg-accent" : "hover:bg-accent/40")}>Logic</button>
                </span>
              </div>
              {!stage.applied && (
                <div className="shrink-0 border-b bg-sidebar px-3 py-1 text-[12px] text-muted-foreground">
                  Skipped under the answers taken — it holds under {whenText(stage.when, doc.decisions)}. The rows pass through unchanged.
                </div>
              )}
              {tab === "rows" ? (
                <DataGrid rows={stage.rows} columns={shownColumns(stage.rows)} labels={doc.labels} rowExtra={rowExtra}
                  problems={run.problems.filter((p) => p.startsWith(`stage ${stage.key}`))}
                  mark={(row, c) => {
                    const m = markOf(stage.claims, row, c, doc);
                    const own = stage.set.get(cellKey(row.id, c));
                    return own === undefined ? m : { ...m, changed: true, title: `set by ${stage.label}${own.length ? ` under ${whenText(own, doc.decisions)}` : ""}` };
                  }} />
              ) : (
                <StageLogic stage={stage} doc={doc} taken={taken} />
              )}
            </>
          )}
          {pick.kind === "output" && (
            <>
              {run.views.length > 0 && (
                <div className="flex shrink-0 flex-wrap items-center gap-1 border-b px-3 py-1.5 text-[13px]">
                  {run.views.map((v) => (
                    <button key={v.key} type="button" onClick={() => setViewKey(v.key)}
                      className={cn("rounded-md border px-2 py-0.5", view?.key === v.key ? "bg-accent" : "hover:bg-accent/40", !v.applied && "text-muted-foreground line-through")}
                      title={v.when.length ? `under ${whenText(v.when, doc.decisions)}` : undefined}>
                      {v.label}
                    </button>
                  ))}
                </div>
              )}
              {view && !view.applied ? (
                <p className="p-4 text-muted-foreground">Not under the answers taken — this view holds under {whenText(view.when, doc.decisions)}.</p>
              ) : (
                <OutputGrid run={run} doc={doc} view={view} rowExtra={rowExtra} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** A cell's mark from the claims made on it: the badge of the value it holds, and — a contested cell — every other
 *  value on the table with its own badge; nothing for a cell no rule touched. */
function markOf(claims: Map<string, Claim[]>, row: DataRow, column: string, doc: PipelineDoc): CellMark | undefined {
  const { holds, others } = contest(claims, row.id, column);
  if (!holds) return undefined;
  return {
    ...(holds.when.length ? { badge: whenText(holds.when, doc.decisions) } : {}),
    ...(others.length ? { others: others.map((o) => ({ text: cellText(o.value), ...(o.when.length ? { badge: whenText(o.when, doc.decisions) } : {}) })) } : {}),
  };
}

function RailRow({ active, onClick, label, detail, dim, problems }: { active: boolean; onClick: () => void; label: string; detail: string; dim?: boolean; problems: number }) {
  return (
    <li>
      <button type="button" onClick={onClick}
        className={cn("flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-accent/40", active && "bg-accent", dim && "text-muted-foreground")}>
        <span className="flex w-full items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
          {problems > 0 && <span className="shrink-0 rounded bg-amber-100 px-1 text-[10px] text-amber-900" title={`${problems} problem${problems === 1 ? "" : "s"}`}>{problems}</span>}
        </span>
        <span className="text-[12px] text-muted-foreground">{detail}</span>
      </button>
    </li>
  );
}

/** The output through one view: its rules in a line, then the grid; no views = every column, file order. */
function OutputGrid({ run, doc, view, rowExtra }: { run: PipelineRun; doc: PipelineDoc; view: ViewRun | null; rowExtra: (row: DataRow) => React.ReactNode }) {
  const spec = view ? doc.views.find((v) => v.key === view.key) : undefined;
  const rules = spec ? rulesSummary({ role: "table", title: "", where: spec.where, sort: spec.sort, hide: spec.hide, problems: [], ...(spec.columns ? { columns: spec.columns } : {}), ...(spec.limit ? { limit: spec.limit } : {}) }, doc.labels) : "";
  const rows = view ? view.rows : run.output;
  const columns = view ? view.columns : shownColumns(run.output);
  const lead = (
    <span className="min-w-0 truncate">
      <span className="font-medium text-foreground">{view ? view.label : "Output"}</span>
      {rules && <span className="text-muted-foreground"> · {rules}</span>}
    </span>
  );
  return (
    <DataGrid rows={rows} columns={columns} labels={doc.labels} lead={lead} rowExtra={rowExtra} problems={view?.problems ?? []}
      mark={(row, c) => markOf(run.claims, row, c, doc)} />
  );
}

/** A stage's logic, by its verb — and the rows behind each count, in a dialog. */
function StageLogic({ stage, doc, taken }: { stage: StageRun; doc: PipelineDoc; taken: string[] }) {
  const spec = doc.stages.find((s) => s.key === stage.key)!;
  const [open, setOpen] = useState<number | "dropped" | null>(null);

  const shown = useMemo(() => {
    if (open === null) return null;
    if (open === "dropped") return { title: `Dropped · ${stage.dropped.length.toLocaleString()} item${stage.dropped.length === 1 ? "" : "s"}`, rows: stage.dropped, columns: shownColumns(stage.dropped) };
    const rows = stage.matches[open].map((i) => stage.rows[i]);
    const setKeys = Object.keys(spec.rules[open]?.set ?? {});
    return { title: `Rule ${open + 1} · ${rows.length.toLocaleString()} item${rows.length === 1 ? "" : "s"}`, rows, columns: [...setKeys, ...columnsOf(rows).filter((c) => c !== "id" && !setKeys.includes(c))] };
  }, [open, stage, spec]);

  const count = (n: number, what: string) => `${n.toLocaleString()} ${what}${n === 1 ? "" : "s"}`;
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4 text-sm">
      {spec.verb === "rules" && (
        <ol className="list-decimal space-y-2 pl-5">
          {spec.rules.map((rule, i) => {
            const hit = stage.matches[i];
            const onTable = stage.applied && holdsUnder(taken, rule.when);
            return (
              <li key={i} className={cn("leading-6", !onTable && "text-muted-foreground")}>
                <div><span className="text-muted-foreground">where </span>{ruleSentence(rule, doc.items)}</div>
                <div><span className="text-muted-foreground">set </span><code className="text-[12px]">{setText(rule.set)}</code></div>
                {rule.when.length > 0 && <div><span className="text-muted-foreground">under </span>{whenText(rule.when, doc.decisions)}</div>}
                {rule.note && <div className="text-[13px] text-muted-foreground">{rule.note}</div>}
                <div>
                  {!stage.applied ? <span className="text-muted-foreground">skipped</span>
                    : !onTable ? <span className="text-muted-foreground">off the table under the answers taken</span>
                    : hit.length ? <Button size="xs" variant="outline" onClick={() => setOpen(i)}>{count(hit.length, "item")}</Button>
                    : <span className="text-amber-900">matches no item</span>}
                </div>
              </li>
            );
          })}
          {!spec.rules.length && <li className="list-none text-muted-foreground">No rules.</li>}
        </ol>
      )}
      {spec.verb === "filter" && (
        <div className="space-y-2 leading-6">
          <div>
            <span className="text-muted-foreground">keep where </span>
            {spec.filter.length ? spec.filter.map((c, j) => <span key={j}>{j > 0 && <span className="text-muted-foreground"> and </span>}{clauseSentence(c)}</span>) : <span>every item</span>}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">kept {stage.rows.length.toLocaleString()} of {stage.before.toLocaleString()}</span>
            {stage.dropped.length > 0 && <Button size="xs" variant="outline" onClick={() => setOpen("dropped")}>{count(stage.dropped.length, "item")} dropped</Button>}
          </div>
        </div>
      )}
      {spec.verb === "sort" && (
        <div className="leading-6">
          <span className="text-muted-foreground">sorted by </span>
          {spec.sort.length ? spec.sort.map((s, j) => <span key={j}>{j > 0 && <span className="text-muted-foreground">, then </span>}{doc.labels[s.field] ?? s.field} {s.dir}</span>) : <span>nothing — file order</span>}
        </div>
      )}
      <Dialog open={shown !== null} onOpenChange={(o) => { if (!o) setOpen(null); }}>
        <DialogContent className="flex max-h-[85dvh] flex-col gap-2 overflow-hidden p-4" style={{ maxWidth: "min(1100px, 96vw)" }}>
          <DialogHeader className="pr-8">
            <DialogTitle className="text-[15px]">{shown?.title}</DialogTitle>
            <DialogDescription className="sr-only">The items behind this count</DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col">
            {shown && <DataGrid rows={shown.rows} columns={shown.columns} labels={doc.labels} height="auto" />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Under a row's fields: its id, to copy, and every field a stage set — the item's value, then each claim in order. */
function Trail({ run, doc, row }: { run: PipelineRun; doc: PipelineDoc; row: DataRow }) {
  const id = String(row.id ?? "");
  const fields = [...run.claims.keys()].filter((k) => k.startsWith(`${id}::`)).map((k) => k.slice(id.length + 2));
  return (
    <div className="mt-3 border-t pt-2 text-[13px]">
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">id</span>
        <code className="text-[12px]">{id}</code>
        <CopyButton text={id} label="Copy the id" />
      </div>
      {fields.length > 0 && (
        <dl className="mt-1.5 grid grid-cols-[minmax(120px,max-content)_1fr] gap-x-4 gap-y-1">
          {fields.map((f) => (
            <React.Fragment key={f}>
              <dt className="truncate font-mono text-[12px] leading-5 text-muted-foreground">{doc.labels[f] ?? f}</dt>
              <dd className="leading-5">
                {trail(run, id, f).map((c, i) => (
                  <span key={i}>
                    {i > 0 && <span className="text-muted-foreground"> → </span>}
                    <span>{cellText(c.value)}</span>
                    <span className="text-muted-foreground"> ({c.stage ?? "item"}{c.rule ? ` · rule ${c.rule}` : ""}{c.when.length ? ` · ${whenText(c.when, doc.decisions)}` : ""})</span>
                  </span>
                ))}
              </dd>
            </React.Fragment>
          ))}
        </dl>
      )}
    </div>
  );
}
