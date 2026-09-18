/**
 * A list with ONE optional dimension — the suite's start-simple list.
 *
 *   <OneDList items renderItem keyOf />                          flat
 *   <OneDList ... dimension={{ of }} mode="headings" />          grouped titles
 *   <OneDList ... dimension={{ of }} mode="filter" />            pills on top
 *
 * Upgrading a tool from a plain list to a grouped or filterable one -- or
 * downgrading back -- is exactly that one-line diff; items and rows are
 * untouched. Grouping semantics live in lists/oneD.ts (golden-tested).
 */
import * as React from "react";
import { cn } from "../lib/cn";
import { Search, X } from "lucide-react";
import { Dimension, groupItems, searchItems, visibleItems } from "../lists/oneD";

export interface OneDListProps<T> {
  items: T[];
  keyOf: (item: T) => string;
  renderItem: (item: T, index: number) => React.ReactNode;
  /** The one dimension. Omit for a flat list. */
  dimension?: Dimension<T>;
  /** How the dimension presents. Default "headings". */
  mode?: "headings" | "filter";
  /** filter mode: controlled selection (null = All). Uncontrolled when omitted. */
  selected?: string | null;
  onSelect?: (key: string | null) => void;
  /** filter mode: offer the All pill. Default true. */
  allowAll?: boolean;
  /** filter mode: show item counts on the pills. Default true. */
  showCounts?: boolean;
  /** Text to fuzzy-search per item. Presence renders the search box —
   *  local, instant, no debounce; matching filters and never reorders. */
  search?: (item: T) => string;
  /** Placeholder for the search box. */
  searchPlaceholder?: string;
  /** Rendered when there is nothing to list. */
  empty?: React.ReactNode;
  /** Gap between rows (tailwind gap class). Default "gap-1". */
  gapClass?: string;
  className?: string;
}

export function OneDList<T>({
  items, keyOf, renderItem, dimension, mode = "headings",
  selected, onSelect, allowAll = true, showCounts = true,
  search, searchPlaceholder = "Search",
  empty = null, gapClass = "gap-1", className,
}: OneDListProps<T>) {
  const [ownSelected, setOwnSelected] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const sel = selected !== undefined ? selected : ownSelected;
  const select = (k: string | null) => { setOwnSelected(k); onSelect?.(k); };

  if (!items.length) return <div className={className}>{empty}</div>;

  const matched = search ? searchItems(items, search, query) : items;

  const searchBox = search ? (
    <div className="relative mb-1.5">
      <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={searchPlaceholder}
        className="h-6 w-full rounded-md border border-input bg-transparent pl-6 pr-6 text-[13px] outline-none placeholder:text-muted-foreground/60 focus:border-ring"
      />
      {query && (
        <button type="button" aria-label="Clear search"
          onClick={() => setQuery("")}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
          <X className="size-3" />
        </button>
      )}
    </div>
  ) : null;

  const noMatches = query.trim() && !matched.length
    ? <p className="py-2 text-xs text-muted-foreground">No matches.</p>
    : null;

  /* Flat: no dimension, no ceremony. */
  if (!dimension) {
    return (
      <div className={className}>
        {searchBox}
        <div className={cn("flex flex-col", gapClass)}>
          {matched.map((it, i) => <React.Fragment key={keyOf(it)}>{renderItem(it, i)}</React.Fragment>)}
        </div>
        {noMatches}
      </div>
    );
  }

  /* Search runs BEFORE grouping: groups, headings and pill counts all
     describe the matched universe. */
  const groups = groupItems(matched, dimension);

  if (mode === "filter") {
    const shown = visibleItems(groups, sel);
    const pill = (key: string | null, label: string, count: number) => {
      const on = sel === key;
      return (
        <button key={key ?? "__all"} type="button" aria-pressed={on}
          onClick={() => select(key)}
          className={cn(
            "select-none rounded-full border px-2 py-0.5 text-xs leading-normal",
            on ? "border-transparent bg-foreground/90 font-medium text-background"
               : "border-input text-foreground/80 hover:bg-accent",
          )}>
          {label}{showCounts && <span className={cn("ml-1", on ? "opacity-70" : "text-muted-foreground")}>{count}</span>}
        </button>
      );
    };
    return (
      <div className={cn("flex min-h-0 flex-col", className)}>
        {searchBox}
        <div className="mb-1.5 flex flex-wrap gap-1">
          {allowAll && pill(null, "All", matched.length)}
          {groups.map((g) => pill(g.key, g.label, g.items.length))}
        </div>
        <div className={cn("flex min-h-0 flex-col", gapClass)}>
          {shown.length
            ? shown.map((it, i) => <React.Fragment key={keyOf(it)}>{renderItem(it, i)}</React.Fragment>)
            : noMatches ?? <p className="py-2 text-xs text-muted-foreground">Nothing in this group.</p>}
        </div>
      </div>
    );
  }

  /* headings */
  return (
    <div className={className}>
      {searchBox}
      {noMatches}
      <div className={cn("flex flex-col", gapClass)}>
      {groups.map((g, gi) => (
        <React.Fragment key={g.key || "__fallback"}>
          <p className={cn("text-xs font-bold uppercase tracking-[0.07em] text-muted-foreground/80",
                           gi > 0 && "mt-2")}>
            {g.label}
          </p>
          {g.items.map((it, i) => <React.Fragment key={keyOf(it)}>{renderItem(it, i)}</React.Fragment>)}
        </React.Fragment>
      ))}
      </div>
    </div>
  );
}
