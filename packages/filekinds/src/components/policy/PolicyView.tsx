/**
 * The `.policy` viewer — the deterministic machine, operable:
 *
 *   left   — input fields generated from the policy's params
 *   middle — the SWITCH as an ordered case list; after a submit the case
 *            that claimed the item is highlighted (first match wins)
 *   right  — the submitted items as a 1-D list GROUPED BY BUCKET (the
 *            crosscut OneDList — exactly what a project gets for a list
 *            of items run through the policy)
 */
import { useMemo, useState } from "react";
import { Box, Button, Checkbox, Chip, FormControlLabel, Stack, TextField, Typography } from "@mui/material";
import { OneDList } from "crosscut";
import {
  PolicyDoc, PolicyInput, applyPolicy, bucketLabel, bucketOrder, clauseText, labelOfParam,
} from "../../lib/policyDoc";
import { parsePolicyKindFile } from "../../lib/policyChain";
import type { ViewerProps } from "../../lib/filePreviews";
import { parseRanking } from "../../lib/rankingDoc";
import OrderPolicyView from "./OrderPolicyView";
import PolicyRunView from "./PolicyRunView";
import RankingView from "./RankingView";
import TagsPolicyView from "./TagsPolicyView";
import TablePolicyView from "./TablePolicyView";

/** A ranking names the list it ranks AND the decisions it ranks it by. */
const isRanking = (text: string): boolean =>
  /^decisions:/m.test(text) && /^items:/m.test(text);

interface RunItem {
  id: string;
  label: string;
  bucket: string;
  caseIndex: number;
}

const paneSx = {
  flex: 1, minWidth: 240, minHeight: 0, overflowY: "auto",
  borderRight: "1px solid", borderColor: "divider", p: 1.5,
} as const;

