/**
 * Edit ONE control, in a dialog.
 *
 * The dialog asks two questions, in the order you actually think about them:
 *
 *   1. WHEN is it on the screen? Previously the only way to say "this button does not exist for a
 *      pickup-only listing" was a dispatch whose branches all failed to match — a destination list
 *      that led nowhere, standing in for a fact about presence. That conflation is gone: absence is
 *      a `when`, and it is the first thing you set.
 *   2. WHERE does it go? Three answers, not two. It can stay on this screen and just change its
 *      state (a radio, a picker, a form step), go to one screen, or branch on the parameters.
 *
 * Same authoring shape as the state dialog — a pen and a bin on the list, a dialog to edit in —
 * because an earlier version put all of this inline as underlined fields and a page of controls
 * became unreadable.
 */
import { useState } from "react";
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  MenuItem, Select, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import FlowConditionEditor from "./FlowConditionEditor";
import {
  type Assignment, type DimValue, type FlowBody, type FlowScreen, type When,
} from "../../lib/flowEngine";
import { MUTED, ACTION_BG, ACTION_BG_HOVER, ACTION_FG } from "./flowPalette";


export interface EdgeDraft {
  event: string;
  /** Offered only when this holds. `{}`/"*" means always. */
  when: When;
  to: string;
  /** True when the control stays on its own screen — `to` and `dispatch` are then both empty. */
  stay: boolean;
  dispatch: Array<{ when: When; to: string; sets: Assignment }>;
  sets: Assignment;
  description: string;
}

type Mode = "stay" | "always" | "dispatch";

