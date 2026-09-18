/**
 * THE JOURNEY CATALOG — the staged-journey engine, component by component,
 * as a storybook-like page: the left rail groups every component that can
 * stand in a journey by the question it answers; the canvas renders each
 * story's states with the REAL engine over real demo files in the shared
 * store, so every state is also a copy-paste template. The data is
 * `journeyCatalogData.ts`; the Studio mounts this at `?catalog=journey` (it was
 * Journey Studio's whole surface until 2026-09-12).
 */
import * as React from "react";
import { browseFolder } from "../../lib/studioDialog";
import { parseJourneyStages, parseJourneyVariants } from "../../lib/journeyStages";
import JourneyStagesView from "./JourneyStagesView";
import JourneyVariantsView from "./JourneyVariantsView";
import { type CatalogState, type CatalogStory, JOURNEY_CATALOG, journeyCatalogStory } from "./journeyCatalogData";

const DEMO_BASE = "/Journey Studio/story.definition";

function StateCanvas({ state }: { state: CatalogState }) {
  const doc = React.useMemo(() => {
    try { return parseJourneyStages(state.yaml); } catch { return null; }
  }, [state.yaml]);
  const variants = React.useMemo(() => {
    try { return doc ? null : parseJourneyVariants(state.yaml); } catch { return null; }
  }, [doc, state.yaml]);
  const [showYaml, setShowYaml] = React.useState(false);
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-baseline gap-2 border-b px-3 py-2">
        <span className="text-sm font-semibold">{state.label}</span>
        {state.note && <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{state.note}</span>}
        <button type="button"
          className="ml-auto shrink-0 rounded border px-2 py-0.5 text-[13px] font-medium text-muted-foreground hover:bg-accent"
          onClick={() => setShowYaml((v) => !v)}>
          {showYaml ? "hide YAML" : "YAML"}
        </button>
      </div>
      {showYaml && (
        <pre className="max-h-64 overflow-auto border-b bg-muted/40 px-3 py-2 text-[13px] leading-relaxed">
          {state.yaml}
        </pre>
      )}
      <div style={{ height: state.height ?? 420 }}>
        {doc && <JourneyStagesView doc={doc} basePath={DEMO_BASE} />}
        {variants && <JourneyVariantsView doc={variants} basePath={DEMO_BASE} />}
        {!doc && !variants && (
          <p className="p-4 text-sm text-destructive">This state's YAML did not parse — no `stages:` or `variants:`?</p>
        )}
      </div>
    </div>
  );
}

function StoryPage({ story, groupTitle }: { story: CatalogStory; groupTitle: string }) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{groupTitle}</p>
        <h1 className="mt-0.5 text-lg font-semibold">
          <span className="mr-2 text-primary">{story.glyph}</span>{story.title}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{story.when}</p>
      </div>
      {story.states.map((s) => <StateCanvas key={s.label} state={s} />)}
    </div>
  );
}

function CatalogWelcome() {
  return (
    <div className="mx-auto max-w-2xl p-10">
      <h1 className="text-xl font-semibold">Journey catalog</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        The staged journey in parts: stages stack vertically, lanes and columns stand side by
        side, the one/many action lives on the boundary as a glyph — ⇒ collate, ⇉ fan out,
        → apply. Pick a component on the left; every state you see is live — the real engine
        over real demo files — and its YAML is a template you can lift into any
        <code className="mx-1 rounded bg-muted px-1">.definition</code>.
      </p>
      <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
        {JOURNEY_CATALOG.map((g) => (
          <li key={g.id}><span className="font-medium text-foreground">{g.title}</span> — {g.blurb}</li>
        ))}
      </ul>
      <button type="button" className="mt-4 inline-block text-xs text-muted-foreground underline"
        onClick={() => browseFolder("/Journey Studio/demo")}>
        The demo files
      </button>
    </div>
  );
}

export default function JourneyCatalog({ storyId, onPick }: { storyId: string | null; onPick: (id: string | null) => void }) {
  const current = journeyCatalogStory(storyId);
  return (
    <div className="flex h-full bg-background text-foreground">
      <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-r">
        <button type="button" className="px-4 pb-1 pt-4 text-left" onClick={() => onPick(null)}>
          <span className="block text-[13px] text-muted-foreground">the staged journey, in parts</span>
        </button>
        {JOURNEY_CATALOG.map((g) => (
          <div key={g.id} className="px-2 py-2">
            <p className="px-2 pb-1 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
              {g.title}
            </p>
            {g.stories.map((s) => (
              <button key={s.id} type="button"
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent ${
                  s.id === storyId ? "bg-accent font-medium" : ""}`}
                onClick={() => onPick(s.id)}>
                <span className="w-6 shrink-0 text-center text-xs text-primary">{s.glyph}</span>
                <span className="min-w-0 flex-1 truncate">{s.title}</span>
              </button>
            ))}
          </div>
        ))}
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        {current ? <StoryPage story={current.story} groupTitle={current.group.title} /> : <CatalogWelcome />}
      </main>
    </div>
  );
}
