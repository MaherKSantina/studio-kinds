/**
 * A `.project` open — the project's own tree on the left (items iconed by
 * KIND, no extensions anywhere), the selected item on the right:
 *
 *   file item → the shared DocumentPreview (edits autosave when the host
 *               configured a writer) + an "Open in <studio>" button
 *   node item → a raw browser of that nodes folder — folders and files WITH
 *               their extensions, deliberately no per-file preview
 *
 * Pure registry viewer: file access rides the configured reader / lister /
 * writer, so any tool that renders `.project` gets the whole surface.
 */
import { Suspense, lazy as lazyReact, useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft, ArrowUpRight, Boxes, Brain, ChevronDown, ChevronRight, CircleDot,
  Crosshair, ExternalLink, File as FileIcon, FilePlus, FileText, Folder, FolderSymlink, FolderTree, History, Layers,
  Package, PanelLeftClose, PanelLeftOpen, RefreshCw, SlidersHorizontal, Workflow, Zap, MessageSquare, Trash2 } from "lucide-react";
import { Box, Typography } from "@mui/material";
import { Dialog, DialogContent, DialogDescription, DialogTitle, isStructuredName, resolveRef } from "crosscut";
import { Button, useAutosave, useIsMobile } from "crosscut";
import { SplitNodeView } from "../SplitNodeView";
import { configuredAsk, configuredLister, configuredRemover, configuredWriter, readVirtualDirectoryFile } from "../../api";
import { fileTemplate as templateFor } from "../../lib/fileTemplates";
import ProjectAsk from "./ProjectAsk";
import MoveIntoFlowButton from "./MoveIntoFlow";
import { StudioDialog } from "../StudioDialog";
import { openInStudio, studioNameFor, studioUrlFor } from "../../lib/studioDialog";
import {
  ProjectDoc, ProjectItem, ProjectLink, exportedProjectItems, fileItemsOf, itemKind, itemLabel, linksTouching, parseProject,
  projectMemoryPath, projectRoot, writeProjectTop,
} from "../../lib/projectDoc";
import { newProjectMemory } from "../../lib/memoryDoc";
import { dumpFrame, newFrameDoc } from "../../lib/frameDoc";
import { ITEM_FILE_TEMPLATES as FLOW_TEMPLATES } from "../flow/flowHost";
import { iconForFsPath } from "../kindIcons";
import MemoryView from "../memory/MemoryView";
import { exportedStages, parsePoints, type StreamStage } from "../../lib/pointsDoc";
import { definitionChildren, instanceChildren, parseDefinitionFile, type DefSlot } from "../../lib/definitionDoc";
import { exportedItems, parseDocList, type DocListItem } from "../../lib/listDoc";
import { exportedAnalyses, parseWorkup } from "../../lib/workupDoc";
import {
  LanedGraph, assembleLanedGraph, localizeGraph, nodeConnections, originVersionGraph, rowStreamsUnrolled, versionStreamsUnrolled,
} from "../../lib/projectGraph";
import { KIND_ICONS } from "../kindIcons";
import FileContentDialog, { FileContentBody } from "../points/FileContentDialog";
import PointsViewDefault from "../points/PointsView";
import { parsePlaybook, type PlaybookDoc } from "../../lib/playbookDoc";
import PointsView from "../points/PointsView";
import ElementView from "../playbook/ElementView";
import { extensionOfPath, previewForPath, type ViewerProps } from "../../lib/filePreviews";
import { DocumentPreview } from "../DocumentPreview";
import { NodeHistoryDialog, type HistoryRequest, type VersionLens } from "./NodeHistoryDialog";
import type { HistoryTarget } from "../../lib/nodeHistory";
import { versionsFolderOf } from "../../lib/nodeHistory";

function iconFor(it: ProjectItem): React.ComponentType<{ className?: string }> {
  const kind = itemKind(it);
  if (kind === "folder") return Folder;
  if (kind === "node") return FolderSymlink;
  if (kind === "project") return Package;
  // A stage item stands alone in the hierarchy — the stage icon, not the
  // stream's kind icon.
  if (it.stage) return Layers;
  // A structured node (`*.node` folder) is one document with two halves.
  if (it.file && isStructuredName(it.file)) return Boxes;
  const k = previewForPath(it.file!);
  return (k && KIND_ICONS[k.key]) || FileIcon;
}

/* ── the project's own tree ─────────────────────────────────────────────── */

export interface StageSelection { file: string; stageKey: string; stageLabel: string; itemLabel: string }
export interface ElementSelection { file: string; kind: "decision" | "event"; elKey: string; label: string; itemLabel: string }
export interface DocSelection { listFile: string; itemFile: string; label: string; itemLabel: string }

interface PolicyChild { kind: "decision" | "event"; key: string; label: string }

/** One stream point that PRODUCED a policy node: found by scanning the
 *  project's points items for a target matching (file, element). */
export interface Producer { streamFile: string; streamTitle: string; pointId: string }

const collectPointsFiles = (items: ProjectItem[]): string[] =>
  items.flatMap((it) =>
    it.items ? collectPointsFiles(it.items)
    : it.file && previewForPath(it.file)?.key === "points" ? [it.file] : []);

/** file|element -> producer. Every points item is read once. */
async function buildProducerIndex(items: ProjectItem[]): Promise<Map<string, Producer>> {
  const map = new Map<string, Producer>();
  for (const streamFile of collectPointsFiles(items)) {
    try {
      const r = await readVirtualDirectoryFile(streamFile, streamFile);
      const doc = parsePoints(r.content);
      for (const pt of doc.points) {
        if (!pt.target) continue;
        const abs = resolveRef(streamFile, pt.target.file);
        map.set(`${abs}|${pt.target.element ?? ""}`,
          { streamFile, streamTitle: doc.title, pointId: pt.id });
      }
    } catch { /* a broken stream never blocks the tree */ }
  }
  return map;
}

