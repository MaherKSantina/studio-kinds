/**
 * GOLDEN RULES — what can be selected / what double-click does in the picker.
 *
 * One table covers both picker modes. The FilePickerDialog renders rows and
 * asks this table per row; it contains no mode conditionals of its own.
 */
import { DecisionTable } from "../decision/decisionTable";
import { FsKind } from "./types";

export interface PickerCtx {
  mode: "open" | "save" | "browse";
  kind: FsKind;
  /** Does the entry pass the dialog's extension filter (always true for no filter)? */
  extAllowed: boolean;
}

export interface PickerVerdict {
  /** Row can be highlighted as the dialog's selection. */
  selectable: boolean;
  /** What double-click / Enter does: descend, confirm the pick, prefill the save name, or nothing. */
  onActivate: "enter" | "choose" | "prefill" | "none";
  /** Rendered dimmed — visible for orientation, not pickable. */
  dimmed: boolean;
}

export const pickerRules: DecisionTable<PickerCtx, PickerVerdict> = {
  name: "picker-row",
  answers: "How does one row in the file picker behave in the current mode?",
  rules: [
    { rule: "folder", because: "folders are for navigation in both modes; Save targets the folder you are standing in, not a selected row", when: { kind: "folder" }, then: { selectable: false, onActivate: "enter", dimmed: false } },
    { rule: "browse-file", because: "in the explorer every file opens — routing to the owning app is the open-with table's job", when: { mode: "browse", kind: "file" }, then: { selectable: true, onActivate: "choose", dimmed: false } },
    { rule: "open-match", because: "opening is the point — a file passing the filter is the pick", when: { mode: "open", kind: "file", extAllowed: true }, then: { selectable: true, onActivate: "choose", dimmed: false } },
    { rule: "open-other", because: "files outside the filter orient you but can't be opened by this app", when: { mode: "open", kind: "file", extAllowed: false }, then: { selectable: false, onActivate: "none", dimmed: true } },
    { rule: "save-file", because: "clicking an existing file while saving prefills its name — the overwrite affordance", when: { mode: "save", kind: "file", extAllowed: true }, then: { selectable: true, onActivate: "prefill", dimmed: false } },
    { rule: "save-other", because: "a file the app can't produce is context, not a target", when: { mode: "save", kind: "file", extAllowed: false }, then: { selectable: false, onActivate: "none", dimmed: true } },
  ],
  otherwise: { selectable: false, onActivate: "none", dimmed: true },
};
