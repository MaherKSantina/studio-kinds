import { DecisionTable, gt } from "crosscut";

export interface EventDetailCtx {
  /** Content files attached to this event. */
  sources: number;
  /** The rule has inline `process` prose. */
  hasProcess: boolean;
}

export interface EventDetailVerdict {
  show: "file-bare" | "process" | "panels" | "empty";
}

export const eventDetailRules: DecisionTable<EventDetailCtx, EventDetailVerdict> = {
  name: "event-detail",
  answers: "What does an expanded playbook event render as its detail?",
  rules: [
    { rule: "one-file", because: "one attached file IS the detail — bare, no chrome, no prose stacked above it", when: { sources: 1 }, then: { show: "file-bare" } },
    { rule: "many-files", because: "several files need their headers to tell them apart", when: { sources: gt(1) }, then: { show: "panels" } },
    { rule: "prose-only", because: "no file yet — the inline process prose is the fallback detail", when: { hasProcess: true }, then: { show: "process" } },
  ],
  otherwise: { show: "empty" },
};
