/**
 * The inspector — the selected node's shape, sizing, props and meta; or,
 * with nothing selected, the document and its one frame. Every change is
 * a pure edit on the doc, handed back up as a new document. Uploads and
 * the frame picker go through the host's configured adapters and simply
 * stay hidden where the host has none.
 */
import * as React from "react";
import { Button, FilePickerDialog } from "crosscut";
import { configuredBinaryWriter, configuredFs } from "../../api";
import { FRAME_NODE_KINDS, type FrameDoc, type FrameNode, childrenOf, nodeById } from "../../lib/frameDoc";
import { canHoldChildren, patchProps, setDocMeta, setFrame, updateNode } from "../../lib/frameEdit";
import { ArrowDown, ArrowUp, ChevronsLeft, ChevronsRight, Copy, Eye, EyeOff, ImagePlus, Trash2 } from "lucide-react";
import { ColorField, NumberField, Section, SelectField, TextAreaField, TextField, Toggle } from "./frameFields";

const ALIGNS = [{ value: "", label: "stretch (default)" }, { value: "start", label: "start" }, { value: "center", label: "center" }, { value: "end", label: "end" }, { value: "stretch", label: "stretch" }];
const JUSTIFYS = [{ value: "", label: "start (default)" }, { value: "center", label: "center" }, { value: "end", label: "end" }, { value: "between", label: "space between" }, { value: "around", label: "space around" }, { value: "evenly", label: "space evenly" }];

/** Where an uploaded file lands: an assets folder beside the document, referenced by a document-relative path. */
export function assetPathFor(docPath: string, filename: string): { abs: string; ref: string } {
  const folder = docPath.slice(0, docPath.lastIndexOf("/"));
  const name = docPath.slice(docPath.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "");
  const safe = filename.replace(/[^A-Za-z0-9._-]+/g, "-");
  const ref = `${name}-assets/${safe}`;
  return { abs: `${folder}/${ref}`, ref };
}

function UploadButton({ docPath, onDone, label }: { docPath: string; onDone: (ref: string) => void; label: string }) {
  const writeBinary = configuredBinaryWriter();
  const ref = React.useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = React.useState(false);
  if (!writeBinary) return null;
  return (
    <>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (!f) return;
        setBusy(true);
        try {
          const { abs, ref: rel } = assetPathFor(docPath, f.name);
          await writeBinary(abs, f);
          onDone(rel);
        } catch (err) {
          window.alert(err instanceof Error ? err.message : String(err));
        } finally { setBusy(false); }
      }} />
      <Button size="sm" variant="outline" disabled={busy} onClick={() => ref.current?.click()}><ImagePlus /> {busy ? "Uploading…" : label}</Button>
    </>
  );
}

export interface FrameInspectorProps {
  doc: FrameDoc;
  docPath: string;
  selectedId: string | null;
  viewId: string | null;
  onDoc: (next: FrameDoc) => void;
  onSelect: (id: string | null) => void;
  actions: {
    remove: (id: string) => void;
    duplicate: (id: string) => void;
    move: (id: string, dir: -1 | 1) => void;
    indent: (id: string) => void;
    outdent: (id: string) => void;
    toggleHidden: (id: string) => void;
  };
}

