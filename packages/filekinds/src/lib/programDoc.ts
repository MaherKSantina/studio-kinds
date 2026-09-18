/**
 * The `.program` kind — CODE AS EXECUTION, exactly the role the process-layers
 * doc allows it: a bounded, step-local transformer with an explicit contract.
 * The program declares what it reads from the store, what it writes back, and
 * the code between — and the VIEW gives it a Run button, so a journey step
 * can be executed by the person, on demand, with the output landing in the
 * store as an ordinary node.
 *
 *   title: Timesheet → shift-notes CSV
 *   language: python
 *   inputs:
 *     - {handle: /Fatin/timesheet.xlsx, as: timesheet.xlsx}
 *   outputs:
 *     - {from: converted.csv, handle: /Fatin/converted.csv}
 *   code: |
 *     ...
 *
 * `inputs` are materialized into the run's working directory under their `as`
 * names (bytes for binary nodes, text otherwise); the code runs there; each
 * output's `from` file is read back and written to its `handle`. The program
 * never touches the store directly — the contract is the only doorway, which
 * is what keeps a run explainable and repeatable.
 */
import yaml from "js-yaml";

export interface ProgramInput {
  /** Absolute store path to read. */
  handle: string;
  /** Filename it appears as in the run's working directory. */
  as: string;
}

export interface ProgramOutput {
  /** Filename the code writes in the working directory. */
  from: string;
  /** Absolute store path the result is written to (upsert). */
  handle: string;
}

export interface ProgramDoc {
  title: string;
  description?: string;
  /** Interpreter family. "python" today; the runner refuses what it doesn't know. */
  language: string;
  inputs: ProgramInput[];
  outputs: ProgramOutput[];
  code: string;
}

const rec = (x: unknown): Record<string, unknown> =>
  x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);

/** The filename half of a path — inputs' default `as`. */
const baseOf = (p: string): string => p.slice(p.lastIndexOf("/") + 1);

export function parseProgram(text: string): ProgramDoc {
  let raw: Record<string, unknown> = {};
  try { raw = rec(yaml.load(text)); } catch { /* unparseable opens empty */ }
  const inputs = arr(raw.inputs).map(rec).flatMap((o) => {
    const handle = str(o.handle);
    if (!handle || !handle.startsWith("/")) return [];
    return [{ handle, as: str(o.as) ?? baseOf(handle) }];
  });
  const outputs = arr(raw.outputs).map(rec).flatMap((o) => {
    const from = str(o.from);
    const handle = str(o.handle);
    return from && handle && handle.startsWith("/") ? [{ from, handle }] : [];
  });
  return {
    title: str(raw.title) ?? "Program",
    ...(str(raw.description) ? { description: str(raw.description)! } : {}),
    language: (str(raw.language) ?? "python").toLowerCase(),
    inputs,
    outputs,
    code: str(raw.code) ?? "",
  };
}
