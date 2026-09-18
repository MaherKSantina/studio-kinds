/**
 * GOLDEN RULES — is this a legal file/folder name here?
 *
 * The UI derives `NameCtx` with `nameCtxOf` and asks the table. Anything the
 * save dialog, rename dialog or new-folder prompt does with a name goes
 * through here — there is no second validator hiding in a component.
 */
import { DecisionTable, decide, gt } from "../decision/decisionTable";

export interface NameCtx {
  empty: boolean;
  /** Contains / or \ — names are single segments, paths are built elsewhere. */
  hasSlash: boolean;
  /** Windows-hostile characters: < > : " | ? * or control chars. */
  hasIllegal: boolean;
  /** Leading or trailing whitespace, or a trailing dot. */
  untrimmed: boolean;
  /** Case-insensitive clash with an existing sibling. */
  duplicate: boolean;
  length: number;
}

export type NameVerdict = { ok: true } | { ok: false; error: string };

export const nameRules: DecisionTable<NameCtx, NameVerdict> = {
  name: "fs-name",
  answers: "Can this string be used as a file or folder name in the current folder?",
  rules: [
    { rule: "empty", because: "a nameless node is unaddressable", when: { empty: true }, then: { ok: false, error: "Name is required" } },
    { rule: "slash", because: "names are single path segments; folders are made in the tree, not by typing separators", when: { hasSlash: true }, then: { ok: false, error: "Name cannot contain / or \\" } },
    { rule: "illegal", because: "these characters break Windows paths and URLs", when: { hasIllegal: true }, then: { ok: false, error: 'Name cannot contain < > : " | ? *' } },
    { rule: "untrimmed", because: "invisible whitespace and trailing dots make two names look identical", when: { untrimmed: true }, then: { ok: false, error: "Name cannot start/end with spaces or end with a dot" } },
    { rule: "too-long", because: "keep paths comfortably inside OS and URL limits", when: { length: gt(120) }, then: { ok: false, error: "Name is too long (max 120)" } },
    { rule: "duplicate", because: "sibling names are unique case-insensitively so files survive a case-insensitive disk", when: { duplicate: true }, then: { ok: false, error: "Something with this name already exists here" } },
  ],
  otherwise: { ok: true },
};

const ILLEGAL = new RegExp('[<>:"|?*\u0000-\u001F]');

export const nameCtxOf = (name: string, siblingNames: string[]): NameCtx => ({
  empty: name.length === 0,
  hasSlash: name.includes("/") || name.includes("\\"),
  hasIllegal: ILLEGAL.test(name),
  untrimmed: name !== name.trim() || name.endsWith("."),
  duplicate: siblingNames.some((s) => s.toLowerCase() === name.toLowerCase()),
  length: name.length,
});

export const validateName = (name: string, siblingNames: string[]): NameVerdict =>
  decide(nameRules, nameCtxOf(name, siblingNames)).outcome;
