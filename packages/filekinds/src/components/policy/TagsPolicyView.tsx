/**
 * The TAGS policy (`role: tags`) — stage 1 of the chain, readable: every
 * dimension, its values, and the ordered derive rules that tag an item from
 * its params. Clicking a value highlights the rules that produce it, so
 * "where does Platform = iOS come from?" is one click. Tagging only — the
 * judgement (what a tag combination is worth) lives in the order policy.
 */
import { useState } from "react";
import { Box, Chip, Stack, Tooltip, Typography } from "@mui/material";
import { TagDimension, TagsPolicyDoc, deriveRuleText, whenRefsText } from "../../lib/policyChain";
import { labelOfParam } from "../../lib/policyDoc";

function DimensionCard({ d, all }: { d: TagDimension; all: TagDimension[] }) {
  /** Highlighted value key — narrows the rule list visually. */
  const [picked, setPicked] = useState<string | null>(null);
  const computed = d.from.length > 0;
  const rules: { label?: string; text: string; value: string; isDefault: boolean }[] = computed
    ? d.from.map((r) => ({
        ...(r.label ? { label: r.label } : {}),
        text: r.when.length ? whenRefsText(all, r.when) : "otherwise (default)",
        value: r.value, isDefault: !r.when.length,
      }))
    : d.derive.map((r) => ({
        ...(r.label ? { label: r.label } : {}),
        text: deriveRuleText(r), value: r.value, isDefault: !r.when.length,
      }));
  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.25,
               opacity: d.hidden ? 0.75 : 1 }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap", mb: 0.75 }}>
        <Typography sx={{ fontSize: 12.5, fontWeight: 700, mr: 0.5 }}>{d.label}</Typography>
        {d.values.map((v) => (
          <Chip key={v.key} size="small" clickable label={v.label}
            onClick={() => setPicked(picked === v.key ? null : v.key)}
            sx={{ height: 20, fontSize: 12, fontWeight: 700,
                  bgcolor: picked === v.key ? "#4f46e5" : "#4f46e514",
                  color: picked === v.key ? "#fff" : "#4f46e5" }} />
        ))}
        <Box sx={{ flex: 1 }} />
        {computed && (
          <Tooltip title="Computed from the answers of the dimensions above it, not from the item's params">
            <Chip size="small" label="computed"
              sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: "#0f172a0d", color: "text.secondary" }} />
          </Tooltip>
        )}
        {d.hidden && (
          <Tooltip title="Plumbing: still tags every item, but Input panes and answer groups skip it">
            <Chip size="small" label="hidden"
              sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: "#0f172a0d", color: "text.secondary" }} />
          </Tooltip>
        )}
      </Stack>
      {d.detail && (
        <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 0.75 }}>{d.detail}</Typography>
      )}
      <Stack spacing={0.4}>
        {rules.map((r, i) => {
          const dimmed = picked !== null && r.value !== picked;
          return (
            <Box key={i} sx={{ display: "flex", gap: 0.75, alignItems: "baseline",
                               opacity: dimmed ? 0.35 : 1 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: "text.disabled",
                                width: 14, flexShrink: 0, textAlign: "right" }}>{i + 1}</Typography>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                {r.label && (
                  <Typography sx={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{r.label}</Typography>
                )}
                <Typography sx={{ fontSize: 12, fontFamily: computed ? undefined : "monospace",
                                  color: "text.secondary" }}>
                  {r.text}
                </Typography>
              </Box>
              <Chip size="small" label={`→ ${d.values.find((v) => v.key === r.value)?.label ?? r.value}`}
                sx={{ height: 20, fontSize: 12, fontWeight: 700, flexShrink: 0,
                      bgcolor: picked === r.value ? "#4f46e5" : "#0f172a0d",
                      color: picked === r.value ? "#fff" : "text.secondary" }} />
            </Box>
          );
        })}
        {!rules.length && (
          <Typography sx={{ fontSize: 13, fontStyle: "italic", color: "text.disabled" }}>
            No rules — this dimension is never tagged.
          </Typography>
        )}
        {rules.length > 0 && !rules.some((r) => r.isDefault) && (
          <Typography sx={{ fontSize: 12, fontStyle: "italic", color: "text.disabled", pl: "22px" }}>
            no rule matches → untagged
          </Typography>
        )}
      </Stack>
    </Box>
  );
}

export default function TagsPolicyView({ doc, height = "100%" }: {
  doc: TagsPolicyDoc;
  height?: number | string;
}) {
  return (
    <Box sx={{ height, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Box sx={{ px: 1.5, py: 0.75, borderBottom: "1px solid", borderColor: "divider", flexShrink: 0 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 650 }}>
          {doc.title}
          <Typography component="span" sx={{ fontSize: 13, color: "text.secondary", ml: 1 }}>
            tags policy — rules are tested top to bottom within each dimension; the first match tags it
          </Typography>
        </Typography>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 1.5 }}>
        {doc.description && (
          <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 1.25 }}>{doc.description}</Typography>
        )}
        <Stack spacing={1}>
          {doc.tags.map((d) => <DimensionCard key={d.key} d={d} all={doc.tags} />)}
          {!doc.tags.length && (
            <Typography sx={{ fontSize: 12, color: "text.disabled", fontStyle: "italic" }}>
              No tag dimensions declared.
            </Typography>
          )}
        </Stack>

        <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                          color: "text.disabled", mt: 2, mb: 0.5 }}>
          What it reads
        </Typography>
        <Stack spacing={0.4}>
          {doc.params.map((p) => (
            <Box key={p.key} sx={{ display: "flex", gap: 1, alignItems: "baseline" }}>
              <Typography sx={{ fontSize: 12, fontFamily: "monospace", color: "text.disabled",
                                width: 118, flexShrink: 0 }}>{p.key}</Typography>
              <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                {p.type} — {labelOfParam(p)}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}