/** The producing stream, whole, in a dialog — opened from a policy child. */
function ProducerDialog({ producer, onClose }: { producer: Producer | null; onClose: () => void }) {
  const [content, setContent] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const file = producer?.streamFile ?? null;
  useEffect(() => {
    if (!file) return;
    let live = true;
    setContent(null); setErr(null);
    readVirtualDirectoryFile(file, file).then(
      (r) => { if (live) setContent(r.content); },
      (e: unknown) => { if (live) setErr(e instanceof Error ? e.message : String(e)); },
    );
    return () => { live = false; };
  }, [file]);
  if (!producer || !file) return null;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex h-[86dvh] flex-col gap-0 p-0 sm:max-w-[88vw]" showCloseButton>
        <DialogTitle className="sr-only">{producer.streamTitle}</DialogTitle>
        <DialogDescription className="sr-only">The stream that produced this node</DialogDescription>
        <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
          <Workflow className="size-4 text-primary" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{producer.streamTitle}</span>
          <span className="font-mono text-xs text-muted-foreground">produced {producer.pointId}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {err ? <div className="p-6 text-sm text-destructive">{err}</div>
            : content === null ? <div className="p-6 text-sm text-muted-foreground">Loading…</div>
              : <PointsViewDefault content={content} height="100%" agentId={file} path={file} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ItemRow({ it, depth, selectedKey, onSelect, onSelectStage, onSelectElement, onSelectDoc, onOpenProducer, producers, path, graph, onLens, onHistory }: {
  it: ProjectItem;
  depth: number;
  selectedKey: string | null;
  onSelect: (key: string, it: ProjectItem) => void;
  onSelectStage: (key: string, sel: StageSelection) => void;
  onSelectElement: (key: string, sel: ElementSelection) => void;
  onSelectDoc: (key: string, sel: DocSelection) => void;
  onOpenProducer: (p: Producer) => void;
  producers: Map<string, Producer>;
  path: string;
  graph: LanedGraph | null;
  onLens: (l: RowLens) => void;
  onHistory: (r: HistoryRequest) => void;
}) {
  const kind = itemKind(it);
  const isProjectRef = kind === "project";
  const isStageItem = kind === "file" && !!it.stage;
  const isPoints = kind === "file" && !isStageItem && previewForPath(it.file!)?.key === "points";
  const isPlaybook = kind === "file" && !isStageItem && previewForPath(it.file!)?.key === "playbook";
  const isList = kind === "file" && !isStageItem && previewForPath(it.file!)?.key === "list";
  const isWorkup = kind === "file" && !isStageItem && previewForPath(it.file!)?.key === "workup";
  const isDefinition = kind === "file" && !isStageItem && previewForPath(it.file!)?.key === "definition";
  const [open, setOpen] = useState(kind === "folder");
  // A points item can EXPAND: its file names the stages it exports, and those
  // show as children right in the project hierarchy.
  const [stages, setStages] = useState<StreamStage[] | null>(null);
  useEffect(() => {
    if (!isPoints || !open || stages !== null) return;
    let live = true;
    readVirtualDirectoryFile(it.file!, it.file!).then(
      (r) => { if (live) setStages(exportedStages(parsePoints(r.content))); },
      () => { if (live) setStages([]); },
    );
    return () => { live = false; };
  }, [isPoints, open, stages, it.file]);
  // A POLICY item expands too: its decisions and events are addressable
  // children — the points streams target, and single-element views open.
  const [elements, setElements] = useState<PolicyChild[] | null>(null);
  useEffect(() => {
    if (!isPlaybook || !open || elements !== null) return;
    let live = true;
    readVirtualDirectoryFile(it.file!, it.file!).then(
      (r) => {
        if (!live) return;
        const doc = parsePlaybook(r.content);
        setElements([
          ...doc.decisions.map((d) => ({ kind: "decision" as const, key: d.key, label: d.label })),
          ...doc.events.map((e) => ({ kind: "event" as const, key: e.key, label: e.label })),
        ]);
      },
      () => { if (live) setElements([]); },
    );
    return () => { live = false; };
  }, [isPlaybook, open, elements, it.file]);

  // A list item can EXPAND: its exported documents show as children.
  const [docItems, setDocItems] = useState<{ item: DocListItem; index: number }[] | null>(null);
  useEffect(() => {
    if (!isList || !open || docItems !== null) return;
    let live = true;
    readVirtualDirectoryFile(it.file!, it.file!).then(
      (r) => { if (live) setDocItems(exportedItems(parseDocList(r.content))); },
      () => { if (live) setDocItems([]); },
    );
    return () => { live = false; };
  }, [isList, open, docItems, it.file]);

  // A DEFINITION INSTANCE expands: its exported SLOTS show as children —
  // filled ones open their documents; empty ones show as the gaps they are.
  const [slotDocs, setSlotDocs] = useState<{ slot: DefSlot; fill: string | null }[] | null>(null);
  useEffect(() => {
    if (!isDefinition || !open || slotDocs !== null) return;
    let live = true;
    (async () => {
      try {
        const r = await readVirtualDirectoryFile(it.file!, it.file!);
        const parsed = parseDefinitionFile(r.content);
        if (parsed.role === "journey") {
          // A journey's children are its stage boards, each opening whole.
          if (live) setSlotDocs(parsed.journey.map((ref, i) => ({
            slot: { key: `stage:${i}`, label: ref.slice(ref.lastIndexOf("/") + 1).replace(/\.definition$/, ""), from: [] },
            fill: ref,
          })));
          return;
        }
        if (parsed.role === "board") {
          // A board's children are its instances, each opening whole.
          if (live) setSlotDocs(parsed.instances.map((ref, i) => ({
            slot: { key: `inst:${i}`, label: ref.slice(ref.lastIndexOf("/") + 1).replace(/\.definition$/, ""), from: [] },
            fill: ref,
          })));
          return;
        }
        if (parsed.role === "definition") {
          if (live) setSlotDocs(definitionChildren(parsed).map((slot) => ({ slot, fill: null })));
          return;
        }
        const defAbs = resolveRef(it.file!, parsed.definition);
        const d = await readVirtualDirectoryFile(defAbs, defAbs);
        const def = parseDefinitionFile(d.content);
        if (def.role !== "definition") { if (live) setSlotDocs([]); return; }
        if (live) setSlotDocs(instanceChildren(def, parsed));
      } catch { if (live) setSlotDocs([]); }
    })();
    return () => { live = false; };
  }, [isDefinition, open, slotDocs, it.file]);

  // A PROJECT REFERENCE expands: the referenced project's EXPORTED items show
  // as children — documents shared into this project, opening as its own.
  const [refDocs, setRefDocs] = useState<{ file: string; label: string }[] | null>(null);
  useEffect(() => {
    if (!isProjectRef || !open || refDocs !== null) return;
    let live = true;
    readVirtualDirectoryFile(it.project!, it.project!).then(
      (r) => { if (live) setRefDocs(exportedProjectItems(parseProject(r.content))); },
      () => { if (live) setRefDocs([]); },
    );
    return () => { live = false; };
  }, [isProjectRef, open, refDocs, it.project]);

  // A WORKUP item expands too: the analyses it has actually LANDED show as
  // nodes under the workup node. Steps still pending export nothing — they
  // simply are not here.
  const [outputs, setOutputs] = useState<{ key: string; label: string; path: string }[] | null>(null);
  useEffect(() => {
    if (!isWorkup || !open || outputs !== null) return;
    let live = true;
    readVirtualDirectoryFile(it.file!, it.file!).then(
      (r) => {
        if (!live) return;
        const doc = parseWorkup(r.content);
        setOutputs(exportedAnalyses(doc, it.file!).map(({ step, path }) => ({
          key: step.key, label: step.label ?? step.key, path,
        })));
      },
      () => { if (live) setOutputs([]); },
    );
    return () => { live = false; };
  }, [isWorkup, open, outputs, it.file]);

  const Icon = iconFor(it);
  const isSel = selectedKey === path;
  const expandable = kind === "folder" || isProjectRef || isPoints || isPlaybook || isList || isWorkup || isDefinition;
  return (
    <div>
      <div className="flex items-center">
        <button type="button"
          style={{ paddingLeft: depth * 14 + 4 }}
          className={"flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1 text-left text-sm " +
            (isSel ? "bg-accent text-accent-foreground" : "hover:bg-accent/50")}
          onClick={() => {
            if (kind === "folder" || isProjectRef) { setOpen((o) => !o); return; }
            if (isStageItem) {
              onSelectStage(path, { file: it.file!, stageKey: it.stage!, stageLabel: itemLabel(it), itemLabel: itemLabel(it) });
              return;
            }
            if (isPoints || isPlaybook || isList || isWorkup || isDefinition) setOpen((o) => !o);
            onSelect(path, it);
          }}>
          {expandable
            ? (open ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                    : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />)
            : <span className="w-3.5 shrink-0" />}
          <Icon className={"size-4 shrink-0 " +
            (kind === "folder" ? "fill-info/15 text-info"
              : kind === "node" || kind === "project" ? "text-primary"
                : "text-muted-foreground")} />
          <span className="min-w-0 flex-1 truncate">{itemLabel(it)}</span>
        </button>
        {kind !== "folder" && kind !== "project" && (
          <>
            <LensButtons graph={graph} id={(it.file ?? it.node)!} label={itemLabel(it)} onLens={onLens} />
            <HistoryButton graph={graph} id={(it.file ?? it.node)!} label={itemLabel(it)} onHistory={onHistory} />
          </>
        )}
      </div>
      {kind === "folder" && open && (it.items ?? []).map((c, i) => (
        <ItemRow key={i} it={c} depth={depth + 1} selectedKey={selectedKey}
          onSelect={onSelect} onSelectStage={onSelectStage} onSelectElement={onSelectElement}
          onSelectDoc={onSelectDoc} onOpenProducer={onOpenProducer} producers={producers} path={`${path}.${i}`}
          graph={graph} onLens={onLens} onHistory={onHistory} />
      ))}
      {isDefinition && open && (slotDocs ?? []).map(({ slot, fill }) => {
        const label = slot.label ?? slot.key;
        if (!fill) {
          return (
            <div key={slot.key} className="flex items-center" title={slot.hint ?? "not filled yet"}>
              <span style={{ paddingLeft: (depth + 1) * 14 + 4 }}
                className="flex min-w-0 flex-1 items-center gap-1.5 px-1 py-1 text-[13px] italic text-muted-foreground/70">
                <span className="w-3.5 shrink-0" />
                <FileText className="size-3.5 shrink-0 opacity-40" />
                <span className="min-w-0 flex-1 truncate">{label} — empty</span>
              </span>
            </div>
          );
        }
        const abs = resolveRef(it.file!, fill);
        const K = previewForPath(abs);
        const SIcon = (K && KIND_ICONS[K.key]) || FileIcon;
        return (
          <div key={slot.key} className="flex items-center">
            <button type="button" title={abs}
              style={{ paddingLeft: (depth + 1) * 14 + 4 }}
              className={"flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1 text-left text-[13px] " +
                (selectedKey === `${path}:slot:${slot.key}` ? "bg-accent text-accent-foreground" : "hover:bg-accent/50")}
              onClick={() => onSelectDoc(`${path}:slot:${slot.key}`,
                { listFile: it.file!, itemFile: fill, label, itemLabel: itemLabel(it) })}>
              <span className="w-3.5 shrink-0" />
              <SIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{label}</span>
            </button>
            <LensButtons graph={graph} id={abs} label={label} onLens={onLens} />
            <HistoryButton graph={graph} id={abs} label={label} onHistory={onHistory} />
          </div>
        );
      })}
      {isDefinition && open && slotDocs !== null && !slotDocs.length && (
        <p style={{ paddingLeft: (depth + 1) * 14 + 8 }} className="py-0.5 text-[13px] italic text-muted-foreground">
          no exported slots
        </p>
      )}
      {isProjectRef && open && (refDocs ?? []).map((d, i) => {
        const abs = resolveRef(it.project!, d.file);
        const K = previewForPath(abs);
        const CIcon = (K && KIND_ICONS[K.key]) || FileIcon;
        return (
          <div key={i} className="flex items-center">
            <button type="button" title={abs}
              style={{ paddingLeft: (depth + 1) * 14 + 4 }}
              className={"flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1 text-left text-[13px] " +
                (selectedKey === `${path}:ref:${i}` ? "bg-accent text-accent-foreground" : "hover:bg-accent/50")}
              onClick={() => onSelectDoc(`${path}:ref:${i}`,
                { listFile: it.project!, itemFile: d.file, label: d.label, itemLabel: itemLabel(it) })}>
              <span className="w-3.5 shrink-0" />
              <CIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{d.label}</span>
            </button>
            <LensButtons graph={graph} id={abs} label={d.label} onLens={onLens} />
            <HistoryButton graph={graph} id={abs} label={d.label} onHistory={onHistory} />
          </div>
        );
      })}
      {isProjectRef && open && refDocs !== null && !refDocs.length && (
        <p style={{ paddingLeft: (depth + 1) * 14 + 8 }} className="py-0.5 text-[13px] italic text-muted-foreground">
          nothing exported by that project
        </p>
      )}
      {isPoints && open && (stages ?? []).map((st) => (
        <div key={st.key} className="flex items-center">
          <button type="button"
            style={{ paddingLeft: (depth + 1) * 14 + 4 }}
            className={"flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1 text-left text-[13px] " +
              (selectedKey === `${path}:${st.key}` ? "bg-accent text-accent-foreground" : "hover:bg-accent/50")}
            onClick={() => onSelectStage(`${path}:${st.key}`, { file: it.file!, stageKey: st.key, stageLabel: st.label, itemLabel: itemLabel(it) })}>
            <span className="w-3.5 shrink-0" />
            {st.kind === "points"
              ? <CircleDot className="size-3.5 shrink-0 text-muted-foreground" />
              : <Layers className="size-3.5 shrink-0 text-muted-foreground" />}
            <span className="min-w-0 flex-1 truncate">{st.label}</span>
          </button>
          <LensButtons graph={graph} id={`${it.file}#stage:${st.key}`} label={st.label} onLens={onLens} />
        </div>
      ))}
      {isPoints && open && stages !== null && !stages.length && (
        <p style={{ paddingLeft: (depth + 1) * 14 + 8 }} className="py-0.5 text-[13px] italic text-muted-foreground">
          no exported stages
        </p>
      )}
      {isPlaybook && open && (elements ?? []).map((el) => {
        const producer = producers.get(`${it.file}|${el.kind}:${el.key}`);
        return (
          <div key={`${el.kind}:${el.key}`} className="flex items-center">
            <button type="button"
              style={{ paddingLeft: (depth + 1) * 14 + 4 }}
              className={"flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1 text-left text-[13px] " +
                (selectedKey === `${path}:${el.kind}:${el.key}` ? "bg-accent text-accent-foreground" : "hover:bg-accent/50")}
              onClick={() => onSelectElement(`${path}:${el.kind}:${el.key}`,
                { file: it.file!, kind: el.kind, elKey: el.key, label: el.label, itemLabel: itemLabel(it) })}>
              <span className="w-3.5 shrink-0" />
              {el.kind === "decision"
                ? <SlidersHorizontal className="size-3.5 shrink-0 text-muted-foreground" />
                : <Zap className="size-3.5 shrink-0 text-muted-foreground" />}
              <span className="min-w-0 flex-1 truncate">{el.label}</span>
            </button>
            <LensButtons graph={graph} id={`${it.file}#${el.kind}:${el.key}`} label={el.label} onLens={onLens} />
            <HistoryButton graph={graph} id={`${it.file}#${el.kind}:${el.key}`} label={el.label} onHistory={onHistory} />
            {producer && (
              <button type="button" title={`Produced by: ${producer.streamTitle} — open the stream`}
                className="mr-1 shrink-0 rounded p-1 text-primary hover:bg-accent"
                onClick={() => onOpenProducer(producer)}>
                <Workflow className="size-3.5" />
              </button>
            )}
          </div>
        );
      })}
      {isPlaybook && open && elements !== null && !elements.length && (
        <p style={{ paddingLeft: (depth + 1) * 14 + 8 }} className="py-0.5 text-[13px] italic text-muted-foreground">
          no elements yet
        </p>
      )}
      {isList && open && (docItems ?? []).map(({ item, index }) => (
        <div key={index} className="flex items-center">
          <button type="button"
            style={{ paddingLeft: (depth + 1) * 14 + 4 }}
            className={"flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1 text-left text-[13px] " +
              (selectedKey === `${path}:doc:${index}` ? "bg-accent text-accent-foreground" : "hover:bg-accent/50")}
            onClick={() => onSelectDoc(`${path}:doc:${index}`,
              { listFile: it.file!, itemFile: item.file!, label: item.label ?? item.file!, itemLabel: itemLabel(it) })}>
            <span className="w-3.5 shrink-0" />
            <FileText className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{item.label ?? item.file}</span>
          </button>
          <LensButtons graph={graph} id={resolveRef(it.file!, item.file!)} label={item.label ?? item.file!} onLens={onLens} />
          <HistoryButton graph={graph} id={resolveRef(it.file!, item.file!)} label={item.label ?? item.file!} onHistory={onHistory} />
        </div>
      ))}
      {isList && open && docItems !== null && !docItems.length && (
        <p style={{ paddingLeft: (depth + 1) * 14 + 8 }} className="py-0.5 text-[13px] italic text-muted-foreground">
          no exported items
        </p>
      )}
      {isWorkup && open && (outputs ?? []).map((o) => (
        <div key={o.key} className="flex items-center">
          <button type="button" title={o.path}
            style={{ paddingLeft: (depth + 1) * 14 + 4 }}
            className={"flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1 text-left text-[13px] " +
              (selectedKey === `${path}:out:${o.key}` ? "bg-accent text-accent-foreground" : "hover:bg-accent/50")}
            onClick={() => onSelectDoc(`${path}:out:${o.key}`, { listFile: it.file!, itemFile: o.path, label: o.label, itemLabel: itemLabel(it) })}>
            <span className="w-3.5 shrink-0" />
            <FileText className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
          </button>
          <LensButtons graph={graph} id={o.path} label={o.label} onLens={onLens} />
          <HistoryButton graph={graph} id={o.path} label={o.label} onHistory={onHistory} />
        </div>
      ))}
      {isWorkup && open && outputs !== null && !outputs.length && (
        <p style={{ paddingLeft: (depth + 1) * 14 + 8 }} className="py-0.5 text-[13px] italic text-muted-foreground">
          nothing exported yet
        </p>
      )}
    </div>
  );
}

/** One exported document of a list node, in the right pane — the content
 *  itself, with the full-size dialog one click away. */
function DocPane({ sel }: { sel: DocSelection }) {
  const [full, setFull] = useState(false);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        <FileText className="size-4 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{sel.itemLabel} · {sel.label}</span>
        <span className="font-mono text-xs text-muted-foreground">{sel.itemFile}</span>
        <Button size="xs" variant="outline" title="Open properly, full size" onClick={() => setFull(true)}>
          Open
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-white">
        <FileContentBody base={sel.listFile} file={sel.itemFile} />
      </div>
      <FileContentDialog base={sel.listFile} file={full ? sel.itemFile : null} label={sel.label}
        open={full} onClose={() => setFull(false)} />
    </div>
  );
}

/** ONE policy element in the right pane: only that decision (with answers)
 *  or event, plus the configuration behind it. */
function ElementPane({ sel, producer, onOpenProducer }: {
  sel: ElementSelection;
  producer?: Producer;
  onOpenProducer: (p: Producer) => void;
}) {
  const [doc, setDoc] = useState<PlaybookDoc | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setDoc(null); setErr(null);
    readVirtualDirectoryFile(sel.file, sel.file).then(
      (r) => { if (live) setDoc(parsePlaybook(r.content)); },
      (e: unknown) => { if (live) setErr(e instanceof Error ? e.message : String(e)); },
    );
    return () => { live = false; };
  }, [sel.file]);
  if (err) return <div className="p-6 text-sm text-destructive">{err}</div>;
  if (doc === null) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        {sel.kind === "decision"
          ? <SlidersHorizontal className="size-4 text-muted-foreground" />
          : <Zap className="size-4 text-muted-foreground" />}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{sel.itemLabel} · {sel.label}</span>
        {producer && (
          <Button size="xs" variant="outline" title={`This node was produced by ${producer.streamTitle}`}
            onClick={() => onOpenProducer(producer)}>
            <Workflow /> {producer.streamTitle}
          </Button>
        )}
        <Button size="xs" variant="outline"
          onClick={() => window.open(`/policy/?path=${encodeURIComponent(sel.file)}`, "_blank")}>
          <ExternalLink /> Open in Playbook studio
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <ElementView doc={doc} kind={sel.kind} elKey={sel.elKey} base={sel.file} />
      </div>
    </div>
  );
}

