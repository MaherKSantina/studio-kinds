/**
 * The interactive surface of a `.flow` file — three places to stand, down from five.
 *
 *   • Screens  — the spine. A list of screens down the side; pick one and you get its page, where
 *                the parameters that affect it sit next to its screenshot, its states are listed,
 *                and its controls are both authored AND pressed. Pressing one walks the flow.
 *   • Map      — the whole graph at once, for orientation rather than for reading detail.
 *   • Changes  — a typed diff against a base, when this is one half of a `.diff`.
 *
 * "Navigate" and "Play" used to sit between them and are gone. Navigate was a flat list of every
 * control in the model, which asked the reader to carry each one's owning screen in their head;
 * Play was a second walker, so every button existed twice in the UI and the two copies could
 * disagree about whether it was even offered. Both were symptoms of edges living at the top level
 * of the file. Now a control belongs to its screen, so there is one place it can be.
 *
 * The TRAIL lives here rather than on the page, because walking is the one thing that spans
 * screens. It is a list of (screen, assignment) crumbs: pressing a control appends one, clicking a
 * crumb rewinds to it, and picking a screen from the list starts a fresh walk there. Keeping the
 * assignment ON the crumb is what makes rewinding honest — going back restores the parameters you
 * had at that point, including the locals of the screen you were on.
 *
 * There is NO saved-view concept in the UI. The views doc still exists in the file (it is where the
 * global pins and the open tab persist) but it holds exactly one entry and never surfaces as
 * something to manage. A screen's LOCALS are deliberately not persisted there: they reset on
 * arrival by definition, so remembering them across a reload would contradict the model.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box, Typography, ToggleButton, ToggleButtonGroup, Chip, Paper, Stack, Button, IconButton, Tooltip,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import UndoIcon from "@mui/icons-material/Undo";
import { DIFF_OP_COLOR } from "./flowHost";
import { directoryAssetUrl } from "./flowHost";
import FlowScreenPage from "./FlowScreenPage";
import { useFlowPanelFiles } from "./FlowContentPane";
import FlowFramesList from "./FlowFramesList";
import { matchWhen } from "../../lib/flowOps";
import FlowParamBar from "./FlowParamBar";
import FlowGapsList, { flowGaps } from "./FlowGapsList";
import FlowMap from "./FlowMap";
import { useIsNarrow } from "./useIsNarrow";
import FrameEditDialog, { type FrameEditTarget } from "./FrameEditDialog";
import {
  type Assignment, type DimValue, type FlowBody, type FlowDoc, type FlowEdge, type FlowView,
  type FlowViews,
  addScreen, applyDerived, assignmentForVariant, canPromote, canRevert, diffFlow, promoteChange,
  reachFlow, resolveVariant, revertChange, screenAssignment, shotsOf, traverse,
} from "../../lib/flowEngine";
import { MUTED, EMPH, SEL_BG, COND, HOVER_BG } from "./flowPalette";

type Height = number | string;
type Tab = "screens" | "map" | "missing" | "changes" | "frames";

/** One step of the walk: where you are, and everything that is true while you are there. */
interface Crumb { screenId: string; assignment: Assignment; event?: string }


/** Where the reader stands: the screen, and the index of the state on screen (null = the screen's own rendering). */
export interface FlowFocus { screenId: string | null; stateIndex: number | null }

