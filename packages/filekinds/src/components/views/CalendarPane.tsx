/**
 * The calendar of a `.views` document, drawn by FullCalendar in its shadcn theme on the kit's tokens
 * (EventCalendarViews). The week and the day are a time grid — the hours down the side, every item with a time a
 * block placed by the clock from its start to its end, items at the same hours side by side, the items of days alone
 * in the all-day row above the hours — and the month a grid of weeks. The header is the Studio's own: the span in
 * words, ‹ ›, Today, First item and Day | Week | Month; it drives the calendar through its controller, and the scale
 * and the day are the host's per view (CalendarState). Times are the file's clock, in no zone. Loaded when a calendar
 * first opens; nothing here writes the file.
 */
import { useEffect, useMemo, useState } from "react";
import { useCalendarController, type EventDisplayInfo } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "crosscut";
import {
  CALENDAR_SCALES, calendarEntryOf, columnsOf, firstHourOf, isTimed, localDay, sameSpan, shiftCalendar, spanText, spanTitle,
  type CalendarScale, type ViewsItem,
} from "../../lib/viewsDoc";
import { EventCalendarViews } from "../calendar/EventCalendarViews";
import { colorOf } from "./ItemDialog";
import { Apart, DocMark, NAV, docWords, type CalendarState, type PaneProps } from "./panes";

const PLUGINS = [dayGridPlugin, timeGridPlugin];
/** The calendar's own view for each scale. */
const VIEW_OF: Record<CalendarScale, string> = { day: "timeGridDay", week: "timeGridWeek", month: "dayGridMonth" };
const SCALE_LABEL: Record<CalendarScale, string> = { day: "Day", week: "Week", month: "Month" };
/** The clock as the file writes it: 24 hours, two digits each. */
const CLOCK = { hour: "2-digit", minute: "2-digit", hour12: false } as const;

export default function CalendarPane({ doc, onOpen, calendar, onCalendar }: PaneProps) {
  const columns = useMemo(() => columnsOf(doc), [doc]);
  const dated = useMemo(() => doc.items.filter((it) => it.start), [doc.items]);
  const undated = useMemo(() => doc.items.filter((it) => !it.start), [doc.items]);
  const byId = useMemo(() => new Map(doc.items.map((it) => [it.id, it])), [doc.items]);
  const today = localDay();
  const first = dated.length ? dated.map((it) => it.start!).sort()[0] : today;
  // Until a scale or a day is picked: the earliest start, on the week when an item has a time, else on its month.
  const [own, setOwn] = useState<CalendarState | null>(null);
  const { scale, day }: CalendarState = calendar ?? own ?? { scale: dated.some(isTimed) ? "week" : "month", day: first };
  const set = (next: Partial<CalendarState>) => (onCalendar ?? setOwn)({ scale, day, ...next });
  const events = useMemo(() => dated.map((it) => ({ ...calendarEntryOf(it)!, color: colorOf(it, columns), contrastColor: "#ffffff" })),
    [dated, columns]);
  const controller = useCalendarController();
  // The header's scale and day are the calendar's: it follows them, and never moves on its own.
  useEffect(() => {
    if (controller.view?.type !== VIEW_OF[scale]) controller.changeView(VIEW_OF[scale]);
    const at = controller.getDate();
    if (!at || localDay(at) !== day) controller.gotoDate(day);
  }, [controller, scale, day]);

  /** An item's block, bar or line: the calendar's own time and title — a timed item that lasts a day or more, laid
   *  all day, its start time — the mark of a document the item holds, and the item in words on hover. */
  const content = (info: EventDisplayInfo) => {
    const item: ViewsItem | undefined = byId.get(info.event.id);
    const tip = item ? `${item.title} · ${spanText(item)}${docWords(item)}` : info.event.title;
    const time = info.timeText || (info.event.allDay && info.isStart && item?.startTime) || "";
    return (
      <>
        {time && <div className={info.timeClass || "shrink-0 ps-1 font-bold"} title={tip}>{time}</div>}
        <div className={cn(info.titleClass, "flex items-center gap-1")} title={tip}>
          <span className="min-w-0 truncate">{info.event.title || " "}</span>
          {item && <DocMark item={item} />}
        </div>
      </>
    );
  };

  return (
    <div className="flex h-full min-h-[360px] flex-col">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">{spanTitle(scale, day)}</h3>
        <button type="button" className={NAV} title={`The ${scale} before`} onClick={() => set({ day: shiftCalendar(day, scale, -1) })}><ChevronLeft className="size-3" /></button>
        <button type="button" className={NAV} title={`The ${scale} after`} onClick={() => set({ day: shiftCalendar(day, scale, 1) })}><ChevronRight className="size-3" /></button>
        <button type="button" className={NAV} onClick={() => set({ day: today })}>Today</button>
        {!sameSpan(scale, first, today) && <button type="button" className={NAV} onClick={() => set({ day: first })}>First item</button>}
        <div role="group" aria-label="Show a day, a week or a month" className="ml-auto flex rounded-md border p-0.5">
          {CALENDAR_SCALES.map((s) => (
            <button key={s} type="button" aria-pressed={s === scale} onClick={() => set({ scale: s })}
              className={cn("rounded px-2 py-0.5 text-xs font-medium",
                s === scale ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {SCALE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-1.5 min-h-0 flex-1 text-sm">
        <EventCalendarViews
          controller={controller}
          plugins={PLUGINS}
          initialView={VIEW_OF[scale]}
          initialDate={day}
          height="100%"
          firstDay={1}
          nowIndicator
          navLinks
          navLinkDayClick={(date: Date) => set({ scale: "day", day: localDay(date) })}
          dayMaxEvents
          scrollTime={firstHourOf(dated)}
          defaultTimedEventDuration="00:30"
          eventTimeFormat={CLOCK}
          slotHeaderFormat={CLOCK}
          events={events}
          eventClick={(info) => { info.jsEvent.preventDefault(); onOpen(info.event.id); }}
          eventContent={content}
          popoverCloseContent={() => <X className="size-5 text-muted-foreground group-hover:text-foreground" />}
        />
      </div>
      <Apart what="No start date:" items={undated} onOpen={onOpen} />
    </div>
  );
}
