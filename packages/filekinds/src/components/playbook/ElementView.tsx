/**
 * ONE policy element, alone — how a child node under the Policy item opens.
 *
 * Policy elements are POINTS a stream can produce and target: a decision (with
 * its answers), or an event. This pane isolates a single element: its own UI —
 * the answer pills for a decision, the event row for an event — plus THE
 * CONFIGURATION BEHIND IT: when it appears, what activates it, and which rules
 * read it. Opening the whole policy composes all of them; this shows one.
 */
import { useMemo, useState } from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import { DecisionPills, EventRow, splitRef } from "crosscut";
import { PlaybookDoc, contentKey, contentPath, contentText, rulesOf, variationOf, type PlaybookContent } from "../../lib/playbookDoc";
import { InlineFile } from "../../lib/AnnotationContent";
import { previewForPath } from "../../lib/filePreviews";

const MONO = { fontFamily: "ui-monospace, monospace" } as const;

/** Content written in the book: rendered by its kind, from the text the entry carries — for a written set, the member the answers pick. */
function InlineDoc({ entry, locks }: { entry: PlaybookContent; locks: string[] }) {
  const path = contentPath(entry);
  const preview = useMemo(() => previewForPath(path), [path]);
  const { missing, segs } = variationOf(entry, locks);
  const text = contentText(entry, segs);
  if (missing.length) {
    return <Typography sx={{ fontSize: 13, color: "#a16207", fontStyle: "italic" }}>Answer {missing.join(" and ")} to see this.</Typography>;
  }
  return preview
    ? <preview.Renderer content={text} height="auto" path={path} />
    : <Box component="pre" sx={{ fontSize: 13, m: 0, whiteSpace: "pre-wrap" }}>{text}</Box>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ mb: 1.75 }}>
      <Typography sx={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase",
                        letterSpacing: 0.6, color: "text.disabled", mb: 0.5 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

const refLabel = (doc: PlaybookDoc, ref: string): string => {
  const [dk, vk] = splitRef(ref);
  const d = doc.decisions.find((x) => x.key === dk);
  const v = d?.values.find((x) => x.key === vk);
  return d ? `${d.label}: ${v?.label ?? vk}` : ref;
};

export default function ElementView({ doc, kind, elKey, valueKey, base }: {
  doc: PlaybookDoc;
  kind: "decision" | "event";
  elKey: string;
  /** Narrow a decision to ONE ANSWER (`decision:<key>=<value>` addressing):
   *  the pane shows just that answer, not the whole decision. */
  valueKey?: string;
  /** The policy document's abs path — attached content resolves against it. */
  base?: string;
}) {
  // Starts on the policy's SAVED answers — the element is the same reference
  // as the policy node, so it shows the real state. Toggling here is
  // exploration only; nothing writes back.
  const [locks, setLocks] = useState<string[]>(() => doc.view.locks ?? []);

  if (kind === "decision") {
    const d = doc.decisions.find((x) => x.key === elKey);
    if (!d) return <Typography sx={{ p: 3, fontSize: 12, color: "#b45309" }}>No decision “{elKey}” in this policy.</Typography>;

    if (valueKey) {
      const v = d.values.find((x) => x.key === valueKey);
      if (!v) return <Typography sx={{ p: 3, fontSize: 12, color: "#b45309" }}>No answer “{valueKey}” on “{d.label}”.</Typography>;
      const ref = `${d.key}=${v.key}`;
      const saved = (doc.view.locks ?? []).includes(ref);
      const activates = (v.activates ?? []).map((k) => doc.decisions.find((x) => x.key === k)?.label ?? k);
      // At version 2 an event is its own rule (`rulesOf`), so the same lookup reads both versions.
      const readers = rulesOf(doc)
        .filter((r) => (r.when ?? []).map(String).includes(ref))
        .map((r) => ({ event: doc.events.find((e) => e.key === r.event)?.label ?? r.event, rule: r }));
      return (
        <Box sx={{ p: 2, maxWidth: 640 }}>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
            <Typography sx={{ fontSize: 15, fontWeight: 650 }}>{v.label}</Typography>
            <Chip size="small" label="answer"
                  sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: "#7c3aed1a", color: "#7c3aed" }} />
            {saved && (
              <Chip size="small" label="current answer"
                    sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: "#16a34a1a", color: "#16a34a" }} />
            )}
          </Stack>
          <Typography sx={{ fontSize: 12, ...MONO, color: "text.disabled", mb: 1 }}>{ref}</Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 1.5 }}>
            One answer of the <b>{d.label}</b> decision.
          </Typography>
          {v.detail && (
            <Section title="What it means">
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{v.detail}</Typography>
            </Section>
          )}
          <Section title="What it activates">
            {activates.length ? (
              <Stack spacing={0.3}>
                {activates.map((a) => <Typography key={a} sx={{ fontSize: 13 }}>Activates <b>{a}</b></Typography>)}
              </Stack>
            ) : (
              <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Activates nothing on its own.</Typography>
            )}
          </Section>
          <Section title={`Read by · ${readers.length} rule${readers.length === 1 ? "" : "s"}`}>
            {readers.length ? (
              <Stack spacing={0.5}>
                {readers.map((r, i) => (
                  <Box key={i} sx={{ borderLeft: "2px solid", borderColor: "#c3c9d2", pl: 1 }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 650 }}>{r.event}</Typography>
                    <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                      {(r.rule.when ?? []).map((w) => refLabel(doc, String(w))).join(" · ") || "always"}
                      {r.rule.status ? ` → ${r.rule.status}` : ""}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            ) : (
              <Typography sx={{ fontSize: 13, color: "text.secondary" }}>No rule reads this answer yet.</Typography>
            )}
          </Section>
        </Box>
      );
    }

    // What ACTIVATES it: values elsewhere that list it. Empty = always shown.
    const activators = doc.decisions.flatMap((od) =>
      od.values.filter((v) => v.activates?.includes(d.key)).map((v) => `${od.label}: ${v.label}`));
    // What READS it: rules whose when/sets touch any of its refs (at version 2, the events themselves).
    const readers = rulesOf(doc)
      .filter((r) => [...(r.when ?? []), ...(r.sets ?? [])].some((ref) => splitRef(String(ref))[0] === d.key))
      .map((r) => ({ event: doc.events.find((e) => e.key === r.event)?.label ?? r.event, rule: r }));

    return (
      <Box sx={{ p: 2, maxWidth: 640 }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
          <Typography sx={{ fontSize: 15, fontWeight: 650 }}>{d.label}</Typography>
          <Chip size="small" label="decision"
                sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: "#0e74901a", color: "#0e7490" }} />
        </Stack>
        <Typography sx={{ fontSize: 12, ...MONO, color: "text.disabled", mb: 1 }}>{d.key}</Typography>
        {d.detail && <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 1.5 }}>{d.detail}</Typography>}

        <Section title="Answers">
          <DecisionPills decisions={[d]} value={locks} onChange={setLocks} />
          {d.values.some((v) => v.detail) && (
            <Stack spacing={0.4} sx={{ mt: 1 }}>
              {d.values.filter((v) => v.detail).map((v) => (
                <Typography key={v.key} sx={{ fontSize: 13, color: "text.secondary" }}>
                  <b>{v.label}</b> — {v.detail}
                </Typography>
              ))}
            </Stack>
          )}
        </Section>

        <Section title="When it appears">
          {activators.length ? (
            <Stack spacing={0.3}>
              {activators.map((a) => (
                <Typography key={a} sx={{ fontSize: 13 }}>Activated by <b>{a}</b></Typography>
              ))}
            </Stack>
          ) : (
            <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Always available — no answer gates it.</Typography>
          )}
        </Section>

        <Section title={`Read by · ${readers.length} rule${readers.length === 1 ? "" : "s"}`}>
          {readers.length ? (
            <Stack spacing={0.5}>
              {readers.map((r, i) => (
                <Box key={i} sx={{ borderLeft: "2px solid", borderColor: "#c3c9d2", pl: 1 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 650 }}>{r.event}</Typography>
                  <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                    {(r.rule.when ?? []).map((w) => refLabel(doc, String(w))).join(" · ") || "always"}
                    {r.rule.sets?.length ? ` — sets ${r.rule.sets.join(", ")}` : ""}
                    {r.rule.status ? ` → ${r.rule.status}` : ""}
                  </Typography>
                </Box>
              ))}
            </Stack>
          ) : (
            <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
              Nothing reads it yet — the streams that produced it will wire events to it next.
            </Typography>
          )}
        </Section>
      </Box>
    );
  }

  const e = doc.events.find((x) => x.key === elKey);
  if (!e) return <Typography sx={{ p: 3, fontSize: 12, color: "#b45309" }}>No event “{elKey}” in this policy.</Typography>;
  // Version 1: the rules naming this event. Version 2: the event's own `when` and `hint`, as one rule, or none.
  const rules = rulesOf(doc).filter((r) => r.event === e.key);
  const content = e.content ?? [];
  return (
    <Box sx={{ p: 2, maxWidth: 640 }}>
      <EventRow label={e.label} trigger={e.trigger} repeats={e.arity === "many"} rate={e.rate} detail={e.detail} />
      <Typography sx={{ fontSize: 12, ...MONO, color: "text.disabled", my: 1 }}>{e.key}</Typography>
      {/* The meaning, visibly — the tooltip on the row is not enough for a reader learning the system. */}
      {e.detail && (
        <Typography sx={{ fontSize: 13, color: "text.secondary", fontStyle: "italic", mb: 1 }}>
          {e.detail}
        </Typography>
      )}
      <Section title={doc.version >= 2 ? "How it plays out" : `Rules · ${rules.length}`}>
        {rules.length ? (
          <Stack spacing={0.75}>
            {rules.map((r, i) => (
              <Box key={i} sx={{ borderLeft: "2px solid", borderColor: "#c3c9d2", pl: 1 }}>
                <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                  {(r.when ?? []).map((w) => refLabel(doc, String(w))).join(" · ") || "always"}
                  {r.status ? ` → ${r.status}` : ""}{r.sets?.length ? ` — sets ${r.sets.join(", ")}` : ""}
                </Typography>
                {r.process && <Typography sx={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{r.process}</Typography>}
                {r.note && <Typography sx={{ fontSize: 13, fontStyle: "italic", color: "text.secondary" }}>{r.note}</Typography>}
              </Box>
            ))}
          </Stack>
        ) : (
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            {doc.version >= 2
              ? "Always on the table; no hint — it shows its document."
              : "No rules yet — nobody has looked at this event here."}
          </Typography>
        )}
      </Section>

      {!!content.length && base && (
        <Section title={`Content · ${content.length}`}>
          <Stack spacing={1}>
            {content.map((c, i) => (
              <Box key={contentKey(c, String(i))}>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: "baseline", mb: 0.5 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 650 }}>{c.label ?? c.file ?? c.kind}</Typography>
                  {!!c.by?.length && (
                    <Typography sx={{ fontSize: 12, color: "text.disabled" }}>by {c.by.join(", ")}</Typography>
                  )}
                  <Typography sx={{ fontSize: 12, ...MONO, color: "text.disabled" }}>{c.file ?? "written here"}</Typography>
                </Stack>
                {c.file
                  ? <InlineFile base={base} file={c.file} height="auto" />
                  : <InlineDoc entry={c} locks={locks} />}
              </Box>
            ))}
          </Stack>
        </Section>
      )}
    </Box>
  );
}
