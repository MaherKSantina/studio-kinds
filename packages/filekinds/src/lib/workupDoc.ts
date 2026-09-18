/**
 * THE WORKUP — the systematic examination one document goes through.
 *
 * A `.workup` file binds ONE source document (an act, a regulation, any file
 * in the shared nodes FS) to the ordered STEPS of its processing: extract the
 * obligations, build the cross-reference graph, audit the extraction — each
 * step carrying its instructions and producing ONE output file of an ordinary
 * kind (.list, .brief, .md, …). The outputs are the document's ANALYSES:
 * every tool renders them read-only through the kind registry, and agents
 * reading the source (a points stream stage, a distillation run) pull them
 * alongside it.
 *
 * ROLES, not separate entities (the points-doc move): a workup WITHOUT a
 * `source:` is a TEMPLATE — the regimen. Instantiating it onto a document
 * copies the steps with statuses reset; the instance keeps `template:`
 * pointing home, so the regimen can evolve and instances know where they
 * came from.
 *
 * WHERE THINGS LAND — companions, by convention:
 *   - the workup of /a/b/act.md sits NEXT TO IT as /a/b/act.workup
 *     (`workupPathFor`), so resolving "the analyses of this file" needs no
 *     registry — the path IS the link;
 *   - relative step outputs land in the workup's OUTDIR, default
 *     "/a/b/act workup/" (`outdirOf`) — a sibling folder, spelled with a
 *     space so it can never collide with the versioned-entry convention
 *     (a folder named exactly like a file).
 */
import yaml from "js-yaml";
import { DecisionTable, decide } from "crosscut";

export type StepStatus = "pending" | "running" | "done" | "failed";

export interface WorkupStep {
  /** Stable within the workup; outputs and runs hang off it. */
  key: string;
  label?: string;
  /** What the step's agent (or human) is asked to do. */
  instructions?: string;
  /** The ONE file this step produces. Relative = under the workup's outdir. */
  output?: string;
  status: StepStatus;
  note?: string;
}

export interface WorkupDoc {
  title: string;
  description?: string;
  /** The document under examination. Absent = this workup is a TEMPLATE. */
  source?: string;
  /** The template this workup was instantiated from. */
  template?: string;
  /** Where relative outputs land; default `"<stem> workup"` beside the file. */
  outdir?: string;
  /** Step keys whose landed outputs the OUTSIDE sees (the project hierarchy,
   *  the points-stream `exports:` convention). Absent = everything landed
   *  exports; `exports: [classify]` narrows the children to the typed rows. */
  exports?: string[];
  steps: WorkupStep[];
}

const rec = (x: unknown): Record<string, unknown> =>
  x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);

const STATUSES: StepStatus[] = ["pending", "running", "done", "failed"];
const asStatus = (x: unknown): StepStatus =>
  STATUSES.includes(x as StepStatus) ? (x as StepStatus) : "pending";

export function parseWorkup(text: string): WorkupDoc {
  let raw: Record<string, unknown> = {};
  try { raw = rec(yaml.load(text)); } catch { /* unparseable opens empty */ }
  return {
    title: str(raw.title) ?? "Workup",
    ...(str(raw.description) ? { description: str(raw.description)! } : {}),
    ...(str(raw.source) ? { source: str(raw.source)! } : {}),
    ...(str(raw.template) ? { template: str(raw.template)! } : {}),
    ...(str(raw.outdir) ? { outdir: str(raw.outdir)! } : {}),
    ...(arr(raw.exports).some((x) => str(x))
      ? { exports: arr(raw.exports).map(str).filter(Boolean) as string[] }
      : {}),
    steps: arr(raw.steps).map((x, i) => {
      const o = rec(x);
      const key = str(o.key) ?? str(o.label);
      if (!key) return null;
      return {
        key: str(o.key) ?? `step-${i + 1}`,
        ...(str(o.label) ? { label: str(o.label)! } : {}),
        ...(str(o.instructions) ? { instructions: str(o.instructions)! } : {}),
        ...(str(o.output) ? { output: str(o.output)! } : {}),
        status: asStatus(o.status),
        ...(str(o.note) ? { note: str(o.note)! } : {}),
      };
    }).filter(Boolean) as WorkupStep[],
  };
}

