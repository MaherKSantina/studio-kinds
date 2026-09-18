/**
 * A `.workup` open — THE EXAMINATION AS A STREAM: the SOURCE (the document
 * under examination, whole), then a stage per LANDED step — its analysis,
 * drawn by its own kind — then THE NEXT STEP, the one thing to do now.
 * Steps whose turn has not come stay out of sight; when every step has
 * landed, the trail ends on the completed examination. The points-view
 * shape: one flat trail, work accreting stage by stage.
 *
 * Read-only everywhere; a host that passes `onChange` (the Workup Studio, a
 * project pane with a writer) additionally gets one-click status stepping —
 * applied by targeted LINE replacement, never parse→dump.
 */
import { useEffect, useMemo, useState } from "react";
import { Box, Chip, Stack, Tooltip, Typography } from "@mui/material";
import { PaneTrail, type TrailPane } from "crosscut";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import {
  STEP_STATUS_CYCLE, analysesOf, nextStep, outputPathOf, parseWorkup, roleOfWorkup,
  setStepStatus, sourcePathOf, statusOfWorkup,
  type StepStatus, type WorkupDoc, type WorkupStep, type WorkupStatus,
} from "../../lib/workupDoc";
import { extensionOfPath, type ViewerProps } from "../../lib/filePreviews";
import FileContentDialog, { FileContentBody } from "../points/FileContentDialog";

const MONO = { fontFamily: "ui-monospace, monospace" } as const;

export const STEP_COLORS: Record<StepStatus, string> = {
  pending: "#94a3b8", running: "#2563eb", done: "#16a34a", failed: "#dc2626",
};
const DOC_COLORS: Record<WorkupStatus, string> = {
  empty: "#94a3b8", pending: "#94a3b8", "in-progress": "#2563eb", attention: "#dc2626", done: "#16a34a",
};

function StatusChip({ status, onCycle }: { status: StepStatus; onCycle?: () => void }) {
  const chip = (
    <Chip size="small" label={status} clickable={!!onCycle} onClick={onCycle}
      sx={{ height: 20, fontSize: 12, fontWeight: 700, textTransform: "uppercase",
            bgcolor: `${STEP_COLORS[status]}1a`, color: STEP_COLORS[status] }} />
  );
  return onCycle
    ? <Tooltip title={`Click: ${status} → ${STEP_STATUS_CYCLE[status]}`}>{chip}</Tooltip>
    : chip;
}

/** One run's telemetry, as the host reports it (the studio polls its worker's
 *  runs table). Everything optional — the viewer renders what it gets. */
export interface WorkupRunInfo {
  status: "running" | "done" | "failed";
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costUsd?: number | null;
  durationMs?: number | null;
  error?: string | null;
  startedAt?: string | null;
}

const fmtTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
const fmtMs = (ms: number) => {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
};
const fmtCost = (c: number) => `$${c >= 0.1 ? c.toFixed(2) : c.toFixed(3)}`;

/** "12.3k in · 2.1k out · $0.14 · 1m 12s" — the run, in one quiet line. */
function RunTelemetry({ run }: { run: WorkupRunInfo }) {
  // A running row shows a live elapsed clock; tick once a second.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (run.status !== "running") return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [run.status]);

  if (run.status === "running") {
    const elapsed = run.startedAt ? Date.now() - new Date(run.startedAt).getTime() : null;
    return (
      <Typography sx={{ fontSize: 12, color: "#2563eb", fontWeight: 650 }}>
        agent running{elapsed !== null ? ` · ${fmtMs(elapsed)}` : ""}{run.model ? ` · ${run.model}` : ""}
      </Typography>
    );
  }
  if (run.status === "failed") {
    return (
      <Tooltip title={run.error ?? "failed"}>
        <Typography sx={{ fontSize: 12, color: "#dc2626", fontWeight: 650, cursor: "default" }} noWrap>
          run failed{run.error ? ` — ${run.error.slice(0, 120)}` : ""}
        </Typography>
      </Tooltip>
    );
  }
  const bits = [
    run.inputTokens != null ? `${fmtTokens(run.inputTokens)} in` : null,
    run.outputTokens != null ? `${fmtTokens(run.outputTokens)} out` : null,
    run.costUsd != null ? fmtCost(Number(run.costUsd)) : null,
    run.durationMs != null ? fmtMs(Number(run.durationMs)) : null,
    run.model ?? null,
  ].filter(Boolean);
  if (!bits.length) return null;
  return <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{bits.join(" · ")}</Typography>;
}