export default function FrameInspector({ doc, docPath, selectedId, viewId, onDoc, onSelect, actions }: FrameInspectorProps) {
  const node = selectedId ? nodeById(doc, selectedId) : undefined;
  const [pickEmbed, setPickEmbed] = React.useState(false);
  const fs = configuredFs();
  const frame = doc.frames[0];

  if (!node) {
    return (
      <div className="flex h-full flex-col overflow-y-auto">
        <Section title="Document">
          <TextField label="Title" value={doc.title} onChange={(v) => onDoc(setDocMeta(doc, { title: v }))} />
          <TextAreaField label="Description" value={doc.description} rows={3} onChange={(v) => onDoc(setDocMeta(doc, { description: v }))} />
        </Section>
        <Section title="Frame">
          <TextField label="Name" value={frame?.name ?? ""} onChange={(v) => onDoc(setFrame(doc, { name: v }))} />
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Width" value={frame?.width} onChange={(v) => onDoc(setFrame(doc, { width: v ?? 390 }))} />
            <NumberField label="Height" value={frame?.height} onChange={(v) => onDoc(setFrame(doc, { height: v ?? 844 }))} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[["Phone", 390, 844], ["Tablet", 834, 1194], ["Desktop", 1440, 900]].map(([n, w, h]) => (
              <Button key={String(n)} size="sm" variant="ghost" onClick={() => onDoc(setFrame(doc, { width: Number(w), height: Number(h) }))}>{n} {w}×{h}</Button>
            ))}
          </div>
          <TextField label="Screenshot (store path)" value={frame?.image ?? ""} mono onChange={(v) => onDoc(setFrame(doc, { image: v || undefined }))}
            hint="Relative to this document, or absolute. Drawn behind the nodes." />
          <div className="flex gap-1.5">
            <UploadButton docPath={docPath} label="Upload screenshot" onDone={(rel) => onDoc(setFrame(doc, { image: rel }))} />
            {frame?.image && <Button size="sm" variant="ghost" onClick={() => onDoc(setFrame(doc, { image: undefined }))}>Clear</Button>}
          </div>
        </Section>
        <div className="px-3 py-3 text-[13px] text-muted-foreground">
          Click a node on the canvas or in the layers to edit it. Containers stack their children; the cross axis stretches.
          Give <code>expand</code> to the one container that should fill the leftover space.
        </div>
      </div>
    );
  }

  const parent = node.parent ? nodeById(doc, node.parent) : undefined;
  const hiddenHere = viewId ? !!doc.views.find((v) => v.id === viewId)?.hidden.includes(node.id) : false;
  const p = node.props;
  const prop = (k: string) => (p[k] === undefined || p[k] === null ? "" : String(p[k]));
  const setProp = (k: string, v: unknown) => onDoc(patchProps(doc, node.id, { [k]: v }));
  const setNum = (k: string) => (v: number | undefined) => setProp(k, v);
  const isContainer = canHoldChildren(node.kind) && node.kind !== "embed";
  const containers = doc.nodes.filter((n) => canHoldChildren(n.kind) && n.id !== node.id);
  const parentIsEmbed = parent?.kind === "embed";

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{node.name}</span>
        <Button size="icon" variant="ghost" title="Move up" onClick={() => actions.move(node.id, -1)}><ArrowUp /></Button>
        <Button size="icon" variant="ghost" title="Move down" onClick={() => actions.move(node.id, 1)}><ArrowDown /></Button>
        <Button size="icon" variant="ghost" title="Nest under the sibling above" onClick={() => actions.indent(node.id)}><ChevronsRight /></Button>
        <Button size="icon" variant="ghost" title="Lift out of the parent" onClick={() => actions.outdent(node.id)}><ChevronsLeft /></Button>
        <Button size="icon" variant="ghost" title="Duplicate" onClick={() => actions.duplicate(node.id)}><Copy /></Button>
        {viewId && (
          <Button size="icon" variant="ghost" title={hiddenHere ? "Show in this view" : "Hide in this view"} onClick={() => actions.toggleHidden(node.id)}>
            {hiddenHere ? <EyeOff /> : <Eye />}
          </Button>
        )}
        <Button size="icon" variant="ghost" title="Delete" onClick={() => { actions.remove(node.id); onSelect(null); }}><Trash2 className="text-destructive" /></Button>
      </div>
      <Section title="Node">
        <TextField label="Name" value={node.name} onChange={(v) => onDoc(updateNode(doc, node.id, { name: v }))} />
        <div className="grid grid-cols-2 gap-2">
          <SelectField label="Kind" value={node.kind} onChange={(v) => onDoc(updateNode(doc, node.id, { kind: v }))}
            options={FRAME_NODE_KINDS.map((k) => ({ value: k, label: k }))} />
          <SelectField label="Parent" value={node.parent ?? ""} onChange={(v) => onDoc(updateNode(doc, node.id, { parent: v || undefined }))}
            options={[{ value: "", label: "(the frame)" }, ...containers.map((c) => ({ value: c.id, label: `${c.name} · ${c.kind}` }))]} />
        </div>
        <div className="text-xs font-mono text-muted-foreground">id: {node.id}{parent ? ` · in ${parent.name} (${parent.kind})` : " · on the frame"}</div>
      </Section>
      <Section title="Sizing">
        <div className="flex gap-4">
          <Toggle label="hug (default)" on={!node.fixed && !node.expand} onChange={(v) => { if (v) onDoc(updateNode(doc, node.id, { fixed: false, expand: false })); }} />
          <Toggle label="fixed" on={!!node.fixed} onChange={(v) => onDoc(updateNode(doc, node.id, { fixed: v }))} hint="Pin the main-axis size — set that dimension below" />
          <Toggle label="expand" on={!!node.expand} onChange={(v) => onDoc(updateNode(doc, node.id, { expand: v }))} hint="Grow to fill the parent's main axis" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Width" value={node.width} onChange={(v) => onDoc(updateNode(doc, node.id, { width: v }))} placeholder="auto" />
          <NumberField label="Height" value={node.height} onChange={(v) => onDoc(updateNode(doc, node.id, { height: v }))} placeholder="auto" />
        </div>
        {parentIsEmbed && (
          <TextField label="Injects into slot" value={prop("slot")} onChange={(v) => setProp("slot", v)} mono
            hint="The embedded frame's slot name this node renders into." />
        )}
      </Section>
      {isContainer && (
        <Section title="Layout">
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Gap" value={typeof p.gap === "number" ? p.gap : undefined} onChange={setNum("gap")} />
            <NumberField label="Padding" value={typeof p.padding === "number" ? p.padding : undefined} onChange={setNum("padding")} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <SelectField label="Align (cross axis)" value={prop("align")} onChange={(v) => setProp("align", v)} options={ALIGNS} />
            <SelectField label="Justify (main axis)" value={prop("justify")} onChange={(v) => setProp("justify", v)} options={JUSTIFYS} />
          </div>
          {node.kind === "grid" && <NumberField label="Columns" value={typeof p.columns === "number" ? p.columns : undefined} onChange={setNum("columns")} />}
          {node.kind === "scroll" && (
            <SelectField label="Direction" value={prop("direction") || "vertical"} onChange={(v) => setProp("direction", v)}
              options={[{ value: "vertical", label: "vertical" }, { value: "horizontal", label: "horizontal" }]}
              hint="Unsized, a scroll fills the leftover space along its direction and the wheel scrolls it; give it a height or width to bound it yourself." />
          )}
          {node.kind === "hstack" && <Toggle label="wrap" on={p.wrap === true} onChange={(v) => setProp("wrap", v || undefined)} />}
        </Section>
      )}
      {parent?.kind === "grid" && (
        <Section title="Grid cell">
          <NumberField label="Span (columns)" value={typeof p.span === "number" ? p.span : undefined} onChange={setNum("span")} />
        </Section>
      )}
      {(node.kind === "text" || node.kind === "button") && (
        <Section title="Text">
          <TextAreaField label="Text" value={prop("text")} rows={2} onChange={(v) => setProp("text", v)} />
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Font size" value={typeof p.fontSize === "number" ? p.fontSize : undefined} onChange={setNum("fontSize")} />
            <SelectField label="Weight" value={prop("fontWeight")} onChange={(v) => setProp("fontWeight", v)}
              options={[{ value: "", label: "regular" }, { value: "500", label: "medium" }, { value: "600", label: "semibold" }, { value: "700", label: "bold" }]} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <SelectField label="Align" value={prop("textAlign")} onChange={(v) => setProp("textAlign", v)}
              options={[{ value: "", label: "left" }, { value: "center", label: "center" }, { value: "right", label: "right" }]} />
            <SelectField label="Style" value={prop("fontStyle")} onChange={(v) => setProp("fontStyle", v)}
              options={[{ value: "", label: "normal" }, { value: "italic", label: "italic" }]} />
          </div>
          <ColorField label="Color" value={prop("color")} onChange={(v) => setProp("color", v)} />
        </Section>
      )}
      {node.kind === "input" && (
        <Section title="Input">
          <TextField label="Placeholder" value={prop("placeholder")} onChange={(v) => setProp("placeholder", v)} />
          <NumberField label="Font size" value={typeof p.fontSize === "number" ? p.fontSize : undefined} onChange={setNum("fontSize")} />
        </Section>
      )}
      {node.kind === "image" && (
        <Section title="Image">
          <TextField label="Source (store path or URL)" value={prop("src")} mono onChange={(v) => setProp("src", v)} />
          <div className="flex gap-1.5">
            <UploadButton docPath={docPath} label="Upload image" onDone={(rel) => setProp("src", rel)} />
          </div>
          <SelectField label="Fit" value={prop("fit")} onChange={(v) => setProp("fit", v)}
            options={[{ value: "", label: "cover" }, { value: "contain", label: "contain" }, { value: "fill", label: "fill" }]} />
        </Section>
      )}
      {node.kind === "divider" && (
        <Section title="Divider">
          <ColorField label="Color" value={prop("color")} onChange={(v) => setProp("color", v)} />
        </Section>
      )}
      {node.kind === "embed" && (
        <Section title="Embed">
          <TextField label="Frame (ref_path)" value={prop("ref_path")} mono onChange={(v) => setProp("ref_path", v)}
            hint="Another .frame, relative to this document or absolute. Rendered live, read-only." />
          {fs && (
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" onClick={() => setPickEmbed(true)}>Pick a frame…</Button>
            </div>
          )}
          <TextField label="View (optional)" value={prop("view")} mono onChange={(v) => setProp("view", v)} hint="The embedded frame's view id to render; blank = Base." />
          <div className="text-xs text-muted-foreground">Children of this node carrying an “injects into slot” name render inside the embedded frame's slot.</div>
          {fs && (
            <FilePickerDialog fs={fs} mode="open" open={pickEmbed} onOpenChange={setPickEmbed} extensions={["frame"]}
              initialPath={docPath.slice(0, docPath.lastIndexOf("/")) || "/"} title="Embed a frame"
              onPick={(abs) => { setProp("ref_path", relativeRef(docPath, abs)); setPickEmbed(false); }} />
          )}
        </Section>
      )}
      {node.kind === "slot" && (
        <Section title="Slot">
          <TextField label="Slot name" value={prop("name")} mono onChange={(v) => setProp("name", v)} hint="What an embedding document targets with its injections." />
        </Section>
      )}
      <Section title="Box">
        <ColorField label="Background" value={prop("background")} onChange={(v) => setProp("background", v)} />
        <div className="grid grid-cols-3 gap-2">
          <NumberField label="Radius" value={typeof p.borderRadius === "number" ? p.borderRadius : undefined} onChange={setNum("borderRadius")} />
          <NumberField label="Border" value={typeof p.borderWidth === "number" ? p.borderWidth : undefined} onChange={setNum("borderWidth")} />
          <NumberField label="Opacity" value={typeof p.opacity === "number" ? p.opacity : undefined} onChange={setNum("opacity")} placeholder="1" />
        </div>
        <ColorField label="Border color" value={prop("borderColor")} onChange={(v) => setProp("borderColor", v)} />
      </Section>
      <Section title="Meta">
        <TextAreaField label="key: value per line" mono rows={3}
          value={Object.entries(node.meta).map(([k, v]) => `${k}: ${v}`).join("\n")}
          onChange={(v) => {
            const meta: Record<string, string> = {};
            for (const line of v.split("\n")) {
              const m = line.match(/^\s*([^:]+?)\s*:\s*(.*)$/);
              if (m) meta[m[1]] = m[2];
            }
            onDoc(updateNode(doc, node.id, { meta }));
          }} />
      </Section>
      {isContainer && childrenOf(doc, node.id).length === 0 && (
        <div className="px-3 py-2 text-[13px] text-muted-foreground">Empty container — add a node from the layers panel while it is selected.</div>
      )}
    </div>
  );
}

/** The shortest ref from a document to a target: sibling files by bare name, else absolute. */
export function relativeRef(docPath: string, abs: string): string {
  const folder = docPath.slice(0, docPath.lastIndexOf("/") + 1);
  return abs.startsWith(folder) ? abs.slice(folder.length) : abs;
}

export type { FrameNode };