/** One EXPORTED stage of a points stream, standing alone in the right pane. */
function StagePane({ sel }: { sel: StageSelection }) {
  const [content, setContent] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setContent(null); setErr(null);
    readVirtualDirectoryFile(sel.file, sel.file).then(
      (r) => { if (live) setContent(r.content); },
      (e: unknown) => { if (live) setErr(e instanceof Error ? e.message : String(e)); },
    );
    return () => { live = false; };
  }, [sel.file]);
  if (err) return <div className="p-6 text-sm text-destructive">{err}</div>;
  if (content === null) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        <Layers className="size-4 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {sel.itemLabel === sel.stageLabel ? sel.itemLabel : `${sel.itemLabel} · ${sel.stageLabel}`}
        </span>
        <Button size="xs" variant="outline"
          onClick={() => window.open(`/points/?path=${encodeURIComponent(sel.file)}`, "_blank")}>
          <ExternalLink /> Open in Points studio
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <PointsView content={content} height="100%" agentId={sel.file} path={sel.file} stage={sel.stageKey} />
      </div>
    </div>
  );
}

/* ── a node reference, opened: the raw folder, extensions and all ───────── */

function NodeBrowser({ root, label }: { root: string; label: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        <FolderSymlink className="size-4 text-primary" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
        <Button size="xs" variant="outline" onClick={() => window.open(`/nodes/?path=${encodeURIComponent(root)}`, "_blank")}>
          <ExternalLink /> Open in Nodes
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        <NodeFolder path={root} depth={0} />
      </div>
    </div>
  );
}

