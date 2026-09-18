/**
 * Questions at the top, the answer underneath — built from the design-system
 * pieces: `DecisionPills` narrows, `EventRow` lists the steps. The same shape as the playbook, because it IS the same
 * shape: an assignment scoping a list of entities — events there, steps here.
 *
 * The assignment is LOCAL STATE and is never written back. This is how you
 * narrowed a page, not a fact about the business, and saving it would make
 * next week's reader inherit last week's situation.
 */
import { useMemo, useState } from "react";
import { Box, Chip, Stack, Tooltip, Typography } from "@mui/material";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import { DecisionPills, EventRow, OneDList, applyRefs, impliedLocks, pruneLocks, splitRef } from "crosscut";
import { previewForPath } from "../../lib/filePreviews";
import { narrowing, parseGuide, stepsAt, type GuideStep } from "../../lib/guideDoc";

export default function GuidePreview({ content, height = "100%", agentId, path,
                                       context = [], onDrill }: {
  content: string;
  height?: number | string;
  agentId?: string;
  path?: string;
  /** The enclosing assignment. A guide can condition on it without owning it. */
  context?: string[];
  /** When the host can open panes (PaneTrail), a step click drills its detail
   *  into one instead of expanding inline. */
  onDrill?: (pane: { key: string; title: string; render: () => React.ReactNode }) => void;
}) {
  const doc = useMemo(() => parseGuide(content), [content]);
  // Only what YOU chose is stored; the effective assignment is derived.
  const [manual, setManual] = useState<string[]>([]);
  const [openStep, setOpenStep] = useState<string | null>(null);
  const locks = useMemo(
    () => impliedLocks(doc.decisions, pruneLocks(doc.decisions, manual, context), context),
    [doc.decisions, manual, context]);
  const md = useMemo(() => previewForPath("section.md"), []);

  const shown = stepsAt(doc, locks, context);
  const n = narrowing(doc, locks, context);

  const stepRow = (x: GuideStep, i: number) => {
    const expandable = !!x.detail;
    const open = openStep === x.key;
    const detailBody = () => (
      <Box sx={{ p: 1 }}>
        {md && x.detail
          ? <md.Renderer content={x.detail} height="auto" agentId={agentId} path={path} />
          : <Typography sx={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{x.detail}</Typography>}
      </Box>
    );
    const toggle = !expandable ? undefined
      : onDrill
        ? () => { setOpenStep(x.key); onDrill({ key: `step:${x.key}`, title: x.label, render: detailBody }); }
        : () => setOpenStep(open ? null : x.key);
    return (
      <EventRow
        label={x.label}
        annotateTarget={`step:${x.key}`}
        leading={
          <span style={{ fontSize: 12, fontWeight: 700, width: 16, display: "inline-block",
                         textAlign: "right", color: x.emphasis ? "#b45309" : undefined }}
                className={x.emphasis ? undefined : "text-muted-foreground"}>
            {i + 1}.
          </span>
        }
        meta={x.effort}
        badge={x.negotiable === "fixed" ? (
          <Tooltip title="Cannot be dropped or moved — a schedule works around it">
            <Box component="span" sx={{ px: 0.5, borderRadius: 0.5, fontSize: 12, border: "1px solid",
                                        borderColor: "#b4530966", color: "#b45309" }}>
              fixed
            </Box>
          </Tooltip>
        ) : undefined}
        open={open}
        onToggle={toggle}
        className={x.emphasis ? "border-warning/60 bg-warning/5" : undefined}
      >
        {x.detail && !onDrill && (
          <div className="border-t px-2 py-1">
            {md
              ? <md.Renderer content={x.detail} height="auto" agentId={agentId} path={path} />
              : <Typography sx={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{x.detail}</Typography>}
          </div>
        )}
      </EventRow>
    );
  };

  return (
    <Box sx={{ height, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {!!doc.decisions.length && (
        <Box sx={{ flexShrink: 0, p: 1.25, borderBottom: "1px solid", borderColor: "divider",
                   bgcolor: "#f1f3f7" }}>
          <Stack direction="row" sx={{ alignItems: "center", mb: 0.6 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase",
                              letterSpacing: 0.6, color: "text.disabled", flex: 1 }}>
              Narrow this · {n.shown} of {n.total} steps apply
            </Typography>
            {!!manual.length && (
              <Tooltip title="Drop your answers">
                <Chip size="small" icon={<RestartAltIcon sx={{ fontSize: 13 }} />} label="reset"
                      onClick={() => setManual([])}
                      sx={{ height: 18, fontSize: 12, cursor: "pointer",
                            bgcolor: "transparent", color: "text.disabled",
                            border: "1px solid", borderColor: "#c3c9d2" }} />
              </Tooltip>
            )}
          </Stack>

          <DecisionPills
            decisions={doc.decisions}
            value={locks}
            context={context}
            onToggleRef={(ref, isOn) => setManual((cur) =>
              isOn ? cur.filter((l) => splitRef(l)[0] !== splitRef(ref)[0])
                   : applyRefs(cur, [ref]))}
          />
        </Box>
      )}

      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 1.25 }}>
        <OneDList items={shown} keyOf={(x) => x.key} renderItem={stepRow}
          empty={(
            <Typography sx={{ fontSize: 13, color: "#a16207", fontStyle: "italic" }}>
              No steps for these answers. Either a combination nobody has written a procedure for,
              or one that cannot happen — worth knowing which.
            </Typography>
          )} />
      </Box>
    </Box>
  );
}
