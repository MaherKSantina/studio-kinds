/**
 * ONE screen's page — and, since this rewrite, the ONLY place you stand in a flow.
 *
 * This is what a `.walkthrough`'s states become once they are grouped by screen: instead of
 * "Request Payment - Shipping", "Request Payment SYI Shipping - Free" and "…- Flat" being three
 * unrelated entries in a flat list, they are one screen with three renderings, and you switch
 * between them by changing the DATA rather than by scrolling to a different item.
 *
 * It absorbed two tabs that used to sit beside it. "Navigate" was a flat list of every control in
 * the model, which asked you to hold in your head which screen each one belonged to; here a control
 * is authored on the screen it sits on, because that is where it is. "Play" was a separate walker,
 * which meant the same button existed twice in the UI — once to edit and once to press — and the
 * two could disagree about whether it was even offered. Now you press the control you are looking
 * at, and the walk moves the page.
 *
 * The parameters are NOT here. They used to be, filtered to "what changes this screen", which was
 * useful and also misleading: it made a fact about the journey read as a property of a page, so
 * setting it felt like something to redo everywhere it appeared. They live in one shared bar above
 * (`FlowParamBar`); this page just reacts to them.
 *
 * Reacting means two different things, and keeping them apart is what stops the old bugs coming
 * back. A CONTROL that does not apply is dead: dimmed, and not clickable, because pressing it
 * would be claiming a route the parameters do not permit. A STATE that does not apply is only
 * dimmed: you can still open it and look at its content, because looking is not walking.
 *
 * What a state SHOWS is no longer this file's business. It hands a panel list to `FlowContentPane`
 * — screenshots, referenced `.brief`/`.list`/whatever files, in whatever mix the model declares —
 * and keeps only the questions that are actually about the page: which state is on screen, which
 * controls are offered, and what the proposal changed.
 */
import { useEffect, useRef, useState } from "react";
import {
  Box, Typography, Chip, Paper, IconButton, Stack, Tooltip, CircularProgress,
} from "@mui/material";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import RefreshIcon from "@mui/icons-material/Refresh";
import UndoIcon from "@mui/icons-material/Undo";
import NorthIcon from "@mui/icons-material/North";
import FlowStateDialog, { type StateDraft } from "./FlowStateDialog";
import { useIsNarrow } from "./useIsNarrow";
import FlowEdgeDialog, { type EdgeDraft } from "./FlowEdgeDialog";
import { DIFF_OP_COLOR } from "./flowHost";
import { uploadDirectoryAsset } from "./flowHost";
import FlowContentPane from "./FlowContentPane";
import {
  type Assignment, type FlowBody, type FlowChange, type FlowDoc, type FlowEdge, type FlowPanel,
  type FlowScreen,
  addEdge, addVariant, availableEdges, canPromote, canRevert, deleteEdge, deleteVariant, matchWhen,
  panelsOf, resolveEdge, screenRenderings, shotsOf, updateEdge, updateScreen, updateVariant,
} from "../../lib/flowEngine";
import { framePanelOf, mergeStatePanels } from "../../lib/flowOps";
import { MUTED, EMPH, SEL_BG, COND, PANE_BG, HOVER_BG } from "./flowPalette";
import type { FrameEditTarget } from "./FrameEditDialog";


const whenText = (w: unknown): string => {
  if (w === "*" || !w || typeof w !== "object") return "always";
  // A list of ALTERNATIVES — any one matching is enough. Tested before the key count, because
  // `Object.keys` on an array yields its INDICES, so a two-group condition was read as a
  // conjunction and rendered "0 = [object Object] · 1 = [object Object]". Groups holding more than
  // one clause are parenthesised, so "(a = 1 · b = 2) or c = 3" cannot be read as one conjunction.
  if (Array.isArray(w)) {
    if (!w.length) return "always";
    return w.map((g) => {
      const multi = !!g && typeof g === "object" && !Array.isArray(g) && Object.keys(g).length > 1;
      return multi ? `(${whenText(g)})` : whenText(g);
    }).join("  or  ");
  }
  if (!Object.keys(w).length) return "always";
  return Object.entries(w as Record<string, unknown>)
    .map(([k, v]) => `${k} = ${Array.isArray(v) ? v.join(" or ") : String(v)}`)
    .join("  ·  ");
};