const openFullBtn = (onClick: () => void) => (
  <Tooltip title="Open properly, full size">
    <Box component="button" onClick={onClick}
         sx={{ display: "inline-flex", p: 0.4, border: "none", bgcolor: "transparent",
               cursor: "pointer", color: "#4f46e5", borderRadius: 1, "&:hover": { bgcolor: "#4f46e514" } }}>
      <OpenInFullIcon sx={{ fontSize: 14 }} />
    </Box>
  </Tooltip>
);

/** The first position: the document under examination, whole. */
function SourcePane({ doc, base, source, status, onOpenFull, runsByStep }: {
  doc: WorkupDoc; base: string; source: string | null; status: WorkupStatus;
  onOpenFull: (file: string, label?: string) => void;
  runsByStep?: Record<string, WorkupRunInfo>;
}) {
  const template = roleOfWorkup(doc) === "template";
  // The examination's bill so far — landed runs, summed.
  const totals = Object.values(runsByStep ?? {}).filter((r) => r.status === "done").reduce(
    (a, r) => ({
      n: a.n + 1,
      inTok: a.inTok + (r.inputTokens ?? 0),
      outTok: a.outTok + (r.outputTokens ?? 0),
      cost: a.cost + (r.costUsd != null ? Number(r.costUsd) : 0),
      ms: a.ms + (r.durationMs != null ? Number(r.durationMs) : 0),
    }),
    { n: 0, inTok: 0, outTok: 0, cost: 0, ms: 0 },
  );
  return (
    <Box sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
      <Box sx={{ px: 1.5, py: 0.75, borderBottom: "1px solid", borderColor: "divider", flexShrink: 0 }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
          <Typography sx={{ fontSize: 12.5, fontWeight: 700, minWidth: 0 }} noWrap>{doc.title}</Typography>
          <Chip size="small" label={template ? "template" : status}
            sx={{ height: 20, fontSize: 12, fontWeight: 700, textTransform: "uppercase",
                  bgcolor: template ? "#7c3aed1a" : `${DOC_COLORS[status]}1a`,
                  color: template ? "#7c3aed" : DOC_COLORS[status] }} />
          <Box sx={{ flex: 1 }} />
          {source && <Typography sx={{ fontSize: 12, ...MONO, color: "text.disabled" }}>{source}</Typography>}
          {source && openFullBtn(() => onOpenFull(source, "Source"))}
        </Stack>
        {totals.n > 0 && (
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
            {totals.n} agent run{totals.n === 1 ? "" : "s"} · {fmtTokens(totals.inTok)} in · {fmtTokens(totals.outTok)} out · {fmtCost(totals.cost)} · {fmtMs(totals.ms)}
          </Typography>
        )}
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflow: source && extensionOfPath(source) === "pdf" ? "hidden" : "auto", bgcolor: "#fff" }}>
        {source
          ? <FileContentBody base={base} file={source} />
          : (
            <Typography sx={{ p: 2, fontSize: 13, color: "text.disabled", fontStyle: "italic" }}>
              {template
                ? "A regimen — no source of its own. The project bench stamps it onto documents."
                : "No source declared — this workup examines nothing yet."}
            </Typography>
          )}
      </Box>
    </Box>
  );
}

