/**
 * What the legacy flow surface expected from its app, provided by THIS package's host adapter.
 *
 * The components under this folder are the legacy orchestration app's `components/flow/*`,
 * ported as they were: the same engine (`../../lib/flowOps` — the worker's `flow_ops.ts`), the
 * same browser half (`../../lib/flowEngine`), the same MUI surface. The only things they took from
 * the old app were a handful of API calls, two constants and a hook, all of which live here:
 *
 *   • a directory agent is now a FOLDER of the shared store: `agentId` is the flow's folder path
 *     and every relative path a panel or a source names resolves under it;
 *   • a screenshot's "Storage key" is a path relative to that folder (the import wrote them into
 *     `<stem>-assets/`), served by the host's raw-bytes endpoint;
 *   • an upload writes bytes through the host's binary writer into `<stem>-assets/`;
 *   • the legacy app was dark; the surface keeps its palette so it reads exactly as it did.
 */
import { useCallback, useEffect, useState } from "react";
import { createTheme } from "@mui/material/styles";
import { configuredBinaryWriter, rawFileUrlFor, readVirtualDirectoryFile as readStoreFile } from "../../api";

/* ── previewCoerce ────────────────────────────────────────────────────────── */

export type DiffOp = "add" | "edit" | "delete";
export const DIFF_OP_COLOR: Record<DiffOp, string> = {
  add: "#22c55e", edit: "#f59e0b", delete: "#ef4444",
};

/* ── theme.ts — the legacy app's theme, in LIGHT mode ─────────────────────── */

/** The legacy theme's shape (Inter, 13px, 8px radius, flat paper) on a light palette; the
 *  component-level colours that assumed a dark background live in flowPalette.ts. */
export const legacyTheme = createTheme({
  palette: {
    mode: "light",
    background: {
      default: "#f8fafc",
      paper: "#ffffff",
    },
    primary: { main: "#4f5fd8" },
    secondary: { main: "#7c3aed" },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", sans-serif',
    fontSize: 13,
    // MUI scales the variants off the base: caption would land at 11.1px and overline at 9.3px.
    // The audited floor is 12px, so the two small variants are pinned there.
    caption: { fontSize: 12 },
    overline: { fontSize: 12 },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none" },
      },
    },
  },
});

/* ── useFilePreviewMode ───────────────────────────────────────────────────── */

/**
 * Global, persisted "Raw vs Preview" choice for file panes. The user's last toggle on ANY file
 * becomes the default for every other file they open: pick Preview once and newly-opened files
 * render their preview first, not raw.
 */
const STORAGE_KEY = "hermes.file.previewMode";

const load = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) === "preview";
  } catch {
    return false;
  }
};

let current = load();
const subscribers = new Set<(v: boolean) => void>();

function setGlobal(next: boolean) {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next ? "preview" : "raw");
  } catch {
    // storage full / disabled — keep in-memory state correct, drop persistence
  }
  subscribers.forEach((fn) => fn(next));
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    const next = e.newValue === "preview";
    if (next === current) return;
    current = next;
    subscribers.forEach((fn) => fn(next));
  });
}

/** `[preview, setPreview]` mirroring `useState<boolean>`, but shared globally and persisted. */
export function useFilePreviewMode(): [boolean, (next: boolean) => void] {
  const [preview, setPreview] = useState(current);
  useEffect(() => {
    setPreview(current);
    subscribers.add(setPreview);
    return () => { subscribers.delete(setPreview); };
  }, []);
  const set = useCallback((next: boolean) => setGlobal(next), []);
  return [preview, set];
}

/* ── api.ts — the four calls the surface made ─────────────────────────────── */

export interface DirFileContent {
  path: string;
  content: string;
  binary: boolean;
  tooLarge: boolean;
  size: number;
}

/** `filePath` under the folder `agentId`, as an absolute store path. */
const under = (agentId: string, rel: string): string =>
  `${agentId.replace(/\/+$/, "")}/${rel.replace(/^\.?\/+/, "")}`;

/** Read one file of the "directory agent" — a folder of the store — by a path relative to it. */
export async function readVirtualDirectoryFile(agentId: string, filePath: string): Promise<DirFileContent> {
  const abs = under(agentId, filePath);
  const r = await readStoreFile(abs, abs);
  const content = r.content ?? "";
  return { path: filePath, content, binary: false, tooLarge: false, size: content.length };
}

/** The URL a screenshot key resolves to — bytes served by the host, no signing needed. */
export async function directoryAssetUrl(agentId: string, _filePath: string, key: string): Promise<string> {
  const abs = under(agentId, key);
  const url = rawFileUrlFor(abs, abs);
  if (!url) throw new Error("this host serves no file bytes");
  return url;
}

/** Upload a screenshot beside the flow: `<stem>-assets/<name>-<hash>.<ext>`, returned as the key. */
export async function uploadDirectoryAsset(agentId: string, filePath: string, blob: Blob, filename: string): Promise<{ key: string }> {
  const writer = configuredBinaryWriter();
  if (!writer) throw new Error("this host cannot upload files");
  const name = filePath.slice(filePath.lastIndexOf("/") + 1);
  const stem = name.replace(/\.[^.]+$/, "") || "flow";
  const dot = filename.lastIndexOf(".");
  const base = (dot > 0 ? filename.slice(0, dot) : filename).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "shot";
  const ext = dot > 0 ? filename.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "png";
  const hash = Array.from(crypto.getRandomValues(new Uint8Array(4))).map((b) => b.toString(16).padStart(2, "0")).join("");
  const key = `${stem}-assets/${base}-${hash}.${ext || "png"}`;
  await writer(under(agentId, key), blob);
  return { key };
}