/**
 * WHY a control is not on the screen, in terms of the parameters rather than the mechanism.
 *
 * A control usually says so itself, in its `when`. But a dispatch can also fail to offer one, by
 * matching no branch — which is legitimate when the availability is a disjunction across DIFFERENT
 * dimensions ("the pickup-only form needs nothing picked, the shipping one needs a method"), since
 * a `when` is a conjunction and cannot say that. Reporting that as "no branch matches" described
 * the engine and told the reader nothing; listing what the branches WOULD need answers the actual
 * question, which is what to change.
 */
function notOfferedBecause(edge: FlowEdge, a: Assignment): string {
  if (!matchWhen(edge.when, a)) return `only when ${whenText(edge.when)}`;
  const needs = [...new Set(edge.dispatch.map((b) => whenText(b.when)))];
  return needs.length ? `needs ${needs.join("   or   ")}` : "leads nowhere here";
}

export default function FlowScreenPage({
  body, screen, assignment, urls, files, preview, onPreview, onApplyState, onPress, editable, agentId, path,
  onDocChange, onAssetAdded, deco, changes, onRevert, onPromote, promoteError, baseBody, onEditFrame,
}: {
  body: FlowBody;
  screen: FlowScreen;
  /** The full assignment in force here: globals, this screen's locals, and derived values. */
  assignment: Assignment;
  urls: Record<string, string>;
  /** Bodies of the files this flow's states reference, keyed by `panelFileKey`. */
  files: Record<string, string>;
  /**
   * A state the reader asked to LOOK AT even though the parameters do not produce it, or null.
   *
   * Deliberately separate from the assignment and cleared the moment the assignment moves, so the
   * page still has exactly one source of truth for what it renders. An earlier attempt reconciled
   * "what you pinned" against "where the walk arrived" with a scoring heuristic, which had no
   * right answer when two candidates tied and made states silently unclickable.
   */
  preview: number | null;
  /** Look at the Nth state without touching the parameters. */
  onPreview: (index: number | null) => void;
  /** Move the parameters so they actually produce the Nth state. */
  onApplyState: (index: number) => void;
  /** Press a control and walk. */
  onPress: (edge: FlowEdge) => void;
  editable: boolean;
  /** Needed to upload a screenshot; without them the add-screenshot control is hidden. */
  agentId?: string;
  path?: string;
  /** Applies a mutation to the MODEL half. Absent when this surface is read-only. */
  onDocChange?: (mutate: (draft: FlowDoc) => { ok: boolean; error?: string }) => void;
  /** Opens the frame editor over a frame a state shows — kept inline, or a file beside the flow. */
  onEditFrame?: (target: FrameEditTarget) => void;
  /** Called with a freshly uploaded key so the host can resolve its URL without a reload. */
  onAssetAdded?: (key: string) => void;
  /** Diff decorations, when this page is one side of a `.diff`. Keys: `variant:<screenId>:<label>`. */
  deco?: Map<string, { op: "add" | "edit" | "delete" }>;
  /**
   * The diff's change rows, so a card can act on ITSELF.
   *
   * Reviewing happens here, on the thing you are looking at — sending someone to a separate list
   * to reset the state they have on screen is the same mistake the old Navigate tab made.
   */
  changes?: FlowChange[];
  /** Put this row back to what the Original has. */
  onRevert?: (c: FlowChange) => void;
  /** Write this row INTO the Original — "this is not a proposal, it is existing behaviour". */
  onPromote?: (c: FlowChange) => void;
  promoteError?: string | null;
  /** The Original side, when this page is one half of a `.diff`. */
  baseBody?: FlowBody | null;
}) {
  const narrow = useIsNarrow();
  const renderings = screenRenderings(screen);

  /**
   * The diff row for one card, looked up by the SAME name identity the diff matched on. A card
   * carries its own review actions only when there is actually a change to act on.
   */
  const changeFor = (kind: "variant" | "edge", name: string): FlowChange | undefined =>
    changes?.find((c) => c.kind === kind && c.screenTitle === screen.title
      && (kind === "variant" ? c.variantLabel === name : c.event === name));

  /** Reset / Promote, rendered identically on a state card and on a control card. */
  const reviewActions = (c: FlowChange | undefined) => (c && (onRevert || onPromote) ? (
    <Box sx={{ display: "flex", gap: 0.25 }} onClick={(e) => e.stopPropagation()}>
      {onRevert && canRevert(c) && (
        <Tooltip title="Put this back to what the Original has. Nothing else changes.">
          <IconButton size="small" onClick={() => onRevert(c)}><UndoIcon sx={{ fontSize: 13 }} /></IconButton>
        </Tooltip>
      )}
      {onPromote && canPromote(c) && (
        <Tooltip title="This is existing behaviour, not a proposal — move it into the Original so both sides agree.">
          <IconButton size="small" onClick={() => onPromote(c)}><NorthIcon sx={{ fontSize: 13 }} /></IconButton>
        </Tooltip>
      )}
    </Box>
  ) : null);
  /** What the PARAMETERS produce. The truth of the page. */
  const activeIndex = screen.variants.length
    ? screen.variants.findIndex((v) => matchWhen(v.when, assignment))
    : 0;
  /** What is on SCREEN — the same thing, unless the reader asked to look at something else. */
  const shownIndex = preview ?? activeIndex;
  const shown = shownIndex >= 0 ? renderings[shownIndex] : null;
  const previewing = preview !== null && preview !== activeIndex;
  const panels: FlowPanel[] = shown?.panels ?? [];
  /** The screenshot half of what is shown — the upload control appends to exactly this. */
  const shots = shown?.shots ?? [];

  /**
   * What the ORIGINAL shows for THIS state — keyed on (screen title, state label) and nothing else.
   *
   * That pair is the diff's own identity, so this cannot disagree with what the diff reports. No
   * match means no image: a state the proposal ADDS has no counterpart today, and showing another
   * state's pixels in its place would be inventing evidence. An earlier version fell back to the
   * screen's catch-all and then to "any state with a capture", which made a brand-new state look
   * photographed — the Missing tab is where an absent capture belongs, not a borrowed one.
   *
   * The one step past the exact match is not a guess: a variant with no shots of its own renders
   * the SCREEN's, which is how `screenRenderings` resolves on both sides. Asking the base what it
   * renders for a matched state is still asking about that state.
   */
  const baseScreen = baseBody?.screens.find((s) => s.title === screen.title);
  const basePanelsFor = (label: string): FlowPanel[] => {
    if (!baseScreen) return [];
    // A screen with no variants IS its own single rendering — matched only when both sides agree
    // that this screen has no states, so there is no ambiguity about which state is meant.
    if (!screen.variants.length && !baseScreen.variants.length) return panelsOf(baseScreen);
    const exact = baseScreen.variants.find((v) => v.label === label);
    if (!exact) return [];
    return panelsOf(exact).length ? panelsOf(exact) : panelsOf(baseScreen);
  };
  const basePanels = shown ? basePanelsFor(shown.label) : [];

  /** Only worth two columns when the content actually differs — twice the same thing says nothing. */
  const sideBySide = panels.length > 0 && basePanels.length > 0
    && JSON.stringify(panels) !== JSON.stringify(basePanels);
  const carriedOver = panels.length === 0 && basePanels.length > 0;
  const emptyText = shown ? `Nothing to show for “${shown.label}”` : "No state matches these parameters";
  /**
   * A referenced document needs room a phone screenshot does not: a `.brief` is a tree beside a
   * body of prose, and squeezed into a 300px column it is unreadable. The column widens only when
   * the state actually shows one, so a screenshot flow looks exactly as it did.
   */
  const wide = [...panels, ...basePanels].some((p) => p.kind === "file");
  /**
   * Width of the THREE-COLUMN ROW itself, not of the window.
   *
   * `useIsNarrow` asks the WINDOW, and the window is not what this row gets: two resizable rails
   * (the space list and the file tree) sit between them. Only the row can answer "is there room".
   *
   * Applied to DOCUMENT panels only, deliberately. The window rule is wrong for screenshots too —
   * at 1500px with the file tree opened wide this row is 699px and wants 866, so the states column
   * loses its right edge — but the remedy there costs more than the fault: stacking caps the
   * screenshot at a fixed height, and looking at screenshots is what that surface is FOR. Left as
   * it is until it is worth its own change.
   *
   * Measuring the ROW rather than its contents is what keeps this stable: stacking changes how the
   * children lay out, never how wide their container is, so there is no feedback loop.
   */
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [rowWidth, setRowWidth] = useState(0);
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    // Measured ONCE up front as well as on every resize. A ResizeObserver only delivers while the
    // page is being rendered, so a tab restored from the background could sit at width 0 — which
    // would read as "not measured yet" and leave the row in its widest layout, clipping the very
    // column this is here to rescue.
    const measure = () => setRowWidth(el.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // A DOCUMENT needs far more room than a screenshot before three columns are honest: a phone
  // capture is legible at 300px, a `.brief` is a tree beside prose and is not.
  const stacked = narrow || (wide && rowWidth > 0 && rowWidth < 1150);

  // ---------------------------------------------------------------- authoring
  const authoring = editable && !!onDocChange;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const run = (mutate: (d: FlowDoc) => { ok: boolean; error?: string }) => {
    if (!onDocChange) return;
    setError(null);
    onDocChange((draft) => {
      const r = mutate(draft);
      if (!r.ok) setError(r.error ?? "rejected");
      return r;
    });
  };

  const onPickFiles = async (files: FileList | null) => {
    if (!files?.length || !agentId || !path) return;
    setBusy(true);
    setError(null);
    try {
      const added: string[] = [];
      for (const file of Array.from(files)) {
        const { key: k } = await uploadDirectoryAsset(agentId, path, file, file.name);
        added.push(k);
        onAssetAdded?.(k);
      }
      // Onto whatever is being LOOKED at, which is the thing whose pixels you just captured.
      const next = [...shots, ...added];
      if (screen.variants.length && shownIndex >= 0) run((d) => updateVariant(d, screen.id, shownIndex, { screenshots: next }));
      else run((d) => updateScreen(d, screen.id, { screenshots: next }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  // -1 = adding, >=0 = editing that index, null = closed.
  const [editing, setEditing] = useState<number | null>(null);
  // A screen with no `variants` has exactly one rendering, and its shots live on the screen itself.
  // The dialog edits those rather than pretending there is a state to condition.
  const screenLevel = screen.variants.length === 0;
  const draftFor = (i: number): StateDraft => {
    const frameOf = (panels: FlowPanel[]) => { const f = framePanelOf(panels); return f ? { path: f.path, view: f.view } : null; };
    if (screenLevel) {
      return { label: screen.title, when: "*", description: screen.description ?? "", screenshots: shotsOf(screen), frame: frameOf(panelsOf(screen)) };
    }
    const v = i >= 0 ? screen.variants[i] : undefined;
    return {
      label: v?.label ?? `State ${screen.variants.length + 1}`,
      when: v?.when ?? {},
      description: v?.description ?? "",
      screenshots: v ? shotsOf(v) : [],
      frame: v ? frameOf(panelsOf(v)) : null,
    };
  };

  // null = closed, "" = adding, otherwise the edge id being edited.
  const [editingEdge, setEditingEdge] = useState<string | null>(null);
  const edgeDraftFor = (id: string): EdgeDraft => {
    const e = screen.edges.find((x) => x.id === id);
    return {
      event: e?.event ?? "",
      when: e?.when ?? {},
      to: e?.to ?? "",
      stay: !!e && !e.to && !e.dispatch.length,
      dispatch: e?.dispatch.map((b) => ({ when: b.when, to: b.to, sets: b.sets })) ?? [],
      sets: e?.sets ?? {},
      description: e?.description ?? "",
    };
  };

  const titleOf = (id: string | null) => (id ? body.screens.find((s) => s.id === id)?.title ?? id : "this screen");
  const offered = availableEdges(body, screen.id, assignment);
  const isOfferedNow = (e: FlowEdge) => offered.some((o) => o.edge.id === e.id);
  // Every control that could ever lead here, regardless of the parameters in force. Resolving
  // "reached from" under the CURRENT assignment would be a lie: the screens that lead here have
  // their own locals, which are not in scope while you are standing on this one.
  const incoming = body.screens.flatMap((s) => s.edges
    .filter((e) => e.to === screen.id || e.dispatch.some((b) => b.to === screen.id))
    .map((e) => ({ from: s, edge: e })));

  return (
    // Full-height flex column: a header that does not scroll, then a body whose three columns
    // each own their own scroll. The screenshot is the point of this page, so it takes the height
    // and the text columns take the overflow.
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Box sx={{ flexShrink: 0, px: 1.5, pt: 1.25, pb: 1 }}>
        <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{screen.title}</Typography>
        {screen.description && (
          <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 0.25 }}>{screen.description}</Typography>
        )}
      </Box>

      {/* Wide: three columns, each owning its own scroll, with the image taking the height.
          Narrow: one scrolling column — the image cannot compete with two text columns for width
          below ~950px, and squeezing it was what clipped the right-hand edge. */}
      <Box ref={rowRef} sx={{
        flex: 1, minHeight: 0, display: "flex", gap: 1.5, px: 1.5, pb: 1.5,
        ...(stacked ? { flexDirection: "column", overflowY: "auto" } : null),
      }}>
        {/* ---------------------------------------------------- the screenshot */}
        <Box sx={{ display: "flex", flexDirection: "column", minHeight: 0,
          // A definite width: the pane fills the HEIGHT, and the image fits inside it on both
          // axes. Sizing purely from height let the intrinsic width outgrow the column and the
          // right edge of the screenshot was being clipped.
          //
          // A document column is sized in FLEX, not in `vw`. A screenshot has an intrinsic width
          // this pane only has to not clip, so a viewport-relative clamp is fine for it; a `.brief`
          // wants as much room as the row can spare, and `vw` does not know about the two rails to
          // the left of this pane — asking for 46vw of the WINDOW pushed the controls column off
          // the right edge entirely.
          ...(stacked
            ? { width: "100%", height: wide ? 560 : 360, flexShrink: 0 }
            : wide
              ? { height: "100%", flex: "6 1 420px", minWidth: 380 }
              : { height: "100%", width: "clamp(250px, 24vw, 400px)", flexShrink: 0 }) }}>
          {/* ONE pane normally; TWO when the proposal changed the pixels. Each owns its own scroll
              position, because a before and an after are rarely the same height and stepping them
              together would show you two unrelated parts of two screens. */}
          <Box sx={{ flex: 1, minHeight: 0, display: "flex", gap: 0.75 }}>
            {sideBySide && (
              <FlowContentPane panels={basePanels} urls={urls} files={files} body={body} hostAgentId={agentId} hostPath={path}
                empty={emptyText} tone={DIFF_OP_COLOR.delete} label="Original" />
            )}
            <FlowContentPane
              panels={panels.length ? panels : basePanels}
              urls={urls}
              files={files}
              body={body}
              hostAgentId={agentId}
              hostPath={path}
              onEditFrame={onEditFrame}
              label={sideBySide ? "New" : carriedOver ? "Unchanged from the Original" : undefined}
              tone={sideBySide ? DIFF_OP_COLOR.add : undefined}
              empty={emptyText}
            />
          </Box>
          <Box sx={{ flexShrink: 0, mt: 0.6, textAlign: "center" }}>
            {shown
              ? <Chip size="small" label={shown.label} sx={{ bgcolor: `${COND}44`, fontSize: 13 }} />
              : (
                <Typography sx={{ fontSize: 13, color: DIFF_OP_COLOR.delete }}>
                  No state matches — add a catch-all `when: "*"`.
                </Typography>
              )}
            {/* Looking at something the parameters do not produce is fine, but it must never be
                mistaken for the truth — so say so, and offer the one click that makes it true. */}
            {previewing && (
              <Box sx={{ mt: 0.5, display: "flex", flexDirection: "column", alignItems: "center", gap: 0.4 }}>
                <Typography sx={{ fontSize: 12, color: MUTED }}>
                  Not what these parameters show
                </Typography>
                <Box sx={{ display: "flex", gap: 0.4 }}>
                  <Chip size="small" label="Set parameters to this" onClick={() => onApplyState(shownIndex)}
                    sx={{ height: 20, fontSize: 12, bgcolor: SEL_BG, color: EMPH }} />
                  <Chip size="small" label="Back" variant="outlined" onClick={() => onPreview(null)}
                    sx={{ height: 20, fontSize: 12, color: MUTED }} />
                </Box>
              </Box>
            )}
          </Box>
          <input ref={fileInput} type="file" accept="image/*" multiple hidden
            onChange={(e) => void onPickFiles(e.target.files)} />
        </Box>

        {/* -------------------------------------- controls, and what leads here */}
        <Box sx={{ flex: "1 1 250px", minWidth: stacked ? 0 : 230, pr: 0.5,
          ...(stacked ? null : { height: "100%", overflow: "auto" }) }}>

          {/* ------------------------------------------------------- the controls */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary", flex: 1 }}>
              Controls on this screen
            </Typography>
            {authoring && (
              <Tooltip title="Add a control to this screen">
                <IconButton size="small" onClick={() => setEditingEdge("")}>
                  <AddIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
          <Typography sx={{ fontSize: 12, color: MUTED, mb: 0.5 }}>
            Press one to walk. Greyed out means it is not on the screen in this state.
          </Typography>
          {screen.edges.length === 0 && (
            <Typography sx={{ fontSize: 13, color: MUTED }}>None — this screen is terminal.</Typography>
          )}
          <Stack spacing={0.4}>
            {screen.edges.map((edge) => {
              const live = isOfferedNow(edge);
              const res = resolveEdge(edge, assignment);
              const goes = !live ? null : res.to === null ? "stays here" : titleOf(res.to);
              const edgeDeco = deco?.get(`edge:${edge.id}`);
              const edgeChange = changeFor("edge", edge.event);
              return (
                <Paper
                  key={edge.id} variant="outlined"
                  onClick={live ? () => onPress(edge) : undefined}
                  sx={{
                    px: 0.75, py: 0.5, display: "flex", alignItems: "center", gap: 0.6,
                    opacity: live ? 1 : 0.45,
                    // A control the proposal touched is marked the same way a state is — an event
                    // that changed used to be visible only in the Changes tab, which is the wrong
                    // place to notice it while you are standing on the screen it belongs to.
                    ...(edgeDeco ? { borderLeft: "3px solid", borderLeftColor: DIFF_OP_COLOR[edgeDeco.op], bgcolor: `${DIFF_OP_COLOR[edgeDeco.op]}12` } : null),
                    ...(live ? { cursor: "pointer", "&:hover": { borderColor: EMPH, bgcolor: HOVER_BG } } : null),
                  }}
                >
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.5, flexWrap: "wrap" }}>
                      <Typography sx={{ fontSize: 13, fontWeight: 600, color: edge.dispatch.length ? COND : "text.primary" }}>
                        {edge.event}
                      </Typography>
                      {edgeDeco && (
                        <Chip size="small" label={edgeDeco.op} sx={{ height: 20, fontSize: 12, bgcolor: `${DIFF_OP_COLOR[edgeDeco.op]}44` }} />
                      )}
                      {live && (
                        <>
                          <ArrowForwardIcon sx={{ fontSize: 13, color: MUTED }} />
                          <Typography sx={{ fontSize: 12, color: MUTED }}>{goes}</Typography>
                        </>
                      )}
                    </Box>
                    {!live && (
                      <Typography sx={{ fontSize: 12, color: MUTED, fontFamily: "ui-monospace, monospace" }}>
                        {notOfferedBecause(edge, assignment)}
                      </Typography>
                    )}
                    {edge.description && (
                      <Typography sx={{ fontSize: 12, color: MUTED, mt: 0.15 }}>{edge.description}</Typography>
                    )}
                  </Box>
                  {reviewActions(edgeChange)}
                  {authoring && (
                    <Box sx={{ display: "flex", flexShrink: 0 }} onClick={(ev) => ev.stopPropagation()}>
                      <Tooltip title="Edit this control">
                        <IconButton size="small" onClick={() => setEditingEdge(edge.id)}>
                          <EditOutlinedIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete this control">
                        <IconButton size="small" onClick={() => run((d) => ({ ok: deleteEdge(d, edge.id), error: "control not found" }))}>
                          <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  )}
                </Paper>
              );
            })}
          </Stack>

          <Typography variant="caption" sx={{ display: "block", mt: 1.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>
            Reached from
          </Typography>
          {incoming.length === 0 && <Typography sx={{ fontSize: 13, color: MUTED, mt: 0.4 }}>Nothing leads here.</Typography>}
          {incoming.map(({ from, edge }) => (
            <Box key={`${from.id}:${edge.id}`} sx={{ display: "flex", alignItems: "baseline", gap: 0.6, mt: 0.35, flexWrap: "wrap" }}>
              <Typography sx={{ fontSize: 12, color: MUTED }}>{from.title}</Typography>
              <Typography sx={{ fontSize: 13, fontWeight: 600 }}>— {edge.event} →</Typography>
            </Box>
          ))}
          {error && <Typography sx={{ fontSize: 12, color: DIFF_OP_COLOR.delete, mt: 0.6 }}>{error}</Typography>}
          {/* A promote writes the OTHER file, so its failures must be said out loud here — a
              silent no-op would read as "it worked" on a document you are not looking at. */}
          {promoteError && (
            <Typography sx={{ fontSize: 12, color: DIFF_OP_COLOR.delete, mt: 0.6 }}>
              Could not move it into the Original: {promoteError}
            </Typography>
          )}
        </Box>

        {/* -------------------------------------------------- every rendering */}
        <Box sx={{ flex: "1 1 260px", minWidth: stacked ? 0 : 240, pr: 0.5,
          ...(stacked ? null : { height: "100%", overflow: "auto" }) }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary", flex: 1 }}>
              States of this screen ({renderings.length})
            </Typography>
            {authoring && (
              <>
                <Tooltip title={agentId && path ? "Add a screenshot to the state shown" : "Screenshots need a saved file"}>
                  <span>
                    <IconButton size="small" disabled={busy || !agentId || !path} onClick={() => fileInput.current?.click()}>
                      {busy ? <CircularProgress size={14} /> : <RefreshIcon sx={{ fontSize: 15 }} />}
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Add a state to this screen">
                  <IconButton size="small" onClick={() => setEditing(-1)}>
                    <AddIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </>
            )}
          </Box>

          <Stack spacing={0.6} sx={{ mt: 0.75 }}>
            {renderings.map((r, i) => {
              // THREE distinct things, and conflating any two of them is how this list went wrong
              // before: `applies` = the parameters produce it, `looking` = it is on screen right
              // now, `on` = both. A state that does not apply is DIMMED but still opens — you
              // came here to look at screenshots, and the pills are not a gate on that.
              const applies = i === activeIndex;
              const looking = i === shownIndex;
              const rowPanels = r.panels.length ? r.panels : basePanelsFor(r.label);
              const thumbKey = rowPanels.find((p) => p.kind === "screenshot")?.key
                ?? shotsOf({ content: basePanelsFor(r.label) })[0];
              // A state showing a document has no image to shrink, so the thumbnail says what kind
              // of thing it is instead of the "none" that used to mean "nobody photographed this".
              const thumbExt = rowPanels.find((p) => p.kind === "file")?.path.split(".").pop() ?? null;
              const thumbFrame = framePanelOf(rowPanels);
              const d = deco?.get(`variant:${screen.id}:${r.label}`);
              return (
                <Paper
                  key={i} variant="outlined"
                  // The WHOLE card opens the state. Only the pen and the bin do anything else,
                  // so there is no dead zone to hunt for.
                  onClick={() => onPreview(applies ? null : i)}
                  sx={{
                    p: 0.7, display: "flex", gap: 0.9, alignItems: "center", cursor: "pointer",
                    opacity: applies ? 1 : 0.55,
                    borderColor: looking ? EMPH : "divider", borderWidth: looking ? 2 : 1,
                    ...(d ? { borderLeft: "3px solid", borderLeftColor: DIFF_OP_COLOR[d.op], bgcolor: `${DIFF_OP_COLOR[d.op]}12` } : null),
                    ...(looking && !d ? { bgcolor: HOVER_BG } : null),
                    "&:hover": { borderColor: looking ? EMPH : COND, opacity: 1 },
                  }}
                >
                  <Box sx={{ width: 38, height: 52, bgcolor: PANE_BG, borderRadius: 0.5, flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {thumbKey && urls[thumbKey]
                      ? <img src={urls[thumbKey]} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                      : <Typography sx={{ fontSize: 12, color: MUTED, textAlign: "center", px: 0.25, wordBreak: "break-all" }}>
                          {thumbExt ? `.${thumbExt}` : thumbFrame ? `frame${thumbFrame.view ? ` · ${thumbFrame.view}` : ""}` : "none"}
                        </Typography>}
                  </Box>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      <Typography sx={{ fontSize: 13, fontWeight: looking ? 700 : 500, color: looking ? EMPH : "text.primary" }}>
                        {r.label}
                      </Typography>
                      {d && <Chip size="small" label={d.op} sx={{ height: 20, fontSize: 12, bgcolor: `${DIFF_OP_COLOR[d.op]}44` }} />}
                      {looking && !applies && (
                        <Chip size="small" label="looking" sx={{ height: 20, fontSize: 12, bgcolor: `${COND}33`, color: COND }} />
                      )}
                      <Box sx={{ flex: 1 }} />
                      {reviewActions(changeFor("variant", r.label))}
                    </Box>
                    <Typography sx={{ fontSize: 12, color: MUTED, fontFamily: "ui-monospace, monospace" }}>
                      {whenText(r.when)}
                    </Typography>
                  </Box>
                  {authoring && (
                    <Box sx={{ display: "flex", flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                      <Tooltip title={screen.variants.length ? "Edit this state" : "Edit this screen's screenshots"}>
                        <IconButton size="small" onClick={() => setEditing(i)}>
                          <EditOutlinedIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Tooltip>
                      {screen.variants.length > 1 && (
                        <Tooltip title="Delete this state">
                          <IconButton size="small" onClick={() => run((d2) => ({ ok: deleteVariant(d2, screen.id, i), error: "state not found" }))}>
                            <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  )}
                </Paper>
              );
            })}
          </Stack>
        </Box>
      </Box>

      {authoring && editing !== null && (
        <FlowStateDialog
          key={`${screen.id}:${editing}`}
          open
          body={body}
          screen={screen}
          index={editing}
          draft={draftFor(editing)}
          urls={urls}
          agentId={agentId}
          path={path}
          onClose={() => setEditing(null)}
          onAssetAdded={onAssetAdded}
          screenLevel={screenLevel}
          onDelete={editing >= 0 && screen.variants.length > 1
            ? () => { run((d2) => ({ ok: deleteVariant(d2, screen.id, editing), error: "state not found" })); setEditing(null); }
            : undefined}
          onSave={(next) => {
            // The dialog edits the screenshots and the frame; whatever else the state showed (a
            // file panel) is kept where it was.
            const merged = (existing: FlowPanel[]) => mergeStatePanels(existing, { screenshots: next.screenshots, frame: next.frame });
            if (screenLevel) {
              run((d2) => updateScreen(d2, screen.id, {
                title: next.label, content: merged(panelsOf(screen)), description: next.description,
              }));
            } else if (editing < 0) {
              run((d2) => addVariant(d2, screen.id, {
                label: next.label, when: next.when, content: merged([]),
                description: next.description || undefined,
                // Before the catch-all, or a new state could never be selected.
                index: Math.max(0, screen.variants.length - 1),
              }));
            } else {
              run((d2) => updateVariant(d2, screen.id, editing, {
                label: next.label, when: next.when, content: merged(panelsOf(screen.variants[editing])),
                description: next.description,
              }));
            }
            setEditing(null);
          }}
        />
      )}

      {authoring && editingEdge !== null && (
        <FlowEdgeDialog
          key={`${screen.id}:edge:${editingEdge}`}
          open
          body={body}
          screen={screen}
          isNew={editingEdge === ""}
          draft={edgeDraftFor(editingEdge)}
          onClose={() => setEditingEdge(null)}
          onDelete={editingEdge
            ? () => { run((d) => ({ ok: deleteEdge(d, editingEdge), error: "control not found" })); setEditingEdge(null); }
            : undefined}
          onSave={(next) => {
            const shape = {
              event: next.event,
              when: next.when,
              to: next.stay ? "" : next.to,
              dispatch: next.stay ? [] : next.dispatch,
              sets: next.sets,
              description: next.description,
            };
            if (editingEdge === "") run((d) => addEdge(d, { ...shape, from: screen.id }));
            else run((d) => updateEdge(d, editingEdge, shape));
            setEditingEdge(null);
          }}
        />
      )}
    </Box>
  );
}
