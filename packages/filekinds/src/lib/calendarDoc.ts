/**
 * The `.calendar` file kind: a LENS over one `.kanban` board — like
 * `.tablediff`, it recomputes from its source on every open and stores no
 * dates of its own. The board's dependency edges, durations and due date
 * produce the schedule (kanbanDoc's `scheduleTasks`, backward-chained from
 * the due date); this file only says WHICH board, and optionally overrides
 * the anchor.
 *
 * Authoring shape (YAML, lenient):
 *
 *   title, description?
 *   board: Sep 9 prep board.kanban   # ref resolved against this file's folder
 *   due: 2026-09-09                  # optional — overrides the board's own due
 */
import yaml from "js-yaml";

export interface CalendarLensDoc {
  title: string;
  description?: string;
  /** Ref of the `.kanban` board this calendar derives from. */
  board?: string;
  /** Optional anchor override for the board's `due`. */
  due?: string;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const asStr = (v: unknown): string => (typeof v === "string" ? v : "");
const asDate = (v: unknown): string =>
  v instanceof Date ? v.toISOString().slice(0, 10)
  : typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v.slice(0, 10) : "";

/** Lenient parse — never throws. */
export function parseCalendarLens(content: string): CalendarLensDoc {
  let raw: unknown;
  try { raw = yaml.load(content); } catch { return { title: "" }; }
  if (!isObj(raw)) return { title: "" };
  return {
    title: asStr(raw.title),
    ...(asStr(raw.description) ? { description: asStr(raw.description) } : {}),
    ...(asStr(raw.board) ? { board: asStr(raw.board) } : {}),
    ...(asDate(raw.due) ? { due: asDate(raw.due) } : {}),
  };
}
