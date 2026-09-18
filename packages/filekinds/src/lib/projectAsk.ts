/**
 * ASKING a project's folder to change — the vocabulary behind the Projects
 * directory view's Ask panel. The user points at a folder and says "create
 * three frame files for the onboarding screens" or "a notes.md with the
 * agenda"; the model answers with OPS that create files from each kind's
 * TEMPLATE (it never writes YAML for a kind it does not know), create
 * folders, or rename.
 *
 * Two halves, deliberately: `planProjectOps` is PURE — it resolves paths
 * under the target, refuses anything outside the project or already there,
 * and yields a list of actions with their reasons — and `runProjectPlan`
 * performs them through whatever the host configured. Nothing here deletes:
 * a folder is the user's material, and a small model asked to "clean up"
 * must not be able to take anything away.
 */
import { TEMPLATE_KINDS, fileExtensionOf, fileTemplate } from "./fileTemplates";
import { moveFrameIntoFlow } from "./flowFrames";

export const PROJECT_ASK_OPS = ["create_file", "create_folder", "rename", "move_into_flow"] as const;
export type ProjectAskOpName = (typeof PROJECT_ASK_OPS)[number];

export interface ProjectOp {
  op: ProjectAskOpName;
  /** Relative to the target folder, or absolute under the project root. */
  path?: string;
  /** The document's title (a file's name is derived from the path). */
  title?: string;
  /** Text kinds only (.md, .txt). */
  content?: string;
  /** rename: the new name, no slashes. */
  name?: string;
  /** move_into_flow: the .flow the frame moves into (a tree path, or a bare name in the target folder). */
  flow?: string;
}

export interface ProjectAskReply {
  say: string;
  ops: ProjectOp[];
}

export interface ProjectAskTarget {
  /** The folder the project stands on. */
  root: string;
  /** The folder aimed at (root or below) — a file's own folder when a file is aimed at. */
  folder: string;
  /** The file aimed at, when the last click was a file: "this" and "it" mean this file. */
  file?: string | null;
}

/** One entry of the project's tree, relative to the root (no leading slash). */
export interface ProjectAskEntry {
  path: string;
  kind: "folder" | "file";
}

export interface ProjectAskTurn {
  instruction: string;
  say: string;
  result?: string;
}

export const PROJECT_ASK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["say", "ops"],
  properties: {
    say: { type: "string", description: "One short sentence: what was created, or the one question to ask (then ops is empty)." },
    ops: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["op"],
        properties: {
          op: { type: "string", enum: [...PROJECT_ASK_OPS] },
          path: { type: "string" },
          title: { type: "string" },
          content: { type: "string" },
          name: { type: "string" },
          flow: { type: "string" },
        },
      },
    },
  },
} as const;

/** What the model is told once: the store, the kinds, the ops, the rules. */
export function projectAskSystem(): string {
  const kinds = TEMPLATE_KINDS.map((k) => `- .${k.ext} — ${k.what}`).join("\n");
  return `You are the hand that files things inside ONE project folder of the suite. The user points at a folder and asks for files; you answer ONLY through the schema: "say" is one short sentence, under twelve words (what you created, or the single question you need answered), "ops" is the list of actions.

THE STORE: folders and files. A file's EXTENSION says what it is, and each kind is created from its own template — you name the kind and the title, never the file's insides (except a note's text).
Kinds you may create:
${kinds}

THE OPS — one action each, applied in order:
- create_file {path, title, content}: a bare name ("welcome.frame") lands in the TARGET folder; a path with a slash is as it appears in the TREE, relative to the project root ("onboarding/welcome.frame" — new folders on the way are made). The extension picks the kind. title = the document's title (defaults to the file name). content only for .md / .txt.
- create_folder {path}: an empty folder, named the same way.
- rename {path, name}: a new name for an existing file or folder — path as in the TREE; name without slashes, keeping the extension. With a TARGET file, rename {name} alone renames that file.
- move_into_flow {path, flow}: move a .frame INTO a .flow beside it — the frame's contents go inside the flow under its name, every state that showed the file still does, and the file leaves the folder. With a TARGET .frame, move_into_flow {flow} alone moves that file.

RULES
- When a TARGET file is given, "this", "it" and "the file" mean that file: relative paths land beside it, and its first lines are shown so you can name things after it. What is INSIDE a file is its studio's business (except a note's text) — if asked to change a file's contents, say where to do it and make no op.
- Never overwrite: a path that exists is skipped — choose another name. Nothing is ever deleted; if asked to delete, say that it must be done by hand.
- File names: short, lowercase-with-dashes, with the extension ("payment-failed.frame"); titles: the words a person would use ("Payment failed").
- Several related files go in a subfolder when the user names one, otherwise straight into the target folder.
- Act when the instruction can be applied sensibly. Ask (say + empty ops) only when the kind or the place is genuinely unclear.`;
}