function NodeFolder({ path, depth }: { path: string; depth: number }) {
  const [entries, setEntries] = useState<{ path: string; name: string; kind: "folder" | "file" }[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const lister = configuredLister();
    if (!lister) { setErr("this host has no folder lister configured"); return; }
    let live = true;
    lister(path).then(
      (es) => { if (live) setEntries(es); },
      (e: unknown) => { if (live) setErr(e instanceof Error ? e.message : String(e)); },
    );
    return () => { live = false; };
  }, [path]);
  if (err) return <p className="px-2 py-1 text-xs text-destructive">{err}</p>;
  if (entries === null) return <p className="px-2 py-1 text-xs text-muted-foreground">Loading…</p>;
  return (
    <>
      {entries.map((e) => <NodeEntry key={e.path} entry={e} depth={depth} />)}
      {!entries.length && <p className="px-2 py-1 text-xs text-muted-foreground">Empty folder.</p>}
    </>
  );
}

function NodeEntry({ entry, depth }: { entry: { path: string; name: string; kind: "folder" | "file" }; depth: number }) {
  const [open, setOpen] = useState(false);
  const isFolder = entry.kind === "folder";
  return (
    <div>
      <button type="button" style={{ paddingLeft: depth * 14 + 4 }}
        className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-sm hover:bg-accent/50"
        onClick={() => { if (isFolder) setOpen((o) => !o); }}>
        {isFolder
          ? (open ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                  : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />)
          : <span className="w-3.5 shrink-0" />}
        {isFolder
          ? <Folder className="size-4 shrink-0 fill-info/15 text-info" />
          : <FileIcon className="size-4 shrink-0 text-muted-foreground" />}
        {/* The RAW name — extensions belong in here, unlike the project tree. */}
        <span className="min-w-0 flex-1 truncate">{entry.name}</span>
      </button>
      {isFolder && open && <NodeFolder path={entry.path} depth={depth + 1} />}
    </div>
  );
}

/* ── a file item, opened: the shared preview + its studio ───────────────── */

function FilePane({ path, label, onJumpElement, onMoved, root, refresh, onDeleted }: {
  path: string;
  label: string;
  /** Playbook items: jump one element to its child-node view. */
  onJumpElement?: (el: PolicyChild) => void;
  /** Directory mode: a frame moved into a flow — the flow is where to look next. */
  onMoved?: (flowPath: string) => void;
  /** Directory mode: the folder the project stands on — how far up "Move into flow…" looks for flows. */
  root?: string;
  /** Bumped by the host when the file may have changed underneath (a studio dialog closed). */
  refresh?: number;
  /** Directory mode: the file was deleted here. */
  onDeleted?: () => void;
}) {
  const structured = isStructuredName(path);
  const [content, setContent] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const writer = configuredWriter();
  const remover = configuredRemover();
  const autosave = useAutosave(
    useMemo(() => (writer ? (c: string) => writer(path, c) : async () => {}), [writer, path]),
  );
  useEffect(() => {
    if (structured) return; // a *.node folder has no content to read — the view self-drives
    let live = true;
    setContent(null); setErr(null);
    readVirtualDirectoryFile(path, path).then(
      (r) => { if (live) setContent(r.content); },
      (e: unknown) => { if (live) setErr(e instanceof Error ? e.message : String(e)); },
    );
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, structured, refresh]);

  // A structured node opens as its split view — faces, board and all.
  if (structured) return <SplitNodeView path={path} />;

  if (err) return <div className="p-6 text-sm text-destructive">{err}</div>;
  if (content === null) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  const kind = previewForPath(path);
  const studioUrl = studioUrlFor(path);
  const remove = async () => {
    if (!remover) return;
    if (!window.confirm(`Delete “${label}”? This cannot be undone.`)) return;
    await remover(path);
    onDeleted?.();
  };
  const trailing = (
    <span className="flex items-center gap-1.5">
      {onMoved && /\.frame$/i.test(path) && <MoveIntoFlowButton framePath={path} root={root} onMoved={onMoved} />}
      {studioUrl ? (
        <Button size="xs" variant="outline" onClick={() => openInStudio({ url: studioUrl, title: `${label} · ${studioNameFor(path) ?? "studio"}` })}>
          <ExternalLink /> Open in Studio
        </Button>
      ) : null}
      {remover && onDeleted && (
        <Button size="xs" variant="outline" className="text-destructive" title="Delete this file" onClick={() => void remove()}>
          <Trash2 /> Delete…
        </Button>
      )}
      {!studioUrl && !(remover && onDeleted) && <span className="w-4" />}
    </span>
  );

  if (!kind) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center gap-2 border-b px-3 py-1.5">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
        </div>
        <pre className="min-h-0 flex-1 overflow-auto p-3 font-mono text-xs">{content}</pre>
      </div>
    );
  }

  // No strip — the jump icons live ON the content itself: the walk decorates
  // every decision label and event row with a crosshair calling this.
  return (
    <DocumentPreview path={path} content={content}
      onChange={writer ? (next) => { setContent(next); autosave.onEdit(next); } : undefined}
      onElementJump={onJumpElement
        ? (el) => onJumpElement({ kind: el.kind, key: el.key, label: el.label })
        : undefined}
      trailing={trailing} />
  );
}