export function dumpWorkup(doc: WorkupDoc): string {
  return yaml.dump({
    title: doc.title,
    ...(doc.description ? { description: doc.description } : {}),
    ...(doc.source ? { source: doc.source } : {}),
    ...(doc.template ? { template: doc.template } : {}),
    ...(doc.outdir ? { outdir: doc.outdir } : {}),
    ...(doc.exports?.length ? { exports: doc.exports } : {}),
    steps: doc.steps.map((s) => ({
      key: s.key,
      ...(s.label ? { label: s.label } : {}),
      ...(s.instructions ? { instructions: s.instructions } : {}),
      ...(s.output ? { output: s.output } : {}),
      status: s.status,
      ...(s.note ? { note: s.note } : {}),
    })),
  }, { lineWidth: -1, noRefs: true });
}

/* ── GOLDEN RULES: what role a workup file plays ───────────────────────── */

export type WorkupRole = "workup" | "template";

export interface WorkupRoleCtx { hasSource: boolean }
export interface WorkupRoleVerdict { role: WorkupRole }

export const workupRoleRules: DecisionTable<WorkupRoleCtx, WorkupRoleVerdict> = {
  name: "workup-role",
  answers: "Is this file an examination of one document, or the regimen itself?",
  rules: [
    { rule: "workup",
      because: "a source binds the steps to one document — this is that document's examination",
      when: { hasSource: true },
      then: { role: "workup" } },
  ],
  otherwise: { role: "template" },
};

export const roleOfWorkup = (doc: WorkupDoc): WorkupRole =>
  decide(workupRoleRules, { hasSource: !!doc.source }).outcome.role;

/* ── GOLDEN RULES: the workup's overall status ─────────────────────────── */

export type WorkupStatus = "empty" | "pending" | "in-progress" | "attention" | "done";

export interface WorkupStatusCtx {
  hasSteps: boolean;
  anyFailed: boolean;
  allDone: boolean;
  /** Any step done or running — the examination has begun. */
  anyStarted: boolean;
}

export interface WorkupStatusVerdict { status: WorkupStatus }

export const workupStatusRules: DecisionTable<WorkupStatusCtx, WorkupStatusVerdict> = {
  name: "workup-status",
  answers: "Where does one document stand in its examination?",
  rules: [
    { rule: "empty",
      because: "no steps means nothing has been asked of this document yet",
      when: { hasSteps: false },
      then: { status: "empty" } },
    { rule: "attention",
      because: "a failed step outranks everything — the workup needs a human before it needs more running",
      when: { anyFailed: true },
      then: { status: "attention" } },
    { rule: "done",
      because: "every step landed its output — the examination is complete",
      when: { allDone: true },
      then: { status: "done" } },
    { rule: "in-progress",
      because: "some step has run or is running; the examination is underway",
      when: { anyStarted: true },
      then: { status: "in-progress" } },
  ],
  otherwise: { status: "pending" },
};

export const statusOfWorkup = (doc: WorkupDoc): WorkupStatus =>
  decide(workupStatusRules, {
    hasSteps: doc.steps.length > 0,
    anyFailed: doc.steps.some((s) => s.status === "failed"),
    allDone: doc.steps.length > 0 && doc.steps.every((s) => s.status === "done"),
    anyStarted: doc.steps.some((s) => s.status === "done" || s.status === "running"),
  }).outcome.status;

/** The step to look at next: the first one that hasn't produced its output —
 *  a failed step IS the next thing to look at. Null = examination complete. */
export const nextStep = (doc: WorkupDoc): WorkupStep | null =>
  doc.steps.find((s) => s.status !== "done") ?? null;

/* ── companions: the paths that need no registry ───────────────────────── */

const parentOf = (p: string): string => p.slice(0, Math.max(p.lastIndexOf("/"), 0)) || "/";
const nameOf = (p: string): string => p.slice(p.lastIndexOf("/") + 1);
const stemOf = (name: string): string => {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
};
const join = (dir: string, name: string): string => (dir === "/" ? "" : dir) + "/" + name;