const relOf = (root: string, abs: string): string => (abs === root ? "/" : abs.slice(root.length).replace(/^\/+/, "") + (abs.endsWith("/") ? "" : ""));

/** How much of a targeted file the model gets to see — enough to name things after it. */
const EXCERPT_CHARS = 1500;

/** What the model is told per turn: the target (folder, and the file when one is aimed at, with
 *  its first lines), the tree, recent turns, the instruction. */
export function projectAskUser(target: ProjectAskTarget, entries: ProjectAskEntry[], instruction: string, history: ProjectAskTurn[] = [], excerpt?: string): string {
  const rel = relOf(target.root, target.folder);
  const lines = [
    `PROJECT root: ${target.root}`,
    `TARGET folder: ${target.folder}${rel !== "/" ? ` (relative: ${rel}/)` : " (the root)"}`,
  ];
  if (target.file) {
    const ext = target.file.slice(target.file.lastIndexOf("/") + 1).split(".").pop() ?? "";
    lines.push(`TARGET file: ${target.file} (.${ext}) — "this" and "it" mean this file`);
    if (excerpt?.trim()) {
      const cut = excerpt.length > EXCERPT_CHARS;
      lines.push(`FILE (first ${cut ? `${EXCERPT_CHARS} characters` : "lines"})`, excerpt.slice(0, EXCERPT_CHARS).trimEnd() + (cut ? "\n…" : ""));
    }
  }
  lines.push(
    `TREE (${entries.length} entr${entries.length === 1 ? "y" : "ies"}, relative to the root)`,
    ...(entries.length ? entries.slice(0, 300).map((e) => `- ${e.path}${e.kind === "folder" ? "/" : ""}`) : ["- (empty)"]),
  );
  if (entries.length > 300) lines.push(`- … ${entries.length - 300} more`);
  const recent = history.slice(-4);
  if (recent.length) {
    lines.push("RECENT TURNS");
    for (const t of recent) lines.push(`user: ${t.instruction}`, `you: ${t.say}${t.result ? ` [${t.result}]` : ""}`);
  }
  lines.push(`INSTRUCTION: ${instruction.trim()}`);
  return lines.join("\n");
}

/* ── reading a reply ─────────────────────────────────────────────────────── */

const OP_ALIASES: Record<string, ProjectAskOpName> = {
  create: "create_file", new_file: "create_file", add_file: "create_file", write: "create_file", write_file: "create_file", file: "create_file",
  mkdir: "create_folder", new_folder: "create_folder", add_folder: "create_folder", folder: "create_folder", create_directory: "create_folder",
  move: "rename", rename_file: "rename", rename_folder: "rename",
  move_to_flow: "move_into_flow", move_frame_into_flow: "move_into_flow", inline_into_flow: "move_into_flow", embed_in_flow: "move_into_flow",
};

const text = (v: unknown): string | undefined =>
  typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : undefined;

export function normalizeProjectOp(x: unknown): ProjectOp | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Record<string, unknown>;
  const rawOp = (text(r.op ?? r.action ?? r.type) ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const op = (PROJECT_ASK_OPS as readonly string[]).includes(rawOp) ? (rawOp as ProjectAskOpName) : OP_ALIASES[rawOp];
  if (!op) return null;
  const out: ProjectOp = { op };
  const path = text(r.path ?? r.file ?? r.folder ?? r.name_with_path);
  if (path !== undefined) out.path = path;
  const title = text(r.title);
  if (title !== undefined) out.title = title;
  const content = text(r.content ?? r.body ?? r.text);
  if (content !== undefined) out.content = content;
  const name = text(r.name ?? r.new_name ?? r.to);
  if (name !== undefined) out.name = name;
  const flow = text(r.flow ?? r.into ?? r.flow_path);
  if (flow !== undefined) out.flow = flow;
  return out;
}