export default function FlowEdgeDialog({
  open, body, screen, isNew, draft, onClose, onSave, onDelete,
}: {
  open: boolean;
  body: FlowBody;
  /** The screen this control lives on — its locals are in scope for every condition here. */
  screen: FlowScreen;
  isNew: boolean;
  draft: EdgeDraft;
  onClose: () => void;
  onSave: (next: EdgeDraft) => void;
  onDelete?: () => void;
}) {
  // Initialised ONCE — see the note in FlowStateDialog. The caller keys this per edit session.
  const [d, setD] = useState<EdgeDraft>(draft);

  // A condition here may read the globals, the derived values, OR this screen's own locals. The
  // locals come first because they are the ones a control on this screen usually turns on.
  const allDims = [...screen.localOrder, ...body.dimensionOrder, ...body.derived.map((x) => x.name)];
  const domainOf = (dim: string): DimValue[] =>
    screen.locals[dim] ?? body.dimensions[dim] ?? body.derived.find((x) => x.name === dim)?.values ?? [];

  const mode: Mode = d.stay ? "stay" : d.dispatch.length ? "dispatch" : "always";
  const setMode = (next: Mode) => {
    if (next === "stay") setD({ ...d, stay: true, to: "", dispatch: [] });
    else if (next === "always") setD({ ...d, stay: false, to: d.to || d.dispatch[0]?.to || body.screens[0]?.id || "", dispatch: [] });
    else setD({ ...d, stay: false, dispatch: d.dispatch.length ? d.dispatch : [{ when: {}, to: d.to || body.screens[0]?.id || "", sets: {} }], to: "" });
  };

  const setBranch = (i: number, patch: Partial<EdgeDraft["dispatch"][number]>) =>
    setD({ ...d, dispatch: d.dispatch.map((b, j) => (j === i ? { ...b, ...patch } : b)) });

  const setsEntries = Object.entries(d.sets);
  const settable = [...screen.localOrder, ...body.dimensionOrder];
  const noteFor = (dim: string) => (screen.locals[dim] ? "(this screen)" : "");

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontSize: 15, fontWeight: 700, pb: 1 }}>
        {isNew ? "Add a control" : "Edit control"}
        <Typography sx={{ fontSize: 13, color: MUTED, fontWeight: 400 }}>on {screen.title}</Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>
          Label
        </Typography>
        <TextField fullWidth size="small" autoFocus value={d.event}
          placeholder="e.g. Continue"
          onChange={(e) => setD({ ...d, event: e.target.value })} sx={{ mt: 0.5, mb: 1.5 }} />

        <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>
          On the screen when
        </Typography>
        <Typography sx={{ fontSize: 13, color: MUTED, mb: 0.5 }}>
          Leave empty and it is always there. Add a condition to say the button simply does not
          exist in some states — that is a fact about presence, not a destination that fails.
        </Typography>
        <FlowConditionEditor
          when={d.when}
          onChange={(next) => setD({ ...d, when: next })}
          dims={allDims}
          domainOf={domainOf}
          noteFor={noteFor}
          emptyLabel="always on the screen"
        />

        <Typography variant="caption" sx={{ display: "block", mt: 2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>
          Where it goes
        </Typography>
        <ToggleButtonGroup
          size="small" exclusive value={mode}
          onChange={(_, v) => v && setMode(v as Mode)}
          sx={{ mt: 0.5, mb: 1, flexWrap: "wrap", "& .MuiToggleButton-root": { textTransform: "none", fontSize: 12, py: 0.3, px: 1.25 } }}
        >
          <ToggleButton value="stay">Stays on this screen</ToggleButton>
          <ToggleButton value="always">Another screen</ToggleButton>
          <ToggleButton value="dispatch">Depends on the parameters</ToggleButton>
        </ToggleButtonGroup>

        {mode === "stay" && (
          <Typography sx={{ fontSize: 13, color: MUTED }}>
            Pressing it changes this screen’s own state rather than navigating — a radio, a picker,
            a step of a form. Set which state below.
          </Typography>
        )}
        {mode === "always" && (
          <Select size="small" fullWidth value={d.to || ""} onChange={(e) => setD({ ...d, to: e.target.value })} sx={{ fontSize: 12.5 }}>
            {body.screens.map((s) => <MenuItem key={s.id} value={s.id} sx={{ fontSize: 12.5 }}>{s.title}</MenuItem>)}
          </Select>
        )}
        {mode === "dispatch" && (
          <Stack spacing={1}>
            <Typography sx={{ fontSize: 13, color: MUTED }}>
              Checked top to bottom; the first match wins. Use this when the DESTINATION varies. If
              you want the control to be absent instead, put the condition in “on the screen when”.
            </Typography>
            {d.dispatch.map((b, i) => (
                <Box key={i} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 0.5, p: 0.9 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.5 }}>
                    <Typography sx={{ fontSize: 13, color: MUTED, width: 36 }}>{i === 0 ? "if" : "else if"}</Typography>
                    <Box sx={{ flex: 1 }} />
                    {d.dispatch.length > 1 && (
                      <IconButton size="small" onClick={() => setD({ ...d, dispatch: d.dispatch.filter((_, j) => j !== i) })}>
                        <DeleteOutlineIcon sx={{ fontSize: 15 }} />
                      </IconButton>
                    )}
                  </Box>
                  <FlowConditionEditor
                    when={b.when}
                    onChange={(next) => setBranch(i, { when: next })}
                    dims={allDims}
                    domainOf={domainOf}
                    noteFor={noteFor}
                    small
                  />
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.6, mt: 0.5 }}>
                    <Typography sx={{ fontSize: 13, color: MUTED }}>go to</Typography>
                    <Select size="small" value={b.to} displayEmpty onChange={(e) => setBranch(i, { to: e.target.value })}
                      sx={{ fontSize: 13, minWidth: 230 }}>
                      <MenuItem value="" sx={{ fontSize: 13, fontStyle: "italic" }}>stay on this screen</MenuItem>
                      {body.screens.map((s) => <MenuItem key={s.id} value={s.id} sx={{ fontSize: 13 }}>{s.title}</MenuItem>)}
                    </Select>
                  </Box>
                </Box>
            ))}
            <Button size="small" onClick={() => setD({ ...d, dispatch: [...d.dispatch, { when: {}, to: body.screens[0]?.id ?? "", sets: {} }] })}
              sx={{ alignSelf: "flex-start", fontSize: 13, textTransform: "none", color: MUTED }}>
              + add a branch
            </Button>
          </Stack>
        )}

        <Typography variant="caption" sx={{ display: "block", mt: 2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>
          Pressing it sets
        </Typography>
        <Typography sx={{ fontSize: 13, color: MUTED, mb: 0.5 }}>
          {mode === "stay"
            ? "Which state this screen moves to. A control that stays and sets nothing does nothing."
            : "Applied on arrival, so it can also seed one of the destination screen’s own variables."}
        </Typography>
        <Stack spacing={0.5}>
          {setsEntries.map(([k, v]) => (
            <Box key={k} sx={{ display: "flex", alignItems: "center", gap: 0.6 }}>
              <Select size="small" value={k}
                onChange={(e) => {
                  const next = { ...d.sets };
                  delete next[k];
                  next[e.target.value] = domainOf(e.target.value)[0];
                  setD({ ...d, sets: next });
                }}
                sx={{ fontSize: 13, minWidth: 170 }}>
                {settable.map((x) => (
                  <MenuItem key={x} value={x} sx={{ fontSize: 13 }}>
                    {x}{screen.locals[x] ? " (this screen)" : ""}
                  </MenuItem>
                ))}
              </Select>
              <Typography sx={{ fontSize: 13, color: MUTED }}>:=</Typography>
              <Select size="small" value={String(v)}
                onChange={(e) => {
                  const raw = domainOf(k).find((x) => String(x) === e.target.value) ?? e.target.value;
                  setD({ ...d, sets: { ...d.sets, [k]: raw } });
                }}
                sx={{ fontSize: 13, minWidth: 150 }}>
                {domainOf(k).map((x) => <MenuItem key={String(x)} value={String(x)} sx={{ fontSize: 13 }}>{String(x)}</MenuItem>)}
              </Select>
              <IconButton size="small" onClick={() => { const next = { ...d.sets }; delete next[k]; setD({ ...d, sets: next }); }}>
                <DeleteOutlineIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Box>
          ))}
          <Select size="small" value="" displayEmpty
            onChange={(e) => setD({ ...d, sets: { ...d.sets, [e.target.value]: domainOf(e.target.value)[0] } })}
            renderValue={() => "+ set a value"}
            sx={{ alignSelf: "flex-start", fontSize: 13, color: MUTED, minWidth: 165 }}>
            {settable.filter((x) => !(x in d.sets)).map((x) => (
              <MenuItem key={x} value={x} sx={{ fontSize: 13 }}>
                {x}{screen.locals[x] ? " (this screen)" : ""}
              </MenuItem>
            ))}
          </Select>
        </Stack>
        <Typography variant="caption" sx={{ display: "block", mt: 2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>
          Note
        </Typography>
        <Typography sx={{ fontSize: 13, color: MUTED, mb: 0.5 }}>
          Why this control behaves this way — a requirement id, a caveat. Kept in the file, unlike a
          comment, which every save discards.
        </Typography>
        <TextField
          fullWidth size="small" multiline minRows={2} value={d.description}
          placeholder="e.g. REQ-021 — no delivery picker for a pickup-only listing"
          onChange={(e) => setD({ ...d, description: e.target.value })}
        />
        {void Tooltip}
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1 }}>
        {onDelete && !isNew && (
          <Button size="small" onClick={onDelete} sx={{ color: "#ef4444", mr: "auto", textTransform: "none" }}>
            Delete control
          </Button>
        )}
        <Button size="small" onClick={onClose} sx={{ textTransform: "none", color: MUTED }}>Cancel</Button>
        <Button size="small" variant="contained" disabled={!d.event.trim()}
          onClick={() => onSave({ ...d, event: d.event.trim() })}
          sx={{ textTransform: "none", bgcolor: ACTION_BG, color: ACTION_FG, "&:hover": { bgcolor: ACTION_BG_HOVER } }}>
          {isNew ? "Add" : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