/** Every step landed: the examination, complete — its analyses listed. */
function CompletePane({ doc, base, onOpenFull, runsByStep }: {
  doc: WorkupDoc; base: string;
  onOpenFull: (file: string, label?: string) => void;
  runsByStep?: Record<string, WorkupRunInfo>;
}) {
  const landed = analysesOf(doc, base);
  return (
    <Box sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
      <Box sx={{ px: 1.5, py: 0.75, borderBottom: "1px solid", borderColor: "divider", flexShrink: 0 }}>
        <Typography sx={{ fontSize: 12.5, fontWeight: 700 }}>
          {doc.steps.length ? "Examination complete" : "No steps yet"}
        </Typography>
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
          {doc.steps.length
            ? "Every step landed its output. The analyses live in the project, under this workup."
            : "Author the regimen, or stamp a template on from the project bench."}
        </Typography>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 1.25 }}>
        {landed.map(({ step, path: out }) => (
          <Box key={step.key} sx={{ mb: 1, border: "1px solid", borderColor: "divider", borderRadius: 1, px: 1.25, py: 0.75 }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
              <Typography sx={{ fontSize: 13, fontWeight: 650, flex: 1, minWidth: 0 }} noWrap>
                {step.label ?? step.key}
              </Typography>
              <Typography sx={{ fontSize: 12, ...MONO, color: "text.disabled" }}>{out}</Typography>
              {openFullBtn(() => onOpenFull(out, step.label ?? step.key))}
            </Stack>
            {runsByStep?.[step.key] && <RunTelemetry run={runsByStep[step.key]} />}
          </Box>
        ))}
        {!landed.length && doc.steps.length > 0 && (
          <Typography sx={{ fontSize: 13, color: "text.disabled", fontStyle: "italic" }}>
            Steps completed without declared outputs — nothing to list.
          </Typography>
        )}
      </Box>
    </Box>
  );
}

export default function WorkupView({ content, height = "100%", agentId, path, onChange, onRunStep, runsByStep }: ViewerProps & {
  /** Host runs a step as an agent session (the studio's play button). */
  onRunStep?: (step: WorkupStep) => void;
  /** Latest run per step key — telemetry the panes render. */
  runsByStep?: Record<string, WorkupRunInfo>;
}) {
  const doc = useMemo(() => parseWorkup(content), [content]);
  // The base every ref resolves against: the workup's own path when known.
  const base = path ?? agentId ?? "/";
  const status = statusOfWorkup(doc);
  const next = nextStep(doc);
  const source = sourcePathOf(doc, base);
  const [full, setFull] = useState<{ file: string; label?: string } | null>(null);

  // Status stepping edits the RAW text by line replacement; the closure over
  // `content` keeps the edit anchored to what is actually on screen.
  const cycle = onChange
    ? (step: WorkupStep) => onChange(setStepStatus(content, step.key, STEP_STATUS_CYCLE[step.status]))
    : undefined;

  const nextIndex = next ? doc.steps.findIndex((s) => s.key === next.key) : -1;
  const stepPaneFor = (s: WorkupStep, i: number): TrailPane => ({
    key: `step:${s.key}`,
    title: s.label ?? s.key,
    render: (
      <StepPane doc={doc} base={base} step={s} index={i}
        cycle={cycle} onOpenFull={(file, label) => setFull({ file, label })}
        onRun={onRunStep} run={runsByStep?.[s.key]} />
    ),
  });
  // Landed steps STAY on the trail — each analysis is a stage of its own.
  const landedPanes = doc.steps
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.status === "done" && s.output)
    .map(({ s, i }) => stepPaneFor(s, i));
  const panes: TrailPane[] = [
    {
      key: "source",
      title: "Source",
      render: <SourcePane doc={doc} base={base} source={source} status={status} runsByStep={runsByStep}
        onOpenFull={(file, label) => setFull({ file, label })} />,
    },
    ...landedPanes,
    next
      ? stepPaneFor(next, nextIndex)
      : {
          key: "complete",
          title: "Examination",
          render: <CompletePane doc={doc} base={base} runsByStep={runsByStep}
            onOpenFull={(file, label) => setFull({ file, label })} />,
        },
  ];

  return (
    <Box sx={{ height, minHeight: 0 }}>
      <PaneTrail className="h-full" panes={panes} />
      <FileContentDialog base={base} file={full?.file ?? null} label={full?.label}
        open={!!full} onClose={() => setFull(null)} />
    </Box>
  );
}

