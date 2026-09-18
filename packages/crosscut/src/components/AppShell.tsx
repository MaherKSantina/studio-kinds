/**
 * The Google-Docs-style application frame every suite tool sits in:
 * product mark · document title · autosave chip on the top row, a File/Edit/…
 * menubar underneath, and the document surface filling the rest.
 *
 * Menus are DATA (`AppMenu[]`) so each tool declares its commands and the
 * shell stays generic. The autosave chip renders `useAutosave` state directly.
 */
import * as React from "react";
import { AlertCircle, Check, CloudUpload } from "lucide-react";
import { cn } from "../lib/cn";
import { AutosaveState } from "../autosave/autosaveRules";
import {
  Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarSeparator, MenubarShortcut, MenubarTrigger,
} from "./ui/menubar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

export interface MenuAction {
  label: string;
  onSelect?: () => void;
  disabled?: boolean;
  shortcut?: string;
  /** Draw a separator above this item. */
  separatorBefore?: boolean;
}

export interface AppMenu {
  label: string;
  items: MenuAction[];
}

export interface AutosaveInfo {
  state: AutosaveState;
  lastSavedAt: Date | null;
  lastError?: string | null;
}

export function AutosaveChip({ autosave }: { autosave: AutosaveInfo }) {
  const { state, lastSavedAt, lastError } = autosave;
  if (state === "idle") return null;
  const view =
    state === "error"
      ? { icon: <AlertCircle className="size-3.5" />, text: "Not saved", cls: "text-destructive" }
      : state === "saved"
        ? { icon: <Check className="size-3.5" />, text: "Saved", cls: "text-muted-foreground" }
        : { icon: <CloudUpload className="size-3.5 animate-pulse" />, text: "Saving…", cls: "text-muted-foreground" };
  const tip =
    state === "error"
      ? lastError ?? "The last save failed"
      : lastSavedAt
        ? `Last saved ${lastSavedAt.toLocaleTimeString()}`
        : "Changes save automatically";
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span data-testid="autosave-chip" className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs", view.cls)}>
            {view.icon}
            {view.text}
          </span>
        </TooltipTrigger>
        <TooltipContent>{tip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export interface AppShellProps {
  appName: string;
  /** Small square mark, e.g. a lucide icon in a colored rounded box. */
  logo?: React.ReactNode;
  /** Where the logo ("All tools") leads — the tool launcher, `/suite/` since 2026-09-14 (the domain root is the
   *  Studio over C:\Github). Same window, always. `null` = a plain mark, no link (the desktop). */
  homeHref?: string | null;
  /** Open document's display name; null renders the app name alone. */
  docTitle?: string | null;
  /** Muted full path next to the title. */
  docPath?: string | null;
  /** Menubar rows under the title; omit (or pass none) for a shell without menus — the Studio's. */
  menus?: AppMenu[];
  autosave?: AutosaveInfo | null;
  /** Right side of the top row (buttons, avatars…). */
  right?: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({ appName, logo, homeHref = "/suite/", docTitle, docPath, menus, autosave, right, children }: AppShellProps) {
  // Mirror the frame into the browser tab: "Doc | App" while a document is
  // open, the bare app name otherwise (same as each tool's static <title>).
  React.useEffect(() => {
    document.title = docTitle ? `${docTitle} | ${appName}` : appName;
  }, [docTitle, appName]);
  return (
    // 100dvh where supported: on phones 100vh extends behind the browser's
    // collapsing chrome, hiding anything anchored to the bottom (trail dots).
    <div className="flex h-screen min-h-0 flex-col bg-background text-foreground"
         style={{ height: "100dvh" }}>
      {/* Compact on a phone — smaller mark, tighter rows — so the header
          takes a strip and not a band. */}
      <header className="shrink-0 border-b bg-card px-3 pt-1 sm:pt-2">
        <div className="flex items-start gap-2 sm:gap-3">
          {logo && (homeHref === null ? (
            <span className="mt-0.5 flex size-8 items-center justify-center rounded-lg sm:size-10">{logo}</span>
          ) : (
            <a href={homeHref} title="All tools"
               className="mt-0.5 flex size-8 items-center justify-center rounded-lg transition-transform hover:scale-105 sm:size-10">
              {logo}
            </a>
          ))}
          <div className="min-w-0 flex-1">
            <div className="flex h-6 items-center gap-2 sm:h-7">
              <span className="truncate text-[13px] font-medium sm:text-[15px]">
                {docTitle ?? appName}
              </span>
              {docTitle && docPath && (
                <span className="hidden truncate text-xs text-muted-foreground sm:inline">{docPath}</span>
              )}
              {autosave && <AutosaveChip autosave={autosave} />}
            </div>
            {menus && menus.length > 0 && (
            <Menubar className="-ml-2.5">
              {menus.map((m) => (
                <MenubarMenu key={m.label}>
                  <MenubarTrigger>{m.label}</MenubarTrigger>
                  <MenubarContent>
                    {m.items.map((it, i) => (
                      <React.Fragment key={`${it.label}-${i}`}>
                        {it.separatorBefore && <MenubarSeparator />}
                        <MenubarItem disabled={it.disabled} onSelect={() => it.onSelect?.()}>
                          {it.label}
                          {it.shortcut && <MenubarShortcut>{it.shortcut}</MenubarShortcut>}
                        </MenubarItem>
                      </React.Fragment>
                    ))}
                  </MenubarContent>
                </MenubarMenu>
              ))}
            </Menubar>
            )}
          </div>
          {right && <div className="flex h-10 items-center gap-2">{right}</div>}
        </div>
      </header>
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}