export default function FlowPreview({
  body, doc, views, onViewsChange, onDocChange, editable = true, height = 480, agentId, path, baseBody,
  onWriteModel, onPromote, promoteError, readOnlyReason, onFocus,
}: {
  body: FlowBody;
  doc: FlowDoc;
  views: FlowViews;
  onViewsChange: (next: FlowViews) => void;
  /** Applies a mutation to the MODEL half. Absent when this surface is read-only. */
  onDocChange?: (mutate: (draft: FlowDoc) => { ok: boolean; error?: string }) => void;
  editable?: boolean;
  height?: Height;
  agentId?: string;
  path?: string;
  baseBody?: FlowBody | null;
  /**
   * Rewrites the model even when this side is not an AUTHORING surface — the Diff tab reviews
   * rather than builds, but a revert is still a legitimate write there.
   */
  onWriteModel?: (mutate: (draft: FlowDoc) => { ok: boolean; error?: string }) => void;
  /** Writes into the SOURCE file. Present only on a diff side that resolved its source. */
  onPromote?: (label: string, mutate: (draft: FlowDoc) => { ok: boolean; error?: string }) => void;
  promoteError?: string | null;
  /** Shown in the header when this surface cannot be authored, so "where do I edit?" has an answer. */
  readOnlyReason?: string;
  /** Told where the reader stands whenever it changes — a host's Ask panel aims there. */
  onFocus?: (focus: FlowFocus) => void;
}) {
  const view = views.views[0];
  const layout = view.layout;

  const patchLayout = useCallback((patch: Partial<FlowView["layout"]>) => {
    onViewsChange({ active: view.id, views: [{ ...view, layout: { ...view.layout, ...patch } }] });
  }, [view, onViewsChange]);

  const rawTab = (layout.tab ?? "screens") as Tab;
  const inlineFrameCount = Object.keys(body.frames).length;
  const tab: Tab = (rawTab === "changes" && !baseBody) || (rawTab === "frames" && !inlineFrameCount) ? "screens" : rawTab;

  const startId = layout.focus && body.screens.some((s) => s.id === layout.focus)
    ? layout.focus
    : body.initial && body.screens.some((s) => s.id === body.initial)
      ? body.initial
      : body.screens[0]?.id ?? null;

  // ---------------------------------------------------------------- the walk
  const [trail, setTrail] = useState<Crumb[]>([]);
  // Seed ONLY — never re-seed a live trail. An effect that rebuilt the trail whenever the pinned
  // params changed would throw away the walk every time a chip was flipped, which is the opposite
  // of what flipping a chip means: "show me this screen under different data", not "start over".
  useEffect(() => {
    setTrail((cur) => {
      if (cur.length && body.screens.some((s) => s.id === cur[cur.length - 1].screenId)) return cur;
      return startId ? [{ screenId: startId, assignment: screenAssignment(body, startId, layout.params) }] : [];
    });
  }, [body, startId, layout.params]);

  const here = trail.length ? trail[trail.length - 1] : null;
  const screen = here ? body.screens.find((s) => s.id === here.screenId) ?? null : null;
  const assignment = here?.assignment ?? {};

  /**
   * A state the reader asked to LOOK at that the parameters do not produce.
   *
   * Every path that moves the assignment clears it, explicitly, right here — so it can never
   * drift out of step with the pills and become a second opinion about what the screen shows.
   */
  const [preview, setPreview] = useState<number | null>(null);

  // A frame a state shows, open in the frame editor over this surface (FrameEditDialog) —
  // only where this surface authors the model; read-only hosts keep the link to the Studio.
  const [frameEdit, setFrameEdit] = useState<FrameEditTarget | null>(null);
  const onEditFrame = editable && onDocChange ? setFrameEdit : undefined;

  // What is on screen, for a host that aims at it: the state the parameters produce, or the one
  // the reader asked to look at.
  const focusStateIndex = screen
    ? preview ?? (screen.variants.length ? screen.variants.findIndex((v) => matchWhen(v.when, assignment)) : -1)
    : -1;
  const focusScreenId = screen?.id ?? null;
  useEffect(() => {
    onFocus?.({ screenId: focusScreenId, stateIndex: focusStateIndex >= 0 ? focusStateIndex : null });
  }, [focusScreenId, focusStateIndex, onFocus]);

  /** Replace the crumb you are standing on, leaving the history behind it intact. */
  const patchHere = (patch: Assignment) => {
    setPreview(null);
    setTrail((t) => t.map((c, i) => (i === t.length - 1
      ? { ...c, assignment: applyDerived({ ...c.assignment, ...patch }, body) }
      : c)));
  };

  /** Start a fresh walk at a screen — what clicking the list or the graph means. */
  const goTo = useCallback((id: string) => {
    setPreview(null);
    setTrail([{ screenId: id, assignment: screenAssignment(body, id, layout.params) }]);
    patchLayout({ focus: id });
  }, [body, layout.params, patchLayout]);

  const setParam = (name: string, value: DimValue) => {
    patchHere({ [name]: value });
    // Globals persist into the views doc; locals deliberately do not — see the note at the top.
    if (body.dimensions[name] !== undefined) patchLayout({ params: { ...layout.params, [name]: value } });
  };

  /** Move the parameters until they genuinely produce a state — the opt-in from a preview. */
  const applyState = (index: number) => {
    if (!screen) return;
    const pins = assignmentForVariant(screen, index, body, assignment);
    if (!pins) return;
    patchHere(pins);
    const globals: Assignment = {};
    for (const [k, v] of Object.entries(pins)) if (body.dimensions[k] !== undefined) globals[k] = v;
    if (Object.keys(globals).length) patchLayout({ params: { ...layout.params, ...globals } });
  };

  const press = (edge: FlowEdge) => {
    if (!here) return;
    const step = traverse(body, here.screenId, edge, here.assignment);
    if (!step) return;
    setPreview(null);
    setTrail((t) => [...t, { screenId: step.screen, assignment: step.assignment, event: edge.event }]);
    patchLayout({ focus: step.screen });
  };

  const rewind = (index: number) => {
    setPreview(null);
    setTrail((t) => t.slice(0, index + 1));
    const crumb = trail[index];
    if (crumb) patchLayout({ focus: crumb.screenId });
  };

  // The reach is computed from the pinned GLOBALS, not from the crumb: "can this screen be got to
  // at all with this data" is a question about the model, not about where you happen to stand.
  const reach = useMemo(() => reachFlow(body, layout.params), [body, layout.params]);
  const listAssignment = useMemo(() => screenAssignment(body, startId ?? "", layout.params), [body, startId, layout.params]);

  // ---------------------------------------------------------------- screenshots
  const [urls, setUrls] = useState<Record<string, string>>({});
  const allKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const s of body.screens) {
      for (const k of shotsOf(s)) keys.add(k);
      for (const v of s.variants) {
        for (const k of shotsOf(v)) keys.add(k);
      }
    }
    return [...keys];
  }, [body]);

  useEffect(() => {
    if (!agentId || !path || !allKeys.length) { setUrls({}); return; }
    let cancelled = false;
    void Promise.all(allKeys.map(async (key) =>
      [key, await directoryAssetUrl(agentId, path, key).catch(() => "")] as const,
    )).then((pairs) => {
      if (cancelled) return;
      setUrls(Object.fromEntries(pairs.filter(([, u]) => u)));
    });
    return () => { cancelled = true; };
  }, [agentId, path, allKeys]);

  // ---------------------------------------------------------------- referenced files
  // The other half of a state's content: files it points at, fetched once each. Loaded HERE rather
  // than on the page so a walk between screens does not re-read the same `.brief` on every step.
  const panelFiles = useFlowPanelFiles(body, agentId);

  /** Resolve one just-uploaded key straight away, so the thumbnail appears on the same click. */
  const addAssetUrl = useCallback((key: string) => {
    if (!agentId || !path) return;
    void directoryAssetUrl(agentId, path, key)
      .then((url) => setUrls((cur) => ({ ...cur, [key]: url })))
      .catch(() => {});
  }, [agentId, path]);

  const diff = useMemo(() => (baseBody ? diffFlow(baseBody, body) : null), [baseBody, body]);
  const gapCount = useMemo(() => flowGaps(body, baseBody).filter((g) => !g.inherits).length, [body, baseBody]);
  const narrow = useIsNarrow();

  /** Stand on a screen with the parameters that produce one of its states. */
  const openState = useCallback((screenId: string, variantIndex: number) => {
    const target = body.screens.find((s) => s.id === screenId);
    if (!target) return;
    const solved = variantIndex < 0
      ? null
      : assignmentForVariant(target, variantIndex, body, screenAssignment(body, target.id, layout.params));
    const globals: Assignment = { ...layout.params };
    for (const [k, v] of Object.entries(solved ?? {})) if (body.dimensions[k] !== undefined) globals[k] = v;
    setPreview(null);
    setTrail([{
      screenId: target.id,
      assignment: applyDerived({ ...screenAssignment(body, target.id, globals), ...(solved ?? {}) }, body),
    }]);
    patchLayout({ tab: "screens", focus: target.id, params: globals });
  }, [body, layout.params, patchLayout]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height, minHeight: 0, gap: 1 }}>
      {/* ---- where to stand. Nothing else: the parameters live on the surfaces themselves. */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}>
        <Typography sx={{ fontSize: 13, color: MUTED }}>
          {body.screens.length} screen{body.screens.length === 1 ? "" : "s"} ·{" "}
          {body.screens.reduce((n, sc) => n + Math.max(1, sc.variants.length), 0)} states
        </Typography>
        {readOnlyReason
          ? <Chip size="small" label={readOnlyReason} sx={{ height: 20, fontSize: 12, color: MUTED }} variant="outlined" />
          : onDocChange && editable
            ? <Chip size="small" label="editing" sx={{ height: 20, fontSize: 12, bgcolor: SEL_BG, color: EMPH }} />
            : null}
        <Box sx={{ flex: 1 }} />
        <ToggleButtonGroup
          size="small" exclusive value={tab}
          onChange={(_, v) => v && patchLayout({ tab: v })}
          sx={{ "& .MuiToggleButton-root": { py: 0.25, px: 1.25, fontSize: 13, textTransform: "none" } }}
        >
          <ToggleButton value="screens">Screens</ToggleButton>
          <ToggleButton value="map">Map</ToggleButton>
          <ToggleButton value="missing">
            Missing{gapCount > 0 ? ` (${gapCount})` : ""}
          </ToggleButton>
          {inlineFrameCount > 0 && <ToggleButton value="frames">Frames ({inlineFrameCount})</ToggleButton>}
          {baseBody && <ToggleButton value="changes">Changes</ToggleButton>}
        </ToggleButtonGroup>
      </Box>

      {/* ---- the parameters, in ONE place. Not per screen: they are facts about the walk. */}
      {tab === "screens" && (
        <FlowParamBar body={body} screen={screen} assignment={assignment} onSetParam={setParam} />
      )}

      {/* ---- the trail. Only while walking: one crumb is standing still, not a journey. */}
      {tab === "screens" && trail.length > 1 && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.4, flexShrink: 0, flexWrap: "wrap" }}>
          <Tooltip title="Back one step">
            <IconButton size="small" onClick={() => rewind(trail.length - 2)}>
              <ArrowBackIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Start this walk again">
            <IconButton size="small" onClick={() => rewind(0)}>
              <RestartAltIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
          {trail.map((c, i) => {
            const sc = body.screens.find((s) => s.id === c.screenId);
            const last = i === trail.length - 1;
            return (
              <Box key={`${c.screenId}-${i}`} sx={{ display: "flex", alignItems: "center", gap: 0.4 }}>
                {c.event && <Typography sx={{ fontSize: 12, color: MUTED }}>—{c.event}→</Typography>}
                <Chip
                  size="small"
                  label={`${sc?.title ?? c.screenId}${sc ? ` · ${resolveVariant(sc, c.assignment)?.label ?? "—"}` : ""}`}
                  onClick={last ? undefined : () => rewind(i)}
                  sx={{
                    height: 20, fontSize: 12, maxWidth: 260,
                    ...(last ? { bgcolor: SEL_BG, color: EMPH, fontWeight: 700 } : { cursor: "pointer" }),
                  }}
                />
              </Box>
            );
          })}
        </Box>
      )}

      <Box sx={{
        flex: 1, minHeight: 0, border: "1px solid", borderColor: "divider", borderRadius: 0.5,
        overflow: "hidden", display: "flex",
        // Narrow: the list stops being a left rail and becomes a strip across the top, because a
        // 232px rail plus three content columns needs ~950px before the right-hand one clips off.
        flexDirection: narrow ? "column" : "row",
      }}>
        {/* The screen LIST is the spine of the Screens tab — one row per screen, showing which
            state it is currently in, so picking a screen is a navigation act rather than a scan. */}
        {tab === "screens" && (
          <Box sx={narrow
            ? {
                flexShrink: 0, display: "flex", overflowX: "auto", overflowY: "hidden",
                borderBottom: "1px solid", borderColor: "divider",
                "& > *": { flexShrink: 0, minWidth: 168, borderRight: "1px solid", borderColor: "divider" },
              }
            : { width: 232, flexShrink: 0, overflow: "auto", borderRight: "1px solid", borderColor: "divider" }}>
            {onDocChange && editable && (
              <Box sx={{ px: 1, py: 0.6, borderBottom: "1px solid", borderColor: "divider" }}>
                <Button size="small" startIcon={<AddIcon sx={{ fontSize: 15 }} />}
                  onClick={() => onDocChange((d) => addScreen(d, { title: `Screen ${body.screens.length + 1}` }))}
                  sx={{ fontSize: 13, textTransform: "none", color: MUTED }}>
                  Add screen
                </Button>
              </Box>
            )}
            {body.screens.map((s) => {
              // Each row previews the screen as it opens: its own locals at their defaults, under
              // the pinned globals. Using the crumb's assignment here would leak the screen you
              // are standing on into every other row.
              const at = s.id === here?.screenId ? assignment : screenAssignment(body, s.id, layout.params);
              const v = resolveVariant(s, at);
              const live = reach.screens.has(s.id);
              const on = s.id === here?.screenId;
              const screenDeco = diff?.deco.get(`screen:${s.id}`);
              // How many of this screen's states the diff touched — the number you actually want
              // on a list row, since a screen "changed" is far less useful than "gained 3 states".
              const touched = diff
                ? s.variants.filter((x) => diff.deco.has(`variant:${s.id}:${x.label}`)).length
                : 0;
              return (
                <Box
                  key={s.id}
                  onClick={() => goTo(s.id)}
                  sx={{
                    px: 1, py: 0.7, cursor: "pointer", borderLeft: "3px solid",
                    borderLeftColor: screenDeco ? DIFF_OP_COLOR[screenDeco.op] : on ? EMPH : "transparent",
                    bgcolor: screenDeco ? `${DIFF_OP_COLOR[screenDeco.op]}12` : on ? HOVER_BG : "transparent",
                    opacity: live ? 1 : 0.5,
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  <Typography sx={{ fontSize: 13, fontWeight: on ? 700 : 500, lineHeight: 1.3 }}>{s.title}</Typography>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    {v && <Typography sx={{ fontSize: 12, color: COND }} noWrap>{v.label}</Typography>}
                    <Box sx={{ flex: 1, minWidth: 4 }} />
                    {touched > 0 && (
                      <Chip size="small" label={`${touched} changed`}
                        sx={{ height: 20, fontSize: 12, bgcolor: `${DIFF_OP_COLOR.edit}33`, color: DIFF_OP_COLOR.edit }} />
                    )}
                    {s.localOrder.length > 0 && (
                      <Tooltip title={`Owns ${s.localOrder.join(", ")}`}>
                        <Chip size="small" label="state" sx={{ height: 20, fontSize: 12, color: MUTED }} variant="outlined" />
                      </Tooltip>
                    )}
                    {s.variants.length > 1 && (
                      <Chip size="small" label={`${s.variants.length}`} sx={{ height: 20, fontSize: 12 }} />
                    )}
                  </Box>
                  {!live && <Typography sx={{ fontSize: 12, color: MUTED }}>unreachable here</Typography>}
                </Box>
              );
            })}
          </Box>
        )}

        <Box sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          {tab === "screens" && screen && (
            <FlowScreenPage
              body={body}
              screen={screen}
              assignment={assignment}
              urls={urls}
              files={panelFiles}
              preview={preview}
              onPreview={setPreview}
              onApplyState={applyState}
              onPress={press}
              editable={editable}
              agentId={agentId}
              path={path}
              onDocChange={onDocChange}
              onEditFrame={onEditFrame}
              onAssetAdded={addAssetUrl}
              deco={diff?.deco}
              baseBody={baseBody}
              changes={diff?.changes}
              onRevert={onWriteModel && baseBody
                ? (c) => onWriteModel((d) => revertChange(d, c, baseBody, body))
                : undefined}
              onPromote={onPromote && baseBody
                ? (c) => onPromote(c.label, (d) => promoteChange(d, c, baseBody, body))
                : undefined}
              promoteError={promoteError}
            />
          )}
          <FrameEditDialog target={frameEdit} body={body} folder={(agentId ?? "").replace(/\/+$/, "")} onDocChange={onDocChange} onClose={() => setFrameEdit(null)} />
          {tab === "map" && (
            <FlowMap
              body={body} assignment={listAssignment} reach={reach}
              labelVariants={layout.labelVariants} focus={here?.screenId ?? null}
              onFocus={(id) => { goTo(id); patchLayout({ tab: "screens", focus: id }); }}
              onToggleVariants={() => patchLayout({ labelVariants: !layout.labelVariants })}
            />
          )}
          {tab === "frames" && <FlowFramesList body={body} agentId={agentId} path={path} onDocChange={editable ? onDocChange : undefined} onEditFrame={onEditFrame} />}
          {tab === "missing" && (
            <FlowGapsList body={body} baseBody={baseBody} onOpen={openState} onDocChange={editable ? onDocChange : undefined} />
          )}
          {tab === "changes" && diff && baseBody && (
            <ChangesList
              changes={diff.changes}
              // Directed reset: put THIS row back to what the Original has, leaving every other
              // change alone. The pane's own Reset is all-or-nothing — to recover one screenshot
              // you had to discard the whole proposal.
              onRevert={onWriteModel
                ? (c) => onWriteModel((d) => revertChange(d, c, baseBody, body))
                : undefined}
              // Clicking a change OPENS it: start a walk at that screen and, for a state, solve for
              // the parameters that select it, so you land looking at the thing the row describes.
              onOpen={(c) => {
                if (!c.screenId) return;
                openState(c.screenId, c.variantIndex ?? -1);
              }}
            />
          )}
        </Box>
      </Box>
    </Box>
  );
}

