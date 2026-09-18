/**
 * THE FLOW SURFACE'S COLOURS — light mode.
 *
 * The legacy components each declared four constants for a DARK app: muted text (`#8b95a8`),
 * emphasised text (`#e6ebf2`, near white), the fill behind a selected chip (`#39424f`) and the
 * conditional marker (`#c7d0dd`, a bright grey), plus a handful of literal panel backgrounds
 * (`#0d1017`, `#11151d`), near-invisible white hovers (`#ffffff0a`) and dark map nodes. On a light
 * background every one of those inverts its meaning — the emphasised text disappears, the
 * conditional grey reads as disabled, the hovers vanish — so they live here, once, in light-mode
 * values with the SAME roles, and the components import them instead of declaring their own.
 *
 * Text pairs are chosen for contrast on white: emphasised is near black, muted is a mid slate that
 * still passes as body text, the conditional marker is a darker slate so it stays readable as text
 * while its 20% tints remain light chip fills.
 */

/** Secondary text. */
export const MUTED = "#5b6472";
/** Selected / emphasised text — neutral, never a hue. */
export const EMPH = "#0f172a";
/** Fill behind a selected chip; EMPH text sits on it. */
export const SEL_BG = "#dbe4f0";
/** A conditional marker: readable as text, a light tint at `${COND}33`. */
export const COND = "#475569";
/** A warning that must stay legible on white. */
export const WARN = "#b45309";

/** The screenshot pane and state thumbnails — a quiet grey device backdrop. */
export const PANE_BG = "#e9edf2";
/** A file panel's surface and its header text. */
export const FILE_BG = "#ffffff";
export const FILE_FG = "#334155";
/** Row hover / selection fill. */
export const HOVER_BG = "#0f172a0a";
/** The icon buttons floating over an image or a thumbnail. */
export const OVERLAY_BG = "#0f172ab3";
export const OVERLAY_FG = "#ffffff";

/** The dialogs' Save / Add and the "take all" action — a filled button that reads as primary. */
export const ACTION_BG = "#334155";
export const ACTION_BG_HOVER = "#1f2937";
export const ACTION_FG = "#ffffff";

/** The map's nodes and edge labels. */
export const MAP = {
  nodeBg: "#ffffff",
  nodeBgDead: "#f8fafc",
  nodeBorder: "#cbd5e1",
  nodeBorderDead: "#e2e8f0",
  nodeFg: "#0f172a",
  labelFg: "#334155",
  labelBg: "#ffffff",
} as const;
