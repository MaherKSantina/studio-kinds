/**
 * THE HANDOVER — what leaves the frame editor once the sketch is agreed: one
 * PNG per view, the YAML (legend included, latest version only) and a
 * markdown page that puts each picture beside the text, all in
 * `<stem>-handover/` next to the frame in the store. Nothing here renders:
 * the editor mounts each view at 1:1 and hands the element over; this
 * rasterises it and writes the files through the host's configured writers.
 */
import { toSvg } from "html-to-image";
import { configuredBinaryWriter, configuredWriter } from "../api";
import { type FrameDoc, type FrameView, dumpFrame, frameOf, nodeById } from "./frameDoc";

export interface HandoverFile { name: string; path: string; kind: "png" | "yaml" | "md" }
export interface HandoverResult { folder: string; files: HandoverFile[] }

export const stemOf = (docPath: string): string => docPath.slice(docPath.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "");

/** `<folder>/<stem>-handover` — beside the frame, named after it. */
export const handoverFolder = (docPath: string): string => `${docPath.slice(0, docPath.lastIndexOf("/"))}/${stemOf(docPath)}-handover`;

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "view";

export interface ViewFile { view: FrameView | null; label: string; file: string }

/** One PNG per view — Base first, names slugged, a collision suffixed by the view id. */
export function viewFiles(doc: FrameDoc): ViewFile[] {
  const out: ViewFile[] = [{ view: null, label: "Base", file: "base.png" }];
  const taken = new Set(["base"]);
  for (const v of doc.views) {
    let s = slug(v.name);
    if (taken.has(s)) s = `${s}-${slug(v.id)}`;
    taken.add(s);
    out.push({ view: v, label: v.name, file: `${s}.png` });
  }
  return out;
}

/** A mounted 1:1 canvas → PNG bytes at 2× (crisp on any screen, readable when
 *  zoomed). html-to-image supplies the SVG; drawing it happens here, through
 *  `decode()` rather than an animation frame, so an export keeps going when
 *  the tab is in the background (frames pause there, decoding does not). */
export async function rasterise(el: HTMLElement, pixelRatio = 2): Promise<Blob> {
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const svg = await toSvg(el, { width: w, height: h, backgroundColor: "#ffffff", skipFonts: true, cacheBust: false });
  const img = new Image();
  img.decoding = "async";
  img.src = svg;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * pixelRatio);
  canvas.height = Math.round(h * pixelRatio);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser gave no 2D canvas to draw the view into.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed."))), "image/png"),
  );
}

/** The page: the frame, every view with its picture, the notes, the YAML. */
export function handoverMarkdown(doc: FrameDoc, docPath: string, files: ViewFile[], yamlFile: string, yamlText: string): string {
  const frame = frameOf(doc);
  const title = doc.title || stemOf(docPath);
  const lines: string[] = [`# ${title} — handover`, ""];
  lines.push(
    `Frame ${frame?.width ?? "?"}×${frame?.height ?? "?"}${doc.versionName ? ` · version ${doc.versionName}` : ""}` +
    ` · exported ${new Date().toISOString().slice(0, 10)} from \`nodes:${docPath}\`.`,
  );
  if (doc.description.trim()) lines.push("", doc.description.trim());
  lines.push("", "## Views", "");
  for (const f of files) {
    lines.push(`### ${f.label}`, "");
    if (f.view) {
      const names = f.view.hidden.map((id) => nodeById(doc, id)?.name ?? id);
      lines.push(names.length ? `Hides: ${names.join(", ")}.` : "Hides nothing.", "");
    }
    lines.push(`![${f.label}](${f.file})`, "");
  }
  const notes = doc.nodes.filter((n) => Object.keys(n.meta).length);
  if (notes.length) {
    lines.push("## Notes on nodes", "");
    for (const n of notes) lines.push(`- **${n.name}** (${n.id}): ${Object.entries(n.meta).map(([k, v]) => `${k}: ${v}`).join(" · ")}`);
    lines.push("");
  }
  lines.push("## The frame", "", `The source of truth, also saved beside this page as \`${yamlFile}\`. Its legend explains the vocabulary.`, "",
    "```yaml", yamlText.trimEnd(), "```", "");
  return lines.join("\n");
}

export interface ExportDeps {
  /** Mount `view` at 1:1 and resolve with the canvas element once it has painted and its images loaded. */
  render: (view: FrameView | null) => Promise<HTMLElement>;
  onProgress?: (msg: string) => void;
}

export async function exportHandover(doc: FrameDoc, docPath: string, deps: ExportDeps): Promise<HandoverResult> {
  if (!frameOf(doc)) throw new Error("Nothing to export: the file has no frame yet.");
  const write = configuredWriter();
  const writeBinary = configuredBinaryWriter();
  if (!write || !writeBinary) throw new Error("This host cannot write files, so there is nowhere to put the handover.");
  const folder = handoverFolder(docPath);
  const files: HandoverFile[] = [];
  const views = viewFiles(doc);
  for (const v of views) {
    deps.onProgress?.(`Rendering ${v.label}…`);
    const el = await deps.render(v.view);
    const blob = await rasterise(el);
    await writeBinary(`${folder}/${v.file}`, blob);
    files.push({ name: v.file, path: `${folder}/${v.file}`, kind: "png" });
  }
  deps.onProgress?.("Writing the YAML and the page…");
  const yamlFile = `${stemOf(docPath)}.yaml`;
  const yamlText = dumpFrame({ ...doc, versions: [] });
  await write(`${folder}/${yamlFile}`, yamlText);
  files.push({ name: yamlFile, path: `${folder}/${yamlFile}`, kind: "yaml" });
  await write(`${folder}/handover.md`, handoverMarkdown(doc, docPath, views, yamlFile, yamlText));
  files.push({ name: "handover.md", path: `${folder}/handover.md`, kind: "md" });
  return { folder, files };
}
