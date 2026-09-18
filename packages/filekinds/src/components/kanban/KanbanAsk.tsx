/**
 * The board's Ask — the shared panel (crosscut) aimed at a card or a column:
 * click one to aim there, type a line, the board changes. The vocabulary is
 * filekinds' kanbanAsk; the edit lands through the host's onChange like any
 * other, and Undo restores the text from before the turn.
 */
import * as React from "react";
import { AskPanel, type AskApi, type AskTargetChip } from "crosscut";
import { parseKanban } from "../../lib/kanbanDoc";
import { findColumn, findTask } from "../../lib/kanbanEdit";
import {
  KANBAN_ASK_SCHEMA, type KanbanAskTarget, applyKanbanOps, kanbanAskSystem, kanbanAskUser, parseKanbanAskReply,
} from "../../lib/kanbanAsk";

const EXAMPLES = [
  "add a task to rehearse the demo, after the dry run", "move it to Done", "rename Doing to In progress",
  "split this into three tasks", "a Blocked column before Done",
];

export default function KanbanAsk({ api, content, target, onApplied, onAim, focusKey, onClose, resetKey }: {
  api: AskApi;
  /** The file as it is now — what the model reads and what an edit starts from. */
  content: string;
  target: KanbanAskTarget;
  /** The next text, and the task the last op created or changed (worth aiming at). */
  onApplied: (next: string, focusKey: string | null) => void;
  /** Aim elsewhere — a chip's × narrows the aim to the board. */
  onAim: (next: KanbanAskTarget) => void;
  focusKey?: number;
  onClose?: () => void;
  resetKey?: string;
}) {
  const doc = React.useMemo(() => parseKanban(content), [content]);
  const task = target.taskKey ? findTask(doc, target.taskKey) : undefined;
  const column = target.column ? findColumn(doc, target.column) : undefined;
  const chips: AskTargetChip[] = [
    ...(task ? [{ label: task.title, detail: task.key, onClear: () => onAim({ ...target, taskKey: null }) }] : []),
    ...(column ? [{ label: column.title, detail: "column", onClear: () => onAim({ ...target, column: null }) }] : []),
  ];
  return (
    <AskPanel
      api={api}
      target={chips}
      targetHint="the whole board — click a card or a column title to aim there"
      placeholder={task ? `What about “${task.title}”?` : column ? `What should change in ${column.title}?` : "What should change on the board?"}
      examples={EXAMPLES}
      compose={(instruction, history) => ({
        system: kanbanAskSystem(),
        user: kanbanAskUser(content, target, instruction, history),
        schema: KANBAN_ASK_SCHEMA,
      })}
      apply={(output) => {
        const reply = parseKanbanAskReply(output);
        const r = applyKanbanOps(content, reply.ops, target);
        if (r.applied.length) onApplied(r.content, r.focusKey);
        return { say: reply.say, applied: r.applied, skipped: r.skipped };
      }}
      snapshot={() => content}
      onRestore={(before) => onApplied(before, null)}
      resetKey={resetKey}
      focusKey={focusKey}
      onClose={onClose}
    />
  );
}
