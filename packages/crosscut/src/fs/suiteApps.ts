/**
 * THE APPS OF THE SUITE and where each is mounted on the one public origin.
 * Every cross-app link is a RELATIVE path built from here — never an absolute
 * localhost URL (the router fronts all of them on one hostname).
 *
 * Since 2026-09-12 there is ONE Studio for every file kind: `/studio` opens
 * any document by its extension. The per-kind studios (/playbook, /points,
 * /frame, /flow, /policy, /journey, /projects) are retired; the router
 * redirects their old links to the Studio.
 */
export const SUITE_APPS = {
  nodes: { name: "Nodes", origin: "/nodes" },
  studio: { name: "Studio", origin: "/studio" },
  missionControl: { name: "Mission Control", origin: "" },
} as const;