function ChangesList({
  changes, onOpen, onRevert,
}: {
  changes: ReturnType<typeof diffFlow>["changes"];
  onOpen: (c: ReturnType<typeof diffFlow>["changes"][number]) => void;
  /** Absent when this side is read-only. */
  onRevert?: (c: ReturnType<typeof diffFlow>["changes"][number]) => void;
}) {
  if (!changes.length) {
    return <Box sx={{ p: 2 }}><Typography sx={{ fontSize: 12, color: MUTED }}>No differences.</Typography></Box>;
  }
  const groups = [
    { kind: "dimension", label: "Parameters" },
    { kind: "screen", label: "Screens" },
    { kind: "variant", label: "States" },
    { kind: "edge", label: "Navigation" },
  ];
  return (
    <Box sx={{ height: "100%", overflow: "auto", p: 1 }}>
      {groups.map((g) => {
        const rows = changes.filter((c) => c.kind === g.kind);
        if (!rows.length) return null;
        return (
          <Box key={g.kind} sx={{ mb: 1.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>
              {g.label} ({rows.length})
            </Typography>
            <Stack spacing={0.5} sx={{ mt: 0.5 }}>
              {rows.map((c) => {
                const openable = !!c.screenId && c.op !== "delete";
                return (
                  <Paper
                    key={c.id} variant="outlined"
                    onClick={openable ? () => onOpen(c) : undefined}
                    sx={{
                      p: 0.75, borderLeft: "3px solid", borderLeftColor: DIFF_OP_COLOR[c.op],
                      bgcolor: `${DIFF_OP_COLOR[c.op]}12`,
                      ...(openable ? { cursor: "pointer", "&:hover": { bgcolor: `${DIFF_OP_COLOR[c.op]}22` } } : null),
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75, flexWrap: "wrap" }}>
                      <Chip size="small" label={c.op} sx={{ height: 20, fontSize: 12, bgcolor: `${DIFF_OP_COLOR[c.op]}44` }} />
                      <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{c.label}</Typography>
                      {c.fields.map((f) => <Typography key={f} sx={{ fontSize: 12, color: COND }}>{f}</Typography>)}
                      <Box sx={{ flex: 1 }} />
                      {onRevert && canRevert(c) && (
                        <Tooltip title="Put just this back to what the Original has. Every other change is left alone.">
                          <Button
                            size="small" startIcon={<UndoIcon sx={{ fontSize: 13 }} />}
                            onClick={(e) => { e.stopPropagation(); onRevert(c); }}
                            sx={{ fontSize: 12, textTransform: "none", py: 0, minWidth: 0, color: MUTED }}
                          >
                            Reset
                          </Button>
                        </Tooltip>
                      )}
                      {openable && <Typography sx={{ fontSize: 12, color: MUTED }}>open →</Typography>}
                    </Box>
                    {c.detail && (
                      // pre-line: a control can change in three separable ways at once, and each
                      // gets its own before → after line rather than running them together.
                      <Typography sx={{ fontSize: 12, color: MUTED, fontFamily: "ui-monospace, monospace", mt: 0.25, whiteSpace: "pre-line" }}>{c.detail}</Typography>
                    )}
                  </Paper>
                );
              })}
            </Stack>
          </Box>
        );
      })}
    </Box>
  );
}