export function parseProjectAskReply(x: unknown): ProjectAskReply {
  const r = x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
  const say = text(r.say ?? r.message) ?? "";
  const rawOps = Array.isArray(r.ops) ? r.ops : Array.isArray(r.actions) ? r.actions : [];
  return { say, ops: rawOps.map(normalizeProjectOp).filter((o): o is ProjectOp => !!o) };
}

/* ── planning (pure) ─────────────────────────────────────────────────────── */

export type ProjectAction =
  | { kind: "write"; path: string; content: string; note: string }
  | { kind: "mkdir"; path: string; note: string }
  | { kind: "rename"; path: string; name: string; note: string }
  | { kind: "moveIntoFlow"; path: string; flow: string; note: string };

/**
 * A path as the model wrote it → an absolute store path under the root, or the reason it is
 * refused. The tree the model reads is ROOT-relative, so a path with a slash is taken the same
 * way ("onboarding/done.frame"); a bare name lands in the TARGET folder; an absolute path must be
 * under the root. For something that must already exist (a rename), whichever reading exists wins.
 */
export function resolveProjectPath(target: ProjectAskTarget, raw: string | undefined, existing?: ReadonlySet<string>): { ok: true; abs: string } | { ok: false; why: string } {
  const p = (raw ?? "").trim().replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/\/+$/, "").replace(/^\.\//, "");
  if (!p) return { ok: false, why: "no path given" };
  if (p.split("/").some((seg) => seg === "..")) return { ok: false, why: `"${raw}" climbs out of its folder` };
  const root = target.root.replace(/\/+$/, "") || "/";
  const folder = target.folder.replace(/\/+$/, "") || root;
  const join = (base: string, rel: string) => (base === "/" ? `/${rel}` : `${base}/${rel}`);
  let abs: string;
  if (p.startsWith("/")) abs = p;
  else if (existing) {
    const underFolder = join(folder, p);
    const underRoot = join(root, p);
    abs = existing.has(underFolder) ? underFolder : existing.has(underRoot) ? underRoot : p.includes("/") ? underRoot : underFolder;
  } else abs = p.includes("/") ? join(root, p) : join(folder, p);
  if (abs !== root && !abs.startsWith(root === "/" ? "/" : `${root}/`)) return { ok: false, why: `"${raw}" is outside the project (${root})` };
  return { ok: true, abs };
}

/** Turn a reply's ops into actions, refusing what must not happen; never throws. */
export function planProjectOps(ops: ProjectOp[], target: ProjectAskTarget, existing: ReadonlySet<string>): { actions: ProjectAction[]; skipped: string[] } {
  const actions: ProjectAction[] = [];
  const skipped: string[] = [];
  const taken = new Set(existing);
  const known = new Set(TEMPLATE_KINDS.map((k) => k.ext));
  const rel = (abs: string) => abs.slice(target.root.length).replace(/^\/+/, "");
  for (const op of ops) {
    switch (op.op) {
      case "move_into_flow": {
        // No path = the frame the user clicked on.
        const fr = resolveProjectPath(target, op.path?.trim() ? op.path : target.file ?? undefined, taken);
        if (!fr.ok) { skipped.push(`move_into_flow: ${fr.why}`); break; }
        if (!fr.abs.toLowerCase().endsWith(".frame")) { skipped.push(`move_into_flow "${rel(fr.abs)}": only a .frame can move into a flow`); break; }
        if (!taken.has(fr.abs)) { skipped.push(`move_into_flow "${rel(fr.abs)}": nothing there to move`); break; }
        const fl = resolveProjectPath(target, op.flow, taken);
        if (!fl.ok) { skipped.push(`move_into_flow: ${fl.why}`); break; }
        if (!fl.abs.toLowerCase().endsWith(".flow") || !taken.has(fl.abs)) { skipped.push(`move_into_flow: "${op.flow ?? ""}" is not a flow in the project`); break; }
        actions.push({ kind: "moveIntoFlow", path: fr.abs, flow: fl.abs, note: `moved ${rel(fr.abs)} into ${rel(fl.abs)}` });
        taken.delete(fr.abs);
        break;
      }
      case "create_file": {
        const r = resolveProjectPath(target, op.path);
        if (!r.ok) { skipped.push(`create_file: ${r.why}`); break; }
        const ext = fileExtensionOf(r.abs);
        if (!ext) { skipped.push(`create_file "${op.path}": give it an extension (${TEMPLATE_KINDS.map((k) => `.${k.ext}`).join(", ")})`); break; }
        if (taken.has(r.abs)) { skipped.push(`create_file "${op.path}": it already exists — nothing is overwritten`); break; }
        const content = fileTemplate(r.abs, op.title, op.content);
        const kind = known.has(ext) ? `.${ext}` : `.${ext} (no template; ${op.content?.trim() ? "with the given text" : "empty"})`;
        actions.push({ kind: "write", path: r.abs, content, note: `created ${r.abs.slice(target.root.length).replace(/^\/+/, "")} — ${kind}${op.title?.trim() ? `, "${op.title.trim()}"` : ""}` });
        taken.add(r.abs);
        break;
      }
      case "create_folder": {
        const r = resolveProjectPath(target, op.path);
        if (!r.ok) { skipped.push(`create_folder: ${r.why}`); break; }
        if (taken.has(r.abs)) { skipped.push(`create_folder "${op.path}": it already exists`); break; }
        actions.push({ kind: "mkdir", path: r.abs, note: `created folder ${r.abs.slice(target.root.length).replace(/^\/+/, "")}/` });
        taken.add(r.abs);
        break;
      }
      case "rename": {
        // No path = the file the user clicked on.
        const r = resolveProjectPath(target, op.path?.trim() ? op.path : target.file ?? undefined, taken);
        if (!r.ok) { skipped.push(`rename: ${r.why}`); break; }
        const name = (op.name ?? "").trim();
        if (!name || name.includes("/")) { skipped.push(`rename "${op.path}": give a plain new name, no slashes`); break; }
        if (!taken.has(r.abs)) { skipped.push(`rename "${op.path}": nothing there to rename`); break; }
        const next = `${r.abs.slice(0, r.abs.lastIndexOf("/"))}/${name}`;
        if (taken.has(next)) { skipped.push(`rename "${op.path}" → "${name}": that name is taken`); break; }
        actions.push({ kind: "rename", path: r.abs, name, note: `renamed ${r.abs.slice(target.root.length).replace(/^\/+/, "")} → ${name}` });
        taken.delete(r.abs);
        taken.add(next);
        break;
      }
      default:
        skipped.push(`unknown op "${String((op as { op: unknown }).op)}"`);
    }
  }
  return { actions, skipped };
}