/* ── directory mode: the project IS a folder ────────────────────────────── */

// A new file starts from its kind's template — shared with the project Ask (lib/fileTemplates).
function DirTree({ path, depth, selected, onPick, refresh, targetFolder, onPickFolder }: {
  path: string; depth: number; selected: string | null; onPick: (p: string) => void; refresh: number;
  /** The folder the Ask panel aims at — clicking a folder aims there as well as opening it. */
  targetFolder?: string | null; onPickFolder?: (p: string) => void;
}) {
  const [entries, setEntries] = useState<{ path: string; name: string; kind: "folder" | "file" }[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  // Folders on the way to the selected file open by themselves (a reload, a
  // file the Ask just made); closing one by hand keeps it closed.
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  useEffect(() => { setClosed(new Set()); }, [selected]);
  const holdsSelected = (folder: string) => !!selected && selected.startsWith(`${folder}/`);
  useEffect(() => {
    const lister = configuredLister();
    if (!lister) { setErr("this host has no folder lister configured"); return; }
    let live = true;
    lister(path).then(
      (es) => { if (live) { setEntries(es); setErr(null); } },
      (e: unknown) => { if (live) setErr(e instanceof Error ? e.message : String(e)); },
    );
    return () => { live = false; };
  }, [path, refresh]);
  if (err) return <p className="px-2 py-1 text-xs text-muted-foreground">{depth === 0 ? "The folder does not exist yet — add a file to create it." : err}</p>;
  if (entries === null) return <p className="px-2 py-1 text-xs text-muted-foreground">Loading…</p>;
  if (!entries.length && depth === 0) return <p className="px-2 py-1 text-xs text-muted-foreground">Empty folder — add a file.</p>;
  return (
    <>
      {entries.map((e) => {
        const structured = isStructuredName(e.path);
        const isFolder = e.kind === "folder" && !structured;
        const isOpen = open.has(e.path) || (holdsSelected(e.path) && !closed.has(e.path));
        const Icon = iconForFsPath(e.path, e.kind);
        return (
          <div key={e.path}>
            <button type="button" style={{ paddingLeft: depth * 12 + 4 }}
              className={`flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-[12.5px] hover:bg-accent/50 ${selected === e.path ? "bg-accent font-medium" : ""} ${targetFolder === e.path ? "ring-1 ring-primary/50" : ""}`}
              onClick={() => {
                if (isFolder) {
                  if (isOpen) { setOpen((o) => { const n = new Set(o); n.delete(e.path); return n; }); setClosed((c) => new Set(c).add(e.path)); }
                  else { setOpen((o) => new Set(o).add(e.path)); setClosed((c) => { const n = new Set(c); n.delete(e.path); return n; }); }
                  onPickFolder?.(e.path);
                }
                else onPick(e.path);
              }}>
              {isFolder
                ? (isOpen ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />)
                : <span className="w-3.5 shrink-0" />}
              <Icon className={`size-3.5 shrink-0 ${isFolder ? "fill-info/15 text-info" : "text-primary"}`} />
              <span className="min-w-0 flex-1 truncate">{e.name}</span>
            </button>
            {isFolder && isOpen && <DirTree path={e.path} depth={depth + 1} selected={selected} onPick={onPick} refresh={refresh} targetFolder={targetFolder} onPickFolder={onPickFolder} />}
          </div>
        );
      })}
    </>
  );
}

/* ── memory mode: the project as working memory ─────────────────────────── */

function MemoryModePane({ doc, memPath }: { doc: ProjectDoc; memPath: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const writer = configuredWriter();
  useEffect(() => {
    let live = true;
    setContent(null); setMissing(false); setErr(null);
    readVirtualDirectoryFile(memPath, memPath).then(
      (r) => { if (live) setContent(r.content); },
      () => { if (live) setMissing(true); },
    );
    return () => { live = false; };
  }, [memPath]);
  const create = () => {
    if (!writer) return;
    const root = projectRoot(doc);
    const text = newProjectMemory({ title: doc.name, root, paths: root ? undefined : lensPaths(doc) });
    writer(memPath, text).then(() => { setContent(text); setMissing(false); }, (e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
  };
  if (err) return <div className="p-6 text-sm text-destructive">{err}</div>;
  if (missing) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-sm text-muted-foreground">
        <p>The lens <code>{memPath}</code> does not exist yet.</p>
        {writer ? <Button size="sm" onClick={create}><Brain /> Create it</Button> : <p>This host cannot write.</p>}
      </div>
    );
  }
  if (content === null) return <div className="p-6 text-sm text-muted-foreground">Reading the lens…</div>;
  return (
    <MemoryView content={content} height="100%" agentId={memPath} path={memPath} authoring={!!writer}
      onChange={writer ? (next) => { setContent(next); void writer(memPath, next); } : undefined} />
  );
}

/** The paths an items-based project's lens admits: every file item and
 *  every node reference (the regex also takes what sits under a folder). */
function lensPaths(doc: ProjectDoc): string[] {
  const out: string[] = fileItemsOf(doc).map((f) => f.file);
  const walk = (items: ProjectItem[]) => { for (const it of items) { if (it.node) out.push(it.node); if (it.items) walk(it.items); } };
  walk(doc.items);
  return out;
}

/* ── the view ───────────────────────────────────────────────────────────── */

const ProjectDagLazy = lazyReact(() => import("./ProjectDagView"));
const ProjectLensLazy = lazyReact(() => import("./ProjectLensView"));
const DagCanvasLazy = lazyReact(() => import("./ProjectDagView").then((m) => ({ default: m.DagCanvas })));

export interface RowLens { id: string; dir: "up" | "down"; label: string; graph?: LanedGraph; raw?: boolean }

/** The per-row lens buttons: ⭩ who produced this, ⭧ what it produces —
 *  shown only for directions where the production graph actually connects
 *  the node (or its children). */
function LensButtons({ graph, id, label, onLens }: {
  graph: LanedGraph | null;
  id: string;
  label: string;
  onLens: (l: RowLens) => void;
}) {
  if (!graph) return null;
  const conn = nodeConnections(graph, id);
  if (!conn.up && !conn.down) return null;
  const btn = (dir: "up" | "down", Icon: typeof ArrowDownLeft, title: string) => (
    <button type="button" title={title}
      className="shrink-0 rounded p-0.5 text-muted-foreground/60 hover:bg-accent hover:text-primary"
      onClick={(e) => { e.stopPropagation(); onLens({ id, dir, label }); }}>
      <Icon className="size-3" />
    </button>
  );
  return (
    <span className="mr-1 flex shrink-0 items-center">
      {conn.up && btn("up", ArrowDownLeft, `Who produced “${label}” — the full chain`)}
      {conn.down && btn("down", ArrowUpRight, `What “${label}” produces — the full chain`)}
    </span>
  );
}

/** The per-row history button: the node's recorded versions — its own and,
 *  for nodes with children, its file children's. Rows without a real file
 *  path (stages, elements) have no history of their own. */
function HistoryButton({ id, label, graph, onHistory }: {
  id: string;
  label: string;
  graph: LanedGraph | null;
  onHistory: (r: HistoryRequest) => void;
}) {
  // An ELEMENT row's history is its backing FILE's — the states just open
  // the element at each version. Stage rows have no element view; skip them.
  const hash = id.indexOf("#");
  const element = hash >= 0 ? id.slice(hash + 1) : undefined;
  if (element && !element.startsWith("decision:") && !element.startsWith("event:")) return null;
  const file = hash >= 0 ? id.slice(0, hash) : id;
  const open = () => {
    const targets: HistoryTarget[] = [{ label, path: file }];
    if (graph && !element) {
      for (const n of graph.nodes) {
        if (n.parent === id && !n.id.includes("#")) targets.push({ label: n.label, path: n.id });
      }
    }
    onHistory({ title: label, targets, ...(element ? { element } : {}) });
  };
  return (
    <button type="button" title={`History of “${label}” — recorded versions, only what changed`}
      className="shrink-0 rounded p-0.5 text-muted-foreground/60 hover:bg-accent hover:text-primary"
      onClick={(e) => { e.stopPropagation(); open(); }}>
      <History className="size-3" />
    </button>
  );
}

export default function ProjectView({ content, height = "100%", agentId, path, urlSync, onChange }: ViewerProps) {
  const doc = useMemo(() => parseProject(content), [content]);
  const base = path ?? agentId ?? "/";
  const [dagOpen, setDagOpen] = useState(false);
  const [lensOpen, setLensOpen] = useState(false);

  // THE MODE: memory when flipped there; directory when flipped there or
  // when the project stands on a root and says nothing else; the item tree
  // otherwise. Flipping writes the top-level scalars by line surgery through
  // the host (`onChange`), so it needs a host that saves.
  const mode: "items" | "directory" | "memory" = doc.mode === "memory" ? "memory" : doc.mode === "directory" || (!doc.mode && !!doc.root) ? "directory" : "items";
  const canFlip = !!onChange;
  const flipToMemory = async () => {
    if (!onChange) return;
    const writer = configuredWriter();
    const memPath = projectMemoryPath(doc);
    const root = projectRoot(doc);
    try {
      await readVirtualDirectoryFile(memPath, memPath);
    } catch {
      if (writer) await writer(memPath, newProjectMemory({ title: doc.name, root, paths: root ? undefined : lensPaths(doc) }));
    }
    onChange(writeProjectTop(content, { mode: "memory", memory: memPath, ...(!doc.root && root ? { root } : {}) }));
  };
  const flipToDirectory = () => {
    if (!onChange) return;
    let root = doc.root ?? projectRoot(doc);
    if (!root) {
      const answer = window.prompt("The folder this project stands on", `/${doc.name}`);
      if (!answer?.trim()) return;
      root = answer.trim().startsWith("/") ? answer.trim() : `/${answer.trim()}`;
    }
    onChange(writeProjectTop(content, { mode: "directory", root }));
  };
  const flipToItems = () => { if (onChange) onChange(writeProjectTop(content, { mode: undefined })); };
  const modeButton = (label: string, Icon: typeof Brain, active: boolean, onClick: () => void, title: string) => (
    <button type="button" title={title} disabled={!canFlip && !active}
      className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-semibold ${active ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"}`}
      onClick={onClick}>
      <Icon className="size-3" /> {label}
    </button>
  );
  const modeSwitch = (
    <span className="flex items-center gap-1" title={canFlip ? undefined : "Open this project in the Projects app to flip its mode"}>
      {(doc.root || mode !== "items") && modeButton("Directory", FolderTree, mode === "directory", flipToDirectory, "The project as its folder — add files of any kind")}
      {!doc.root && mode === "items" && modeButton("Directory", FolderTree, false, flipToDirectory, "Stand this project on a folder")}
      {modeButton("Memory", Brain, mode === "memory", flipToMemory, "The same material as working memory — everything in Everything else until you author foci")}
      {mode !== "items" && doc.items.length > 0 && modeButton("Items", Package, false, flipToItems, "Back to the item tree")}
    </span>
  );

  // Directory mode: the folder's own tree on the left, the picked file on the right.
  const [dirSel, setDirSel] = useState<string | null>(null);
  const [dirRefresh, setDirRefresh] = useState(0);
  // The picked file LIVES in the URL when the host says so (`urlSync`), as
  // `?file=` — a reload opens the same file, Back walks to the previous one.
  useEffect(() => {
    if (!urlSync) return;
    const apply = () => setDirSel(new URLSearchParams(window.location.search).get("file"));
    apply();
    window.addEventListener("popstate", apply);
    return () => window.removeEventListener("popstate", apply);
  }, [urlSync]);
  const pickFile = (abs: string | null) => {
    setDirSel(abs);
    setAskFile(abs);
    if (!urlSync) return;
    const u = new URL(window.location.href);
    if ((u.searchParams.get("file") ?? null) === abs) return;
    if (abs) u.searchParams.set("file", abs); else u.searchParams.delete("file");
    window.history.pushState({}, "", u);
  };
  // The Ask panel aims at whatever was clicked LAST: a folder (the root until
  // one is clicked) or a file — a file target means "this" and "it" are that
  // file, and its folder is where new things land.
  const [dirFolder, setDirFolder] = useState<string | null>(null);
  const [askFile, setAskFile] = useState<string | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [askFocus, setAskFocus] = useState(0);
  const askApi = configuredAsk();
  const remover = configuredRemover();
  const deleteFolder = async () => {
    if (!remover || !dirFolder) return;
    const name = dirFolder.slice(dirFolder.lastIndexOf("/") + 1);
    if (!window.confirm(`Delete the folder “${name}” and everything in it? This cannot be undone.`)) return;
    try { await remover(dirFolder); } catch (e) { window.alert(e instanceof Error ? e.message : String(e)); return; }
    setDirFolder(null);
    if (dirSel?.startsWith(`${dirFolder}/`)) pickFile(null);
    setDirRefresh((n) => n + 1);
  };
  useEffect(() => {
    if (!askApi) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setAskOpen(true); setAskFocus((k) => k + 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [askApi]);
  const newFile = async () => {
    const writer = configuredWriter();
    const root = doc.root ?? projectRoot(doc);
    if (!writer || !root) return;
    const name = window.prompt("New file (name with extension; a slash makes a subfolder)", "notes.md");
    if (!name?.trim()) return;
    const rel = name.trim().replace(/^\/+/, "");
    const abs = `${root.replace(/\/+$/, "")}/${rel}`;
    try {
      await readVirtualDirectoryFile(abs, abs);
      window.alert("That file already exists.");
      pickFile(abs);
      return;
    } catch { /* free */ }
    await writer(abs, templateFor(abs));
    setDirRefresh((n) => n + 1);
    pickFile(abs);
  };
  // The production graph backs the tree rows' lens buttons; the parsed
  // docs stay alongside it so version pins can be resolved on demand.
  const [graph, setGraph] = useState<LanedGraph | null>(null);
  const [graphDocs, setGraphDocs] = useState<import("../../lib/projectGraph").GraphDocs | null>(null);
  const [rowLens, setRowLens] = useState<RowLens | null>(null);
  const [historyReq, setHistoryReq] = useState<HistoryRequest | null>(null);
  // A tree row's "where did this come from" prefers the node's BIRTH: when
  // its file keeps versions and one of them was PRODUCED, the lens opens the
  // DAG for that version — not every later producer flattened together.
  const openRowLens = (l: RowLens) => {
    if (l.graph || !graph || !graphDocs) { setRowLens(l); return; }
    // The lens is the OTHER SIDE's pipeline whenever that side is streams;
    // the one-hop localized view is the fallback.
    const fallThrough = () => {
      const unrolled = rowStreamsUnrolled(graph, graphDocs, l.id, l.dir);
      setRowLens(unrolled ? { ...l, graph: unrolled, raw: true } : l);
    };
    const lister = configuredLister();
    if (l.dir !== "up" || !lister) { fallThrough(); return; }
    const file = l.id.includes("#") ? l.id.slice(0, l.id.indexOf("#")) : l.id;
    void lister(versionsFolderOf(file)).then(
      (vs) => {
        const origin = originVersionGraph(graph, doc, graphDocs, vs.filter((v) => v.kind === "file"), l.label);
        if (!origin) { fallThrough(); return; }
        const unrolled = versionStreamsUnrolled(graphDocs, origin.graph, origin.path, "up");
        setRowLens({ id: origin.path, dir: "up", label: origin.label, graph: unrolled ?? origin.graph, raw: !!unrolled });
      },
      fallThrough,
    );
  };
  useEffect(() => {
    let live = true;
    void import("../../lib/projectGraphLoad").then(({ loadGraphDocs }) =>
      loadGraphDocs(doc).then((docs) => {
        if (!live) return;
        setGraph(assembleLanedGraph(doc, docs));
        setGraphDocs(docs);
      }));
    return () => { live = false; };
  }, [doc]);
  const [selected, setSelected] = useState<
    | { key: string; it: ProjectItem }
    | { key: string; stageSel: StageSelection }
    | { key: string; elementSel: ElementSelection }
    | { key: string; docSel: DocSelection }
    | null
  >(null);
  // The selection LIVES in the URL when the host says so (`urlSync`): every
  // pick pushes `?item=`, so items are history entries — reload restores the
  // page, Back walks to the previous one. Only ITEM rows restore — sub-rows
  // (a stage, a list row) load async, so their keys fall back to the item
  // they live on.
  useEffect(() => {
    if (!urlSync) return;
    const apply = () => {
      const raw = new URLSearchParams(window.location.search).get("item");
      if (!raw) { setSelected(null); return; }
      const key = raw.split(":")[0];
      let list: ProjectItem[] | undefined = doc.items;
      let it: ProjectItem | undefined;
      for (const seg of key.split(".")) {
        it = list?.[Number(seg)];
        list = it?.items;
      }
      setSelected(it ? { key, it } : null);
    };
    apply();
    window.addEventListener("popstate", apply);
    return () => window.removeEventListener("popstate", apply);
  }, [doc, urlSync]);
  // The nodes pane: collapsible everywhere, and closed by default on a
  // phone, where it opens as a drawer and closes again on a pick.
  const isMobile = useIsMobile();
  const [navOpen, setNavOpen] = useState(!isMobile);
  useEffect(() => { setNavOpen(!isMobile); }, [isMobile]);
  const choose = (s: NonNullable<typeof selected>) => {
    setSelected(s);
    if (urlSync) {
      const u = new URL(window.location.href);
      if (u.searchParams.get("item") !== s.key) {
        u.searchParams.set("item", s.key);
        window.history.pushState({}, "", u);
      }
    }
    if (isMobile) setNavOpen(false);
  };
  // Reverse index over the project's streams: which point produced which
  // policy node. Built once per project load.
  const [producers, setProducers] = useState<Map<string, Producer>>(new Map());
  const [openProducer, setOpenProducer] = useState<Producer | null>(null);
  useEffect(() => {
    let live = true;
    buildProducerIndex(doc.items).then((m) => { if (live) setProducers(m); });
    return () => { live = false; };
  }, [doc]);

  if (mode === "memory") {
    return (
      <Box sx={{ height, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div className="flex shrink-0 items-center gap-2 border-b bg-sidebar px-3 py-1.5">
          <Brain className="size-4 text-primary" />
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">{doc.name}</p>
          {modeSwitch}
          <button type="button" title="Open the lens in Nodes"
            className="rounded border border-input px-1.5 py-0.5 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => window.open(`/nodes/?path=${encodeURIComponent(projectMemoryPath(doc))}`, "_blank")}>
            Nodes
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <MemoryModePane doc={doc} memPath={projectMemoryPath(doc)} />
        </div>
      </Box>
    );
  }

  if (mode === "directory") {
    const root = (doc.root ?? projectRoot(doc) ?? "/").replace(/\/+$/, "") || "/";
    return (
      <Box sx={{ height, minHeight: 0, display: "flex", position: "relative" }}>
        <aside className="flex w-64 shrink-0 flex-col border-r bg-sidebar">
          <div className="flex items-center gap-1.5 border-b px-2 py-1.5">
            <FolderTree className="size-4 shrink-0 text-primary" />
            <p className="min-w-0 flex-1 truncate text-sm font-semibold" title={root}>{doc.name}</p>
            {modeSwitch}
          </div>
          <div className="flex items-center gap-1 border-b px-2 py-1">
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground" title={root}>{root}</span>
            {askApi && (
              <button type="button" title="Ask — create files from one line of instruction (Ctrl+K); click a folder to aim there"
                className={`rounded p-1 hover:bg-accent hover:text-foreground ${askOpen ? "text-primary" : "text-muted-foreground"}`}
                onClick={() => { setAskOpen((o) => !o); setAskFocus((k) => k + 1); }}>
                <MessageSquare className="size-3.5" />
              </button>
            )}
            <button type="button" title="New file in this folder" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => void newFile()}>
              <FilePlus className="size-3.5" />
            </button>
            <button type="button" title="Refresh" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => setDirRefresh((n) => n + 1)}>
              <RefreshCw className="size-3.5" />
            </button>
            {remover && dirFolder && !askFile && (
              <button type="button" title={`Delete the folder ${dirFolder.slice(dirFolder.lastIndexOf("/") + 1)} and everything in it…`}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                onClick={() => void deleteFolder()}>
                <Trash2 className="size-3.5" />
              </button>
            )}
            <button type="button" title="Open in Nodes" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => window.open(`/nodes/?path=${encodeURIComponent(root)}`, "_blank")}>
              <ExternalLink className="size-3.5" />
            </button>
          </div>
          {/* The folder, and nothing else — a directory project has no groups;
              its items, if any, wait for the item-tree mode. */}
          <div className="min-h-0 flex-1 overflow-y-auto p-1">
            <DirTree path={root} depth={0} selected={dirSel} onPick={pickFile} refresh={dirRefresh}
              targetFolder={askFile ? null : dirFolder} onPickFolder={(p) => { setAskFile(null); setDirFolder((cur) => (cur === p ? null : p)); }} />
          </div>
        </aside>
        <section className="flex min-w-0 flex-1 flex-col">
          {!dirSel ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <p>Pick a file, or add one.</p>
              <Button size="sm" variant="outline" onClick={() => void newFile()}><FilePlus /> New file</Button>
            </div>
          ) : isStructuredName(dirSel) || !dirSel.slice(dirSel.lastIndexOf("/") + 1).includes(".") ? (
            <NodeBrowser root={dirSel} label={dirSel.slice(dirSel.lastIndexOf("/") + 1)} />
          ) : (
            <FilePane key={dirSel} path={dirSel} label={dirSel.slice(dirSel.lastIndexOf("/") + 1)} root={root} refresh={dirRefresh}
              onMoved={(flow) => { setDirRefresh((n) => n + 1); pickFile(flow); }}
              onDeleted={() => { setDirRefresh((n) => n + 1); pickFile(null); }} />
          )}
        </section>
        {/* A studio opened from here runs in a dialog; when it closes, the pane and the tree re-read. */}
        <StudioDialog onClose={() => setDirRefresh((n) => n + 1)} />
        {askApi && askOpen && (
          <div className="flex w-[340px] shrink-0 flex-col border-l bg-card">
            <ProjectAsk api={askApi} root={root} folder={askFile ? askFile.slice(0, askFile.lastIndexOf("/")) : dirFolder ?? root} file={askFile} focusKey={askFocus}
              onClear={dirFolder ? () => setDirFolder(null) : undefined}
              onClearFile={askFile ? () => setAskFile(null) : undefined}
              onDone={(created) => { setDirRefresh((n) => n + 1); if (created[0]) pickFile(created[0]); }}
              onClose={() => setAskOpen(false)} />
          </div>
        )}
      </Box>
    );
  }

  return (
    <Box sx={{ height, minHeight: 0, display: "flex", position: "relative" }}>
      {/* The nodes pane collapses to a rail; on a phone it is a drawer OVER
          the content, so the selected item always gets the full width. */}
      {!navOpen && (
        <div className="flex w-8 shrink-0 flex-col items-center gap-1 border-r bg-sidebar py-1.5">
          <button type="button" title="Show the project nodes" aria-label="Show the project nodes"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => setNavOpen(true)}>
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        </div>
      )}
      {navOpen && isMobile && (
        <div className="absolute inset-0 z-20 bg-black/30" onClick={() => setNavOpen(false)} />
      )}
      <aside className={navOpen
        ? isMobile
          ? "absolute inset-y-0 left-0 z-30 flex w-64 max-w-[85%] flex-col border-r bg-sidebar shadow-xl"
          : "flex w-64 shrink-0 flex-col border-r bg-sidebar"
        : "hidden"}>
        <div className="flex items-center gap-1.5 border-b px-2 py-1.5">
          <button type="button" title="Hide the project nodes" aria-label="Hide the project nodes"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => setNavOpen(false)}>
            <PanelLeftClose className="h-4 w-4" />
          </button>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">{doc.name}</p>
          {modeSwitch}
          <button type="button" title="The project as a DAG — hierarchy plus how things were produced"
            className="rounded border border-input px-1.5 py-0.5 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => setDagOpen(true)}>
            DAG
          </button>
          <button type="button" title="The lens — one item's children with their provenance, each traceable to its localized DAG"
            className="rounded border border-input px-1.5 py-0.5 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => setLensOpen(true)}>
            Lens
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          {doc.items.map((it, i) => (
            <ItemRow key={i} it={it} depth={0} selectedKey={selected?.key ?? null}
              onSelect={(key, item) => choose({ key, it: item })}
              onSelectStage={(key, sel) => choose({ key, stageSel: sel })}
              onSelectElement={(key, sel) => choose({ key, elementSel: sel })}
              onSelectDoc={(key, sel) => choose({ key, docSel: sel })}
              onOpenProducer={setOpenProducer} producers={producers} path={String(i)}
              graph={graph} onLens={openRowLens} onHistory={setHistoryReq} />
          ))}
          {!doc.items.length && (
            <p className="px-2 py-2 text-xs text-muted-foreground">Nothing in this project yet.</p>
          )}
        </div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        {(() => {
          // The project's dependency edges, surfaced on the selected item —
          // the same `links:` a DAG rendering of the project will draw.
          const file = !selected ? null
            : "docSel" in selected ? null
            : "elementSel" in selected ? selected.elementSel.file
            : "stageSel" in selected ? selected.stageSel.file
            : selected.it.file ?? null;
          if (!file) return null;
          const { outgoing, incoming } = linksTouching(doc, file);
          if (!outgoing.length && !incoming.length) return null;
          const names = new Map(fileItemsOf(doc).map((f) => [f.file, f.label]));
          const name = (l: ProjectLink, end: "from" | "to") =>
            (names.get(l[end].file) ?? l[end].file.slice(l[end].file.lastIndexOf("/") + 1)) +
            (l[end].stage ? ` · ${l[end].stage}` : "") +
            (l[end].element ? ` · ${l[end].element}` : "");
          return (
            <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/30 px-3 py-1">
              {incoming.map((l, i) => (
                <span key={`i${i}`} title={l.label ?? l.from.file}
                  className="rounded-full border border-primary/40 bg-primary/5 px-2 py-0.5 text-xs font-semibold text-primary">
                  {l.kind ?? "feeds"} ⟵ {name(l, "from")}
                </span>
              ))}
              {outgoing.map((l, i) => (
                <span key={`o${i}`} title={l.label ?? l.to.file}
                  className="rounded-full border border-primary/40 bg-primary/5 px-2 py-0.5 text-xs font-semibold text-primary">
                  {l.kind ?? "feeds"} ⟶ {name(l, "to")}
                </span>
              ))}
            </div>
          );
        })()}
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Select an item from the project
          </div>
        ) : "docSel" in selected ? (
          <DocPane key={selected.key} sel={selected.docSel} />
        ) : "elementSel" in selected ? (
          <ElementPane key={selected.key} sel={selected.elementSel}
            producer={producers.get(`${selected.elementSel.file}|${selected.elementSel.kind}:${selected.elementSel.elKey}`)}
            onOpenProducer={setOpenProducer} />
        ) : "stageSel" in selected ? (
          <StagePane key={selected.key} sel={selected.stageSel} />
        ) : selected.it.node ? (
          <NodeBrowser root={selected.it.node} label={itemLabel(selected.it)} />
        ) : (
          <FilePane key={selected.it.file} path={selected.it.file!} label={itemLabel(selected.it)}
            onJumpElement={(el) => {
              const item = selected.it;
              setSelected({
                key: `${selected.key}:${el.kind}:${el.key}`,
                elementSel: { file: item.file!, kind: el.kind, elKey: el.key, label: el.label, itemLabel: itemLabel(item) },
              });
            }} />
        )}
      </section>
      <ProducerDialog producer={openProducer} onClose={() => setOpenProducer(null)} />
      <NodeHistoryDialog req={historyReq} onClose={() => setHistoryReq(null)}
        pinContext={graph && graphDocs ? { graph, doc, docs: graphDocs } : undefined}
        onLens={(l: VersionLens) => setRowLens(l)} />
      <Dialog open={!!rowLens} onOpenChange={(o) => { if (!o) setRowLens(null); }}>
        <DialogContent className="flex h-[84dvh] flex-col gap-0 p-0 sm:max-w-[88vw]" showCloseButton>
          <DialogTitle className="border-b px-4 py-2.5 text-sm font-semibold">
            {rowLens?.dir === "up" ? `Where “${rowLens?.label}” came from` : `What “${rowLens?.label}” produces`}
          </DialogTitle>
          <DialogDescription className="sr-only">The full production chain of one node</DialogDescription>
          <div className="min-h-0 flex-1 overflow-hidden">
            {rowLens && graph && (
              <Suspense fallback={<p className="p-4 text-xs text-muted-foreground">Loading…</p>}>
                <DagCanvasLazy base={base}
                  graph={rowLens.raw && rowLens.graph ? rowLens.graph : localizeGraph(rowLens.graph ?? graph, rowLens.id, rowLens.dir)} />
              </Suspense>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={lensOpen} onOpenChange={setLensOpen}>
        <DialogContent className="flex h-[84dvh] flex-col gap-0 p-0 sm:max-w-4xl" showCloseButton>
          <DialogTitle className="border-b px-4 py-2.5 text-sm font-semibold">{doc.name} — the lens</DialogTitle>
          <DialogDescription className="sr-only">One item's children with their provenance</DialogDescription>
          <div className="min-h-0 flex-1 overflow-hidden">
            {lensOpen && (
              <Suspense fallback={<p className="p-4 text-xs text-muted-foreground">Loading…</p>}>
                <ProjectLensLazy doc={doc} base={base} />
              </Suspense>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={dagOpen} onOpenChange={setDagOpen}>
        <DialogContent className="flex h-[84dvh] flex-col gap-0 p-0 sm:max-w-[88vw]" showCloseButton>
          <DialogTitle className="border-b px-4 py-2.5 text-sm font-semibold">{doc.name} — the DAG</DialogTitle>
          <DialogDescription className="sr-only">Hierarchy by containment, production by arrows</DialogDescription>
          <div className="min-h-0 flex-1 overflow-hidden">
            {dagOpen && (
              <Suspense fallback={<p className="p-4 text-xs text-muted-foreground">Loading…</p>}>
                <ProjectDagLazy doc={doc} base={base} />
              </Suspense>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