/* ── itemFileTemplates.ts — the flow template, verbatim ───────────────────── */

export const ITEM_FILE_TEMPLATES = {
  flow: `# A .flow file is TWO YAML docs separated by a line that is just '---'.
# Doc 1 = MODEL (dimensions + screens, each screen carrying its own controls). Doc 2 = VIEWS.
#
# A .flow is a walkthrough whose screens and navigation are PARAMETERISED. A screen that renders
# differently under different data is ONE screen with variants — not several screens with
# different titles. Its CONTROLS live on it, in its own \`edges:\` list; there is no top-level
# \`edges\` and no \`from\` field, because a button belongs to the page it sits on.
#
# TWO SCOPES, and choosing between them is the main decision you make here:
#   dimensions      — facts about the world that outlive a screen (a flag, what the listing is)
#   screen.locals   — that screen's own UI state (which radio is selected, which step you are on).
#                     Locals RESET every time you arrive from elsewhere, and no other screen sees
#                     them. If only one screen reads it, make it a local.
title: My flow

# Closed, ordered value sets. The whole space is finite so coverage is computable.
dimensions:
  shippingType: [free_shipping, flat_rate, price_on_request]
  featureFlag: [true, false]

# The starting assignment for a simulation. Anything omitted is simply unset.
defaults:
  shippingType: flat_rate
  featureFlag: true

# First-match-wins rules producing another dimension. \`value: "= otherDim"\` copies a dimension
# instead of writing a literal — enough for "a flag overrides a data value", and no more.
derived:
  - name: effectiveShipping
    values: [free_shipping, flat_rate, none]
    rules:
      - when: { featureFlag: false }
        value: none
      - when: { shippingType: price_on_request }
        value: none
      - when: "*"
        value: "= shippingType"

initial: home
start_mode: screen          # or 'entries' + an \`entries:\` list of start events

# WHAT A STATE SHOWS. A screenshot is one kind of evidence, not the definition of the format:
# a state's \`content\` is a list of PANELS, stepped through one at a time.
#   - { screenshot: <storage key> }        an image in this directory
#   - { frame: login.frame, view: Loading } a .frame beside this flow, drawn LIVE at one of its
#                                          views — the states of a screen point at different views
#                                          of the SAME frame; its scroll is its own, one panel
#   - { frame: login, view: Loading }      the same, for a frame kept INSIDE this flow under
#                                          \`frames:\` (Projects: "Move into flow…"; the Studio
#                                          opens it from the flow's preview)
#   - { file: notes/plan.brief }           ANOTHER file, drawn by its own kind's preview,
#                                          read-only and LIVE (editing it changes this state)
# \`screenshot:\`/\`screenshots:\` below are the screenshot-only shorthand for the same thing —
# write those when a state is only images; \`frame:\` + \`view:\` is the frame-only shorthand.

# NAMED VERSIONS of the material \`file\` panels read from. A panel says \`source: after\` and the
# same relative path means "that document, that version" — so two states of one screen can differ
# only in which published version they show, without hard-coding two paths.
sources:
  - { name: before, path: versions/before }
  - { name: after,  path: versions/after }
default_source: before

screens:
  - id: home
    title: Home
    screenshot: <storage key>          # or screenshots: [top.png, bottom.png] for a tall screen
    edges:
      - id: e1
        event: Checkout       # ONE control, going one place.
        to: checkout

  - id: checkout
    title: Checkout
    # Variables this screen OWNS. First value listed is the default; arriving here resets them.
    locals:
      agreed: [false, true]
    # First matching variant wins. Give the last one \`when: "*"\` so every configuration renders.
    # A \`when\` here may read the dimensions, the derived values, or this screen's own locals.
    variants:
      - when: { effectiveShipping: free_shipping }
        label: Free shipping
        description: Shows the "Free shipping" chip beside $0.00.
        screenshot: <storage key>
      - when: "*"
        label: Paid shipping
        # The general form: a capture AND the document that explains it, in that order.
        content:
          - { screenshot: <storage key> }
          - { file: terms.brief, source: after, label: Shipping terms }
    edges:
      # No \`to\` = STAYS on this screen. \`sets\` moves it to another of its own states — a radio,
      # a checkbox, a step of a form. This is what a self-transition used to be.
      - id: e2
        event: Agree to the terms
        when: { agreed: false }
        sets: { agreed: true }
      # \`when\` decides whether a control is OFFERED AT ALL. Do NOT write a dispatch whose
      # branches all fail to say a button is absent — say it here.
      - id: e3
        event: Pay
        when: { agreed: true }
        # \`dispatch\` is for when the DESTINATION varies. First match wins.
        dispatch:
          - when: { effectiveShipping: none }
            to: home
          - when: "*"
            to: home
        sets: { featureFlag: true }   # applied on arrival; may seed a local of the target screen

# when matching: bare value = equals · [a, b] = one-of · "*" = any · "!x" = not-equal

# FRAMES KEPT IN THIS FILE — whole .frame bodies by name; a state shows one with \`frame: <name>\`.
# frames:
#   login: { title: Login, frames: [...], nodes: [...], views: [...] }
---
active: v1
views:
  - id: v1
    name: Free shipping
    layout:
      params: { shippingType: free_shipping, featureFlag: true }
      tab: screens          # screens | map | changes
      labelVariants: true
`,
};