/** The workup of /a/b/act.md is /a/b/act.workup — the path IS the link. */
export const workupPathFor = (sourcePath: string): string =>
  join(parentOf(sourcePath), stemOf(nameOf(sourcePath)) + ".workup");

/** Where a workup's relative outputs land. The space in "<stem> workup" keeps
 *  it clear of the versioned-entry convention (folder named exactly like a
 *  file). */
export const outdirOf = (doc: WorkupDoc, workupPath: string): string => {
  if (doc.outdir) {
    return doc.outdir.startsWith("/")
      ? doc.outdir
      : join(parentOf(workupPath), doc.outdir);
  }
  return join(parentOf(workupPath), stemOf(nameOf(workupPath)) + " workup");
};

/** A step's output as an absolute path, or null when the step declares none. */
export const outputPathOf = (doc: WorkupDoc, workupPath: string, step: WorkupStep): string | null => {
  if (!step.output) return null;
  if (step.output.startsWith("/")) return step.output;
  return join(outdirOf(doc, workupPath), step.output);
};

/** The source as an absolute path (doc-relative sources resolve beside the
 *  workup — which is beside the source, per the companion convention). */
export const sourcePathOf = (doc: WorkupDoc, workupPath: string): string | null => {
  if (!doc.source) return null;
  if (doc.source.startsWith("/")) return doc.source;
  return join(parentOf(workupPath), doc.source);
};

/** Every analysis this workup has actually produced (steps that are done and
 *  declare an output), as absolute paths — what "the analyses of this file"
 *  resolves to. */
export const analysesOf = (doc: WorkupDoc, workupPath: string): { step: WorkupStep; path: string }[] =>
  doc.steps
    .filter((s) => s.status === "done" && s.output)
    .map((step) => ({ step, path: outputPathOf(doc, workupPath, step)! }));

/** The analyses the OUTSIDE sees: landed outputs narrowed by `exports:` when
 *  the workup declares it; everything landed otherwise. */
export const exportedAnalyses = (doc: WorkupDoc, workupPath: string): { step: WorkupStep; path: string }[] =>
  analysesOf(doc, workupPath).filter(({ step }) => !doc.exports || doc.exports.includes(step.key));

/** Flip one step's status by LINE replacement — comments elsewhere survive.
 *  The step block runs from its `- key:` line to the next `- key:` line (or a
 *  dedented line); the `status:` line inside it is replaced, or inserted right
 *  after the key line when the block has none. */
export function setStepStatus(content: string, stepKey: string, status: StepStatus): string {
  const lines = content.split("\n");
  const keyRe = new RegExp("^(\\s*)-\\s+key:\\s*([\"']?)" + stepKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\2\\s*$");
  const start = lines.findIndex((l) => keyRe.test(l));
  if (start < 0) return content;
  const dashIndent = (lines[start].match(/^(\s*)/)?.[1] ?? "").length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    const indent = (l.match(/^(\s*)/)?.[1] ?? "").length;
    if (indent <= dashIndent) { end = i; break; }
  }
  for (let i = start + 1; i < end; i++) {
    const m = lines[i].match(/^(\s*)status:\s*.*$/);
    if (m) {
      lines[i] = `${m[1]}status: ${status}`;
      return lines.join("\n");
    }
  }
  const propIndent = " ".repeat(dashIndent + 2);
  lines.splice(start + 1, 0, `${propIndent}status: ${status}`);
  return lines.join("\n");
}

/** The next status one click away — the studio's stepping order. */
export const STEP_STATUS_CYCLE: Record<StepStatus, StepStatus> = {
  pending: "running", running: "done", done: "failed", failed: "pending",
};

/** Stamp a template onto one document: steps copied, statuses reset, the
 *  instance titled after the document and pointing home via `template:`. */
export function instantiateWorkup(template: WorkupDoc, templatePath: string, sourcePath: string): WorkupDoc {
  return {
    title: stemOf(nameOf(sourcePath)) + " — " + template.title,
    ...(template.description ? { description: template.description } : {}),
    source: sourcePath,
    template: templatePath,
    steps: template.steps.map((s) => ({ ...s, status: "pending" as StepStatus })),
  };
}