/** THE NEXT STEP — the one thing to do now: its instructions while pending,
 *  the output — drawn by its own kind — the moment it lands. A host that
 *  passes `onRun` gets the play button; `run` is that step's latest run. */
function StepPane({ doc, base, step, index, cycle, onOpenFull, onRun, run }: {
  doc: WorkupDoc; base: string; step: WorkupStep; index: number;
  cycle?: (step: WorkupStep) => void;
  onOpenFull: (file: string, label?: string) => void;
  onRun?: (step: WorkupStep) => void;
  run?: WorkupRunInfo;
}) {
  const out = outputPathOf(doc, base, step);
  const landed = step.status === "done" && !!out;
  const running = step.status === "running" || run?.status === "running";
  return (
    <Box sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
      <Box sx={{ px: 1.5, py: 0.75, borderBottom: "1px solid", borderColor: "divider", flexShrink: 0 }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
          {onRun && !running && (
            <Tooltip title="Run this step as an agent session — the output lands when it finishes">
              <Box component="button" onClick={() => onRun(step)}
                   sx={{ display: "inline-flex", alignItems: "center", justifyContent: "center",
                         width: 24, height: 24, border: "1px solid", borderColor: "#16a34a66",
                         bgcolor: "#16a34a14", color: "#16a34a", borderRadius: "50%",
                         cursor: "pointer", "&:hover": { bgcolor: "#16a34a26" } }}>
                <PlayArrowRoundedIcon sx={{ fontSize: 18 }} />
              </Box>
            </Tooltip>
          )}
          <Typography sx={{ fontSize: 12.5, fontWeight: 700, minWidth: 0 }} noWrap>{step.label ?? step.key}</Typography>
          <Typography sx={{ fontSize: 12, color: "text.disabled" }}>step {index + 1} of {doc.steps.length}</Typography>
          <StatusChip status={step.status} onCycle={cycle && !running ? () => cycle(step) : undefined} />
          <Box sx={{ flex: 1 }} />
          {out && <Typography sx={{ fontSize: 12, ...MONO, color: "text.disabled" }}>{out}</Typography>}
          {landed && openFullBtn(() => onOpenFull(out!, step.label ?? step.key))}
        </Stack>
        {run && <RunTelemetry run={run} />}
        {step.instructions && (
          <Typography sx={{ fontSize: 12, color: "text.secondary", whiteSpace: "pre-wrap" }}>{step.instructions}</Typography>
        )}
        {step.note && <Typography sx={{ fontSize: 12, fontStyle: "italic", color: "text.secondary" }}>{step.note}</Typography>}
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflow: landed && extensionOfPath(out!) === "pdf" ? "hidden" : "auto", bgcolor: "#fff" }}>
        {landed
          ? <FileContentBody base={base} file={out!} />
          : (
            <Box sx={{ p: 2 }}>
              <Typography sx={{ fontSize: 13, color: STEP_COLORS[step.status], fontWeight: 650, mb: 0.5 }}>
                {step.status === "failed" ? "Failed — needs a human before it needs more running."
                  : step.status === "running" ? "Running — the output has not landed yet."
                    : "Pending."}
              </Typography>
              {out && (
                <Typography sx={{ fontSize: 13, color: "text.disabled" }}>
                  The output lands at <Box component="span" sx={{ ...MONO, fontSize: 12 }}>{out}</Box> when this step completes.
                </Typography>
              )}
              {!out && (
                <Typography sx={{ fontSize: 13, color: "text.disabled", fontStyle: "italic" }}>
                  No output declared — this step leaves no analysis behind.
                </Typography>
              )}
            </Box>
          )}
      </Box>
    </Box>
  );
}
