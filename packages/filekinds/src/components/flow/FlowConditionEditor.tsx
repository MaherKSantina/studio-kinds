/**
 * The `when` editor — shared by the state dialog and the control dialog.
 *
 * A condition is a conjunction over dimensions, and each clause may hold SEVERAL values, which is
 * the OR WITHIN one dimension: `{ conversationState: [counter_offer_received, order_submitted] }`
 * reads "this is on the screen for either of those threads".
 *
 * A condition may also be a LIST of such conjunctions, which is the OR ACROSS dimensions — any one
 * alternative matching is enough. That shape exists because some controls genuinely are available
 * in unrelated cases: the seller's "Submit" is every in-person response, OR declining a shipping
 * offer. Splitting that into two controls is not an option, because an edge's identity downstream
 * is (screen title, event) and two edges sharing an event would collide.
 *
 * ONE component rather than a copy in each dialog: the two are the same question ("under what
 * parameters?") and fixing this in one place and not the other is exactly how they would drift.
 *
 * Values already in the file that are NOT in the domain — `"!none"`, or a value since renamed out
 * of a dimension — are still listed, so opening a dialog on one cannot silently discard it. They
 * are marked, because they are not something to author here.
 */
import { Box, Button, Chip, IconButton, MenuItem, Select, Stack, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { type DimValue, type When } from "../../lib/flowEngine";
import { MUTED, WARN } from "./flowPalette";


type Group = Record<string, unknown>;

/** A clause's value(s) as display strings — one entry for a bare value, several for a one-of. */
const asList = (v: unknown): string[] =>
  (Array.isArray(v) ? v.map(String) : v === undefined ? [] : [String(v)]);

const isGroup = (v: unknown): v is Group => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Every condition, single or not, is edited as a LIST of groups. One group is the ordinary case and
 * is written back as a bare mapping, so opening and closing a dialog cannot turn `{a: 1}` into
 * `[{a: 1}]` and show a spurious change in every diff that reads it.
 */
const normalise = (when: When): Group[] => {
  if (Array.isArray(when)) return when.length ? when.map((g) => (isGroup(g) ? { ...g } : {})) : [{}];
  return [isGroup(when) ? { ...when } : {}];
};

export default function FlowConditionEditor({
  when, onChange, dims, domainOf, noteFor, small = false, emptyLabel = "always",
}: {
  when: When;
  onChange: (next: When) => void;
  /** Dimension names offerable here, in the order they should be listed. */
  dims: string[];
  domainOf: (dim: string) => DimValue[];
  /** Optional suffix beside a dimension name, e.g. "(this screen)" for a local. */
  noteFor?: (dim: string) => string;
  small?: boolean;
  emptyLabel?: string;
}) {
  const fs = small ? 11.5 : 12;
  const groups = normalise(when);
  const many = groups.length > 1;

  /** Collapse back to the simplest shape the file can hold. */
  const emit = (next: Group[]) => onChange((next.length === 1 ? next[0] : next) as When);

  const patch = (gi: number, mutate: (g: Group) => void) => {
    const next = groups.map((g) => ({ ...g }));
    mutate(next[gi]);
    emit(next);
  };

  /** Back to the file's shape: one value stays scalar, several become an array. Never empty. */
  const write = (gi: number, dim: string, picked: string[]) => {
    if (!picked.length) return;
    const domain = domainOf(dim);
    const raw = picked.map((s) => domain.find((v) => String(v) === s) ?? s);
    patch(gi, (g) => { g[dim] = raw.length === 1 ? raw[0] : raw; });
  };

  const label = (dim: string) => `${dim}${noteFor?.(dim) ? ` ${noteFor(dim)}` : ""}`;

  const groupBody = (group: Group, gi: number) => {
    const clauses = Object.entries(group);
    return (
      <Stack spacing={0.5}>
        {clauses.length === 0 && (
          <Chip
            size="small"
            label={many ? "empty — matches anything" : emptyLabel}
            sx={{ alignSelf: "flex-start", fontSize: 13, height: 22, ...(many ? { color: WARN } : null) }}
          />
        )}
        {clauses.map(([dim, val]) => {
          const picked = asList(val);
          const domain = domainOf(dim).map(String);
          // Keep anything the file already holds that the domain does not offer.
          const options = [...domain, ...picked.filter((p) => !domain.includes(p))];
          return (
            <Box key={dim} sx={{ display: "flex", alignItems: "center", gap: 0.6, flexWrap: "wrap" }}>
              <Select
                size="small" value={dim}
                onChange={(e) => patch(gi, (g) => {
                  delete g[dim];
                  g[e.target.value] = domainOf(e.target.value)[0];
                })}
                sx={{ fontSize: fs, minWidth: 170 }}
              >
                {dims.map((x) => <MenuItem key={x} value={x} sx={{ fontSize: fs }}>{label(x)}</MenuItem>)}
              </Select>
              <Typography sx={{ fontSize: fs, color: MUTED }}>is</Typography>
              <Select
                multiple size="small" value={picked}
                onChange={(e) => write(gi, dim, typeof e.target.value === "string" ? e.target.value.split(",") : e.target.value)}
                renderValue={(sel) => (sel as string[]).join("  or  ")}
                sx={{ fontSize: fs, minWidth: 170, maxWidth: 340 }}
              >
                {options.map((v) => (
                  <MenuItem key={v} value={v} sx={{ fontSize: fs }}>
                    {v}{domain.includes(v) ? "" : "  (not in this dimension)"}
                  </MenuItem>
                ))}
              </Select>
              <IconButton size="small" onClick={() => patch(gi, (g) => { delete g[dim]; })}>
                <DeleteOutlineIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Box>
          );
        })}
        <Select
          size="small" value="" displayEmpty
          onChange={(e) => patch(gi, (g) => { g[e.target.value] = domainOf(e.target.value)[0]; })}
          renderValue={() => "+ add a condition"}
          sx={{ alignSelf: "flex-start", fontSize: 13, color: MUTED, minWidth: 165 }}
        >
          {dims.filter((x) => !clauses.some(([c]) => c === x))
            .map((x) => <MenuItem key={x} value={x} sx={{ fontSize: fs }}>{label(x)}</MenuItem>)}
        </Select>
      </Stack>
    );
  };

  return (
    <Stack spacing={0.5}>
      {groups.map((group, gi) => (
        <Box key={gi}>
          {gi > 0 && (
            <Typography sx={{ fontSize: 13, color: MUTED, fontWeight: 600, py: 0.4 }}>or</Typography>
          )}
          {many ? (
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 0.6 }}>
              <Box sx={{ flex: 1, minWidth: 0, borderLeft: `2px solid ${MUTED}33`, pl: 1 }}>
                {groupBody(group, gi)}
              </Box>
              <IconButton
                size="small"
                title="remove this alternative"
                onClick={() => emit(groups.filter((_, i) => i !== gi))}
              >
                <DeleteOutlineIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Box>
          ) : groupBody(group, gi)}
        </Box>
      ))}

      {(many || Object.keys(groups[0]).length > 0) && (
        <Typography sx={{ fontSize: 12, color: MUTED }}>
          Pick several values for a dimension to mean “either of these”. Separate dimensions must all hold.
          {many && " Any one alternative matching is enough."}
        </Typography>
      )}

      <Button
        size="small" startIcon={<AddIcon sx={{ fontSize: 13 }} />}
        onClick={() => emit([...groups, {}])}
        sx={{ alignSelf: "flex-start", fontSize: 13, color: MUTED, textTransform: "none" }}
      >
        add an alternative
      </Button>
    </Stack>
  );
}
