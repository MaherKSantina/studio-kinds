/**
 * How a data value shows — in a grid cell and in the row dialog. A string that
 * is a URL is a LINK (opens in the browser: a new tab on the web, the system
 * browser from the desktop app and VS Code) with a copy button beside it that
 * puts the WHOLE link on the clipboard; everything else is text.
 */
import React, { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "crosscut";

export const isUrl = (t: string): boolean => /^https?:\/\/\S+$/i.test(t);

/** The clipboard, or the old selection dance where the clipboard API is refused. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* denied — try the fallback */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", "");
    ta.style.position = "fixed"; ta.style.opacity = "0"; ta.style.pointerEvents = "none";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch { return false; }
}

export function CopyButton({ text, label = "Copy link", className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => { if (!done) return; const t = setTimeout(() => setDone(false), 1400); return () => clearTimeout(t); }, [done]);
  return (
    <button type="button" aria-label={label} title={done ? "Copied" : label}
      onClick={(e) => { e.stopPropagation(); void copyText(text).then((ok) => setDone(ok)); }}
      className={cn("inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground", done && "text-green-700", className)}>
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}

/** A URL as a link that opens outside, the click not reaching the row underneath. */
export function LinkText({ href, className }: { href: string; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" title={href} onClick={(e) => e.stopPropagation()}
      className={cn("min-w-0 truncate text-primary underline underline-offset-2 hover:opacity-80", className)}>
      {href}
    </a>
  );
}

/** A grid cell: a link with its copy button, or the text truncated with the whole of it as the tooltip. */
export function CellContent({ text }: { text: string }) {
  if (isUrl(text)) {
    return (
      <span className="flex min-w-0 items-center gap-1">
        <LinkText href={text} />
        <CopyButton text={text} />
      </span>
    );
  }
  return <>{text}</>;
}
