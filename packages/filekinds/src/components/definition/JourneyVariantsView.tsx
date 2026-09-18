/**
 * A/B TESTING as a view, not a new structure: a `variants:` file names
 * sibling journeys that answer the same question differently (same trunk,
 * different talking points, different judgements). Pills flip WHOLE
 * journeys — each variant renders full-size with its own basePath, fully
 * interactive, so comparing versions is flipping, not diffing.
 */
import { useEffect, useState } from "react";
import { Box, Chip, Typography } from "@mui/material";
import { resolveRef } from "crosscut";
import { readVirtualDirectoryFile } from "../../api";
import { JourneyStagesDoc, JourneyVariantsDoc, parseJourneyStages } from "../../lib/journeyStages";
import JourneyStagesView from "./JourneyStagesView";

export default function JourneyVariantsView({ doc, basePath }: {
  doc: JourneyVariantsDoc; basePath: string;
}) {
  const [picked, setPicked] = useState(0);
  const [loaded, setLoaded] = useState<{ abs: string; journey: JourneyStagesDoc } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const variant = doc.variants[Math.min(picked, doc.variants.length - 1)];

  useEffect(() => {
    let live = true;
    setLoaded(null);
    setErr(null);
    (async () => {
      try {
        const abs = resolveRef(basePath, variant.journey);
        const journey = parseJourneyStages((await readVirtualDirectoryFile(abs, abs)).content);
        if (!live) return;
        if (journey) setLoaded({ abs, journey });
        else setErr(`${variant.journey} is not a staged journey (no stages:)`);
      } catch (e) {
        if (live) setErr(`could not read ${variant.journey}: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    return () => { live = false; };
  }, [basePath, variant.journey]);

  return (
    <Box sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column", bgcolor: "#fafbfc" }}>
      <Box sx={{ px: 2, pt: 1.5, pb: 1, borderBottom: "1px solid", borderColor: "divider", bgcolor: "#fff" }}>
        {doc.description && (
          <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 0.75, maxWidth: 900 }}>
            {doc.description}
          </Typography>
        )}
        <Box sx={{ display: "flex", gap: 0.6, flexWrap: "wrap", alignItems: "center" }}>
          {doc.variants.map((v, i) => (
            <Chip key={v.journey} size="small" label={v.label}
              onClick={() => setPicked(i)}
              sx={{ height: 22, fontSize: 13, fontWeight: 700, cursor: "pointer",
                    bgcolor: i === picked ? "#4f46e5" : "#0f172a0d",
                    color: i === picked ? "#fff" : "text.secondary",
                    "&:hover": { bgcolor: i === picked ? "#4f46e5" : "#0f172a1a" } }} />
          ))}
          <Typography sx={{ fontSize: 12, color: "text.disabled", ml: 0.5 }}>
            {doc.variants.length} version{doc.variants.length === 1 ? "" : "s"} — flip to compare
          </Typography>
        </Box>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        {err && <Typography sx={{ p: 2, fontSize: 13, color: "error.main" }}>{err}</Typography>}
        {!err && !loaded && (
          <Typography sx={{ p: 2, fontSize: 13, color: "text.disabled" }}>Loading {variant.label}…</Typography>
        )}
        {loaded && (
          /* keyed by path so flipping remounts — every policy, list and
             embed re-derives for the picked variant */
          <JourneyStagesView key={loaded.abs} doc={loaded.journey} basePath={loaded.abs} />
        )}
      </Box>
    </Box>
  );
}
