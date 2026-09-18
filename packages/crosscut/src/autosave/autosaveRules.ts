/**
 * GOLDEN RULES — the autosave state machine.
 *
 * `useAutosave` is a thin driver around this table: on every event it asks for
 * the transition and performs the returned effect. The Google-Docs-style chip
 * in the AppShell renders `state` directly. All timing (debounce length) lives
 * in the hook; all BEHAVIOUR lives here.
 */
import { DecisionTable } from "../decision/decisionTable";

export type AutosaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export type AutosaveEvent =
  | "edit"        // the document changed
  | "debounce"    // the quiet period after the last edit elapsed
  | "flush"       // caller wants it on disk NOW (Ctrl+S, File > Save, unload)
  | "save-ok"
  | "save-fail";

export interface AutosaveCtx {
  state: AutosaveState;
  event: AutosaveEvent;
  /** An edit arrived while a save was in flight — its result is stale. */
  editedWhileSaving: boolean;
}

export interface AutosaveTransition {
  next: AutosaveState;
  effect: "none" | "schedule" | "save";
}

export const autosaveRules: DecisionTable<AutosaveCtx, AutosaveTransition> = {
  name: "autosave",
  answers: "Given the current autosave state and an event, what is the next state and side effect?",
  rules: [
    { rule: "edit-while-saving", because: "keep saving, but remember the result no longer reflects the document", when: { state: "saving", event: "edit" }, then: { next: "saving", effect: "none" } },
    { rule: "edit", because: "any edit makes the doc dirty and (re)arms the debounce timer", when: { event: "edit" }, then: { next: "dirty", effect: "schedule" } },
    { rule: "debounce-fires", because: "quiet period over — write", when: { state: "dirty", event: "debounce" }, then: { next: "saving", effect: "save" } },
    { rule: "flush-dirty", because: "explicit save skips the debounce", when: { state: "dirty", event: "flush" }, then: { next: "saving", effect: "save" } },
    { rule: "flush-error", because: "explicit save is also the retry gesture after a failure", when: { state: "error", event: "flush" }, then: { next: "saving", effect: "save" } },
    { rule: "saved-stale", because: "the write landed but edits arrived meanwhile — go straight back to dirty and re-arm", when: { state: "saving", event: "save-ok", editedWhileSaving: true }, then: { next: "dirty", effect: "schedule" } },
    { rule: "saved", because: "the write landed and reflects the document", when: { state: "saving", event: "save-ok" }, then: { next: "saved", effect: "none" } },
    { rule: "fail-stale", because: "failed AND stale — retry immediately with the newer content", when: { state: "saving", event: "save-fail", editedWhileSaving: true }, then: { next: "dirty", effect: "schedule" } },
    { rule: "fail", because: "surface the failure; the user's edits are still local, flush retries", when: { state: "saving", event: "save-fail" }, then: { next: "error", effect: "none" } },
  ],
  otherwise: { next: "idle", effect: "none" },
};
