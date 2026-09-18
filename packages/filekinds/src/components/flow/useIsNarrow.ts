import useMediaQuery from "@mui/material/useMediaQuery";

/**
 * The width at which the flow surface stops being a row of columns.
 *
 * NOT the app's phone breakpoint (`useIsMobile`, 768px) — this surface runs out of room long
 * before a phone. Its natural layout is a screen LIST beside a screenshot beside a controls column
 * beside a states column, which needs roughly 950px before anything overlaps; below that the
 * screenshot was being squeezed to nothing and the right-hand column clipped off the edge.
 *
 * Kept next to the flow components rather than in `src/lib` because it is a fact about THIS
 * layout, not a shared app breakpoint, and promoting it would invite other surfaces to inherit a
 * number that has nothing to do with them.
 */
export function useIsNarrow(): boolean {
  return useMediaQuery("(max-width: 1100px)");
}
