/**
 * ONE DAY, drawn — the calendar face of a policy run whose buckets carry
 * timeslots. Every item lands as a block at its bucket's hours; items that
 * share a slot sit side by side; items whose bucket has no times wait in an
 * "Unscheduled" strip below the timeline, parked, not discarded.
 *
 * Pure presentation: the events arrive already fanned by the policy switch,
 * and clicking a block asks the SAME why-dialog the grouped list uses.
 */
import { Box, Stack, Tooltip, Typography } from "@mui/material";

export interface DayEvent {
  id: string;
  title: string;
  /** Small second line — who's involved, the bucket's name, etc. */
  detail?: string;
  /** Minutes since midnight. */
  start: number;
  end: number;
  onClick?: () => void;
}

const HOUR_PX = 76;
const GUTTER = 46;

const hhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Overlapping events split the width: transitive-overlap clusters first,
 *  then greedy lanes inside each cluster. */
function laidOut(events: DayEvent[]): { e: DayEvent; lane: number; lanes: number }[] {
  const sorted = [...events].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: { e: DayEvent; lane: number; lanes: number }[] = [];
  let cluster: { e: DayEvent; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    for (const m of cluster) out.push({ ...m, lanes: laneEnds.length });
    cluster = []; laneEnds = [];
  };
  for (const e of sorted) {
    if (e.start >= clusterEnd) { flush(); clusterEnd = e.end; }
    else clusterEnd = Math.max(clusterEnd, e.end);
    let lane = laneEnds.findIndex((end) => end <= e.start);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(e.end); }
    else laneEnds[lane] = e.end;
    cluster.push({ e, lane });
  }
  flush();
  return out;
}

export default function DaySchedule({ date, events, unscheduled = [] }: {
  /** "YYYY-MM-DD" — shown as the day's heading when given. */
  date?: string;
  events: DayEvent[];
  unscheduled?: { id: string; title: string; onClick?: () => void }[];
}) {
  const firstHour = events.length
    ? Math.floor(Math.min(...events.map((e) => e.start)) / 60) : 7;
  const lastHour = events.length
    ? Math.ceil(Math.max(...events.map((e) => e.end)) / 60) : 19;
  const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, i) => firstHour + i);
  const top = (min: number) => ((min - firstHour * 60) / 60) * HOUR_PX;
  const dayLabel = date
    ? new Date(`${date}T00:00:00`).toLocaleDateString(undefined,
        { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <Box sx={{ height: "100%", minHeight: 0, overflow: "auto", px: 1.25, pb: 1.25 }}>
      {dayLabel && (
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: "text.secondary", pt: 1, pb: 0.5 }}>
          {dayLabel}
        </Typography>
      )}

      <Box sx={{ position: "relative", height: (lastHour - firstHour) * HOUR_PX, mt: dayLabel ? 0 : 1 }}>
        {/* ── the hour grid ── */}
        {hours.map((h) => (
          <Box key={h} sx={{ position: "absolute", left: 0, right: 0, top: top(h * 60) }}>
            <Typography sx={{ position: "absolute", top: -6, width: GUTTER - 8, pr: 1,
                              fontSize: 12, textAlign: "right", color: "text.disabled",
                              fontVariantNumeric: "tabular-nums" }}>
              {hhmm(h * 60)}
            </Typography>
            <Box sx={{ ml: `${GUTTER}px`, borderTop: "1px solid", borderColor: "divider" }} />
          </Box>
        ))}

        {/* ── the events, side by side where they overlap ── */}
        {laidOut(events).map(({ e, lane, lanes }) => {
          const h = Math.max(((e.end - e.start) / 60) * HOUR_PX - 2, 16);
          const tight = h < 34;
          return (
            <Tooltip key={e.id} title={`${hhmm(e.start)}–${hhmm(e.end)} · ${e.title}${e.detail ? ` · ${e.detail}` : ""}`}>
              <Box onClick={e.onClick}
                sx={{ position: "absolute", top: top(e.start), height: h,
                      left: `calc(${GUTTER}px + ${(lane / lanes) * 100}% - ${(GUTTER * lane) / lanes}px)`,
                      width: `calc((100% - ${GUTTER}px) / ${lanes} - 3px)`,
                      border: "1px solid #4f46e555", borderLeft: "3px solid #4f46e5",
                      borderRadius: 1, bgcolor: "#4f46e514", px: 0.75, py: 0.25,
                      overflow: "hidden", cursor: e.onClick ? "pointer" : "default",
                      "&:hover": { borderColor: "#4f46e5", bgcolor: "#4f46e526" } }}>
                <Typography noWrap sx={{ fontSize: 13, fontWeight: 650, lineHeight: 1.25 }}>
                  {tight && <Box component="span" sx={{ color: "#4f46e5", fontWeight: 700, mr: 0.5,
                                                        fontVariantNumeric: "tabular-nums" }}>
                    {hhmm(e.start)}
                  </Box>}
                  {e.title}
                </Typography>
                {!tight && (
                  <Typography noWrap sx={{ fontSize: 12, color: "#4f46e5", fontWeight: 700,
                                           fontVariantNumeric: "tabular-nums" }}>
                    {hhmm(e.start)}–{hhmm(e.end)}
                    {e.detail && <Box component="span" sx={{ color: "text.secondary", fontWeight: 500 }}>
                      {" "}· {e.detail}
                    </Box>}
                  </Typography>
                )}
              </Box>
            </Tooltip>
          );
        })}
      </Box>

      {/* ── items whose bucket has no hours — visible, never dropped ── */}
      {unscheduled.length > 0 && (
        <Box sx={{ mt: 1.5 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
                            textTransform: "uppercase", color: "text.disabled", mb: 0.5 }}>
            Unscheduled
          </Typography>
          <Stack spacing={0.5}>
            {unscheduled.map((u) => (
              <Box key={u.id} onClick={u.onClick}
                sx={{ border: "1px dashed", borderColor: "divider", borderRadius: 1.5,
                      px: 1, py: 0.5, cursor: u.onClick ? "pointer" : "default",
                      "&:hover": { borderColor: "#4f46e5" } }}>
                <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{u.title}</Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      )}
    </Box>
  );
}