export default function PolicyView({ content, height = "100%", path, agentId }: ViewerProps) {
  const parsed = useMemo(() => parsePolicyKindFile(content), [content]);
  const doc: PolicyDoc = parsed.role === "policy" ? parsed : ({
    title: "", rules: [], params: [], cases: [], buckets: [],
  } as unknown as PolicyDoc);

  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [items, setItems] = useState<RunItem[]>([]);
  const [lastCase, setLastCase] = useState<number | null>(null);
  const [seq, setSeq] = useState(1);

  const setVal = (k: string, v: string | boolean) => setValues((s) => ({ ...s, [k]: v }));

  const submit = () => {
    const input: PolicyInput = {};
    for (const p of doc.params) {
      const raw = values[p.key];
      if (p.type === "boolean") input[p.key] = raw === true;
      else if (p.type === "number") input[p.key] = raw === undefined || raw === "" ? "" : Number(raw);
      else input[p.key] = typeof raw === "string" ? raw : "";
    }
    const v = applyPolicy(doc, input);
    const firstString = doc.params.find((p) => p.type === "string");
    const label = (firstString && String(input[firstString.key] ?? "").trim()) || `item ${seq}`;
    setItems((s) => [...s, { id: String(seq), label, bucket: v.bucket, caseIndex: v.caseIndex }]);
    setSeq((n) => n + 1);
    setLastCase(v.caseIndex);
  };

  const order = useMemo(() => bucketOrder(doc), [doc]);

  /* A RUN applies this policy to a whole list — two panes, not a form.
   * A RANKING does the same, but its buckets fall out of decisions.
   * The CHAIN roles: a tags policy tags an item's content, an order policy
   * ranks the tag combinations. A TABLE policy is rules over rows, shown as words. (All hooks above have already run.) */
  const base = path ?? agentId ?? "";
  if (isRanking(content)) {
    return <RankingView doc={parseRanking(content)} base={base} content={content} height={height} />;
  }
  if (parsed.role === "run") {
    return <PolicyRunView run={parsed} base={base} height={height} />;
  }
  if (parsed.role === "tags") {
    return <TagsPolicyView doc={parsed} height={height} />;
  }
  if (parsed.role === "order") {
    return <OrderPolicyView doc={parsed} base={base} height={height} />;
  }
  if (parsed.role === "table") {
    return <TablePolicyView doc={parsed} height={height} fileName={base.slice(base.lastIndexOf("/") + 1)} />;
  }

  return (
    <Box sx={{ height, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Box sx={{ px: 1.5, py: 0.75, borderBottom: "1px solid", borderColor: "divider", flexShrink: 0 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 650 }}>{doc.title}</Typography>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, display: "flex", overflow: "auto" }}>

        {/* ── inputs ── */}
        <Box sx={paneSx}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                            color: "text.disabled", mb: 1 }}>
            Input parameters
          </Typography>
          <Stack spacing={1.25}>
            {doc.params.map((p) =>
              p.type === "boolean" ? (
                <FormControlLabel key={p.key}
                  control={<Checkbox size="small" checked={values[p.key] === true}
                    onChange={(e) => setVal(p.key, e.target.checked)} />}
                  label={<Typography sx={{ fontSize: 12.5 }}>{labelOfParam(p)}</Typography>} />
              ) : (
                <TextField key={p.key} size="small" label={labelOfParam(p)}
                  type={p.type === "number" ? "number" : "text"}
                  multiline={p.type === "string"} maxRows={6}
                  value={typeof values[p.key] === "string" ? values[p.key] : ""}
                  onChange={(e) => setVal(p.key, e.target.value)}
                  slotProps={{ inputLabel: { sx: { fontSize: 12.5 } }, input: { sx: { fontSize: 12.5 } } }} />
              ))}
            {!doc.params.length && (
              <Typography sx={{ fontSize: 12, color: "text.disabled", fontStyle: "italic" }}>No params declared.</Typography>
            )}
            <Button variant="contained" size="small" onClick={submit} disableElevation
              sx={{ alignSelf: "flex-start", bgcolor: "#4f46e5", textTransform: "none", fontSize: 12,
                    "&:hover": { bgcolor: "#4338ca" } }}>
              Apply policy
            </Button>
          </Stack>
        </Box>

        {/* ── the switch ── */}
        <Box sx={paneSx}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                            color: "text.disabled", mb: 1 }}>
            Switch — first match wins
          </Typography>
          <Stack spacing={0.75}>
            {doc.cases.map((c, i) => {
              const hit = lastCase === i;
              return (
                <Box key={i}
                  sx={{ border: "1px solid", borderColor: hit ? "#4f46e5" : "divider", borderRadius: 1.5,
                        bgcolor: hit ? "#4f46e50d" : "#fff", p: 1,
                        boxShadow: hit ? "0 0 0 2px #4f46e522" : "none" }}>
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 700, color: "text.disabled", width: 16 }}>{i + 1}</Typography>
                    <Typography sx={{ fontSize: 12.5, fontWeight: 600, flex: 1, minWidth: 0 }} noWrap>
                      {c.label ?? `case ${i + 1}`}
                    </Typography>
                    <Chip size="small" label={`→ ${bucketLabel(doc, c.bucket)}`}
                      sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: hit ? "#4f46e5" : "#0f172a0d",
                            color: hit ? "#fff" : "text.secondary" }} />
                  </Stack>
                  <Box sx={{ pl: 3, mt: 0.25 }}>
                    {c.when.length
                      ? c.when.map((cl, j) => (
                        <Typography key={j} sx={{ fontSize: 13, color: "text.secondary", fontFamily: "monospace" }}>
                          {j > 0 ? "and " : "when "}{clauseText(cl)}
                        </Typography>
                      ))
                      : <Typography sx={{ fontSize: 13, color: "text.secondary", fontStyle: "italic" }}>always</Typography>}
                  </Box>
                </Box>
              );
            })}
            <Box sx={{ border: "1px dashed", borderColor: lastCase === -1 ? "#4f46e5" : "divider", borderRadius: 1.5,
                       bgcolor: lastCase === -1 ? "#4f46e50d" : "transparent", p: 1 }}>
              <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                <Typography sx={{ fontSize: 12, color: "text.secondary", flex: 1, fontStyle: "italic" }}>
                  no case matches
                </Typography>
                <Chip size="small" label={`→ ${bucketLabel(doc, doc.default ?? "unmatched")}`}
                  sx={{ height: 20, fontSize: 12, fontWeight: 700,
                        bgcolor: lastCase === -1 ? "#4f46e5" : "#0f172a0d",
                        color: lastCase === -1 ? "#fff" : "text.secondary" }} />
              </Stack>
            </Box>
          </Stack>
        </Box>

        {/* ── buckets ── */}
        <Box sx={{ ...paneSx, borderRight: "none" }}>
          <Stack direction="row" sx={{ alignItems: "center", mb: 1 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                              color: "text.disabled", flex: 1 }}>
              Buckets
            </Typography>
            {items.length > 0 && (
              <Button size="small" onClick={() => { setItems([]); setLastCase(null); }}
                sx={{ fontSize: 13, textTransform: "none", minWidth: 0, p: "1px 6px" }}>
                clear
              </Button>
            )}
          </Stack>
          <OneDList<RunItem>
            items={items}
            keyOf={(it) => it.id}
            dimension={{
              of: (it) => it.bucket,
              label: (k) => bucketLabel(doc, k),
              order,
            }}
            mode="headings"
            empty={
              <Typography sx={{ fontSize: 12, color: "text.disabled", fontStyle: "italic" }}>
                Apply the policy to an input — it lands here, grouped by bucket.
              </Typography>
            }
            renderItem={(it) => (
              <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, px: 1, py: 0.5,
                         display: "flex", alignItems: "center", gap: 0.75, bgcolor: "#fff" }}>
                <Typography sx={{ fontSize: 12, flex: 1, minWidth: 0 }} noWrap>{it.label}</Typography>
                <Typography sx={{ fontSize: 12, color: "text.disabled" }}>
                  {it.caseIndex >= 0 ? `case ${it.caseIndex + 1}` : "default"}
                </Typography>
              </Box>
            )}
          />
        </Box>
      </Box>
    </Box>
  );
}