/* ── running (effects) ───────────────────────────────────────────────────── */

export interface ProjectFs {
  write?: ((abs: string, content: string) => Promise<void>) | null;
  mkdir?: ((abs: string) => Promise<void>) | null;
  rename?: ((abs: string, newName: string) => Promise<unknown>) | null;
  read?: ((abs: string) => Promise<string>) | null;
  remove?: ((abs: string) => Promise<void>) | null;
}

/** Perform a plan, in order, through the host's adapters; a failed action is said, the rest go
 *  on. `created` lists the files worth looking at next — made, or (for a move) the flow that grew. */
export async function runProjectPlan(actions: ProjectAction[], fs: ProjectFs): Promise<{ applied: string[]; skipped: string[]; created: string[] }> {
  const applied: string[] = [];
  const skipped: string[] = [];
  const created: string[] = [];
  for (const a of actions) {
    try {
      if (a.kind === "write") {
        if (!fs.write) { skipped.push(`${a.note}: this host cannot write files`); continue; }
        await fs.write(a.path, a.content);
        created.push(a.path);
        applied.push(a.note);
      } else if (a.kind === "mkdir") {
        if (!fs.mkdir) { skipped.push(`${a.note}: this host cannot create folders`); continue; }
        await fs.mkdir(a.path);
        applied.push(a.note);
      } else if (a.kind === "rename") {
        if (!fs.rename) { skipped.push(`${a.note}: this host cannot rename`); continue; }
        await fs.rename(a.path, a.name);
        applied.push(a.note);
      } else {
        if (!fs.read || !fs.write || !fs.remove) { skipped.push(`${a.note}: this host cannot move files`); continue; }
        // The flow holds the frame before the file goes — a failed write leaves the file in place.
        const r = moveFrameIntoFlow(await fs.read(a.flow), await fs.read(a.path), a.path, a.flow);
        await fs.write(a.flow, r.flowText);
        await fs.remove(a.path);
        created.push(a.flow);
        applied.push(`${a.note} as "${r.name}"${r.rewired ? ` (${r.rewired} state${r.rewired === 1 ? "" : "s"} re-pointed)` : " (added as a new screen)"}`);
      }
    } catch (e) {
      skipped.push(`${a.note}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { applied, skipped, created };
}
