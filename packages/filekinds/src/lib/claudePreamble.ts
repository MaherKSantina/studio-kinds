/**
 * THE PREAMBLE A FOLDER NEEDS FOR CLAUDE CODE — what the memory view's
 * "Prepare for Claude Code" button writes as `CLAUDE.md` beside the memory.
 *
 * A Claude Code session started inside a folder knows nothing of the suite:
 * its memory is per folder and starts empty. What it does read is every
 * `CLAUDE.md` from the working folder up through its parents. So one file
 * that points at the master playbook's guide, names the checker and the
 * shape of a Studio folder is enough for "which file type should this
 * be?" to get the suite's answer — in a folder that is still empty.
 */

export const CLAUDE_FILE = "CLAUDE.md";
/** The checker as the global command the Python package installs (`pip install studio-kinds`, or the
 *  release's wheel; on the dev machine `pip install -e python`) — the same words on every machine. */
export const CHECKER = "studio-check";

/** The file's text — `folder` is what to call the place (the folder's name); empty when the
 *  host cannot say (a memory at the root of the open folder names the folder, not itself). */
export function claudePreamble(folder: string): string {
  const name = folder.trim();
  return `# ${name ? `${name} — ` : ""}Studio documents

Every file in this folder and below is a Studio document picked by its extension — \`.brief\`,
\`.playbook\`, \`.kanban\`, \`.calendar\`, \`.policy\`, \`.flow\`, \`.jsonl\`, \`.middleware\`, \`.pipeline\`,
\`.collection\`, \`.clip\`, \`.song\` — and \`.md\` for anything else. The folder shows in the Studio (the web
front door over a folder, the desktop app, VS Code's Studio editor).

For anything touching these files, open the \`studio-files\` skill — the event **A Studio document is
asked for** in \`claude/claude.playbook\` of the studio-kinds repository, exported to
\`skills/studio-files/SKILL.md\` and shipped with every release — and follow it, including the question
"which file type should this be?": its "Which kind for what" table is the answer (a hierarchy of content → \`.brief\`;
event-based content under decision answers → \`.playbook\`; workflows tracked through one process →
\`.kanban\` + \`.calendar\`; rules that sort and filter → \`.policy\`; data rows → \`.jsonl\`; nothing fits → \`.md\`).

- Before writing a kind, read its spec: \`${CHECKER} --spec <ext>\`
- Start a new file from its template: \`${CHECKER} --template <ext> > new.<ext>\`
- Edit with the smallest change — ids are identity; comments do not survive a UI save.
- After EVERY edit: \`${CHECKER} <file>\` — exit 1 means the Studio will refuse it too.
- Open documents refresh from disk by themselves; refer to documents by their path.

Written by the Studio's "Prepare for Claude Code" button. What a task is about comes with
the task, not from this file.
`;
}
