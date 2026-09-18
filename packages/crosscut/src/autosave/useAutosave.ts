/**
 * Autosave driver. All decisions come from `autosaveRules`; this hook only
 * owns the timer, the in-flight promise and React state.
 */
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { decide } from "../decision/decisionTable";
import { AutosaveState, autosaveRules } from "./autosaveRules";

export interface Autosave {
  state: AutosaveState;
  lastSavedAt: Date | null;
  lastError: string | null;
  /** Report an edit. Pass the FULL next content. */
  onEdit(next: string): void;
  /** Save immediately (File > Save, Ctrl+S). Resolves when settled. */
  flush(): Promise<void>;
}

export function useAutosave(save: (content: string) => Promise<void>, opts?: { debounceMs?: number }): Autosave {
  const debounceMs = opts?.debounceMs ?? 800;
  const [state, setState] = useState<AutosaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const ref = useRef({ state: "idle" as AutosaveState, content: "", editedWhileSaving: false, timer: 0 as unknown as ReturnType<typeof setTimeout> | 0, saveFn: save });
  ref.current.saveFn = save;

  const step = useCallback((event: "edit" | "debounce" | "flush" | "save-ok" | "save-fail") => {
    const r = ref.current;
    const { outcome } = decide(autosaveRules, { state: r.state, event, editedWhileSaving: r.editedWhileSaving });
    if (r.state === "saving" && event === "edit") r.editedWhileSaving = true;
    if (event === "save-ok" || event === "save-fail") r.editedWhileSaving = false;
    r.state = outcome.next;
    setState(outcome.next);
    if (outcome.effect === "schedule") {
      if (r.timer) clearTimeout(r.timer);
      r.timer = setTimeout(() => step("debounce"), debounceMs);
    } else if (outcome.effect === "save") {
      if (r.timer) { clearTimeout(r.timer); r.timer = 0; }
      const content = r.content;
      r.saveFn(content).then(
        () => { setLastSavedAt(new Date()); setLastError(null); step("save-ok"); },
        (e: unknown) => { setLastError(e instanceof Error ? e.message : String(e)); step("save-fail"); },
      );
    }
  }, [debounceMs]);

  const onEdit = useCallback((next: string) => {
    ref.current.content = next;
    step("edit");
  }, [step]);

  const flush = useCallback(async () => {
    step("flush");
    // Settle: poll the machine until it leaves `saving`.
    while (ref.current.state === "saving") await new Promise((r) => setTimeout(r, 50));
  }, [step]);

  useEffect(() => () => { if (ref.current.timer) clearTimeout(ref.current.timer); }, []);

  return useMemo(() => ({ state, lastSavedAt, lastError, onEdit, flush }),
    [state, lastSavedAt, lastError, onEdit, flush]);
}
