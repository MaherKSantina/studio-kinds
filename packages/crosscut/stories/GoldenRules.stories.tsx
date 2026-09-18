/**
 * The golden rules tables, rendered FROM the live tables — documentation that
 * cannot drift from the implementation.
 */
import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { DecisionTable, tableToMarkdown } from "../src/decision/decisionTable";
import { autosaveRules } from "../src/autosave/autosaveRules";
import { nameRules } from "../src/fs/nameRules";
import { pickerRules } from "../src/fs/pickerRules";
import { entryRules } from "../src/fs/entryRules";

function Table({ table }: { table: DecisionTable<never, unknown> }) {
  const md = tableToMarkdown(table as DecisionTable<object, unknown>);
  const lines = md.split("\n");
  const rows = lines.filter((l) => l.startsWith("|")).map((l) => l.slice(1, -1).split(" | ").map((c) => c.trim()));
  const [header, , ...body] = rows;
  return (
    <section className="mb-8">
      <h3 className="mb-1 font-mono text-sm font-semibold">{table.name}</h3>
      <p className="mb-2 text-sm text-muted-foreground">{table.answers}</p>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/60">
            <tr>{header.map((h, i) => <th key={i} className="px-2 py-1.5 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {body.map((r, i) => (
              <tr key={i} className="border-t align-top">
                {r.map((c, j) => (
                  <td key={j} className={j === 0 ? "px-2 py-1.5 font-mono whitespace-nowrap" : "px-2 py-1.5"}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const meta: Meta = { title: "Golden rules/Tables" };
export default meta;

export const AllTables: StoryObj = {
  render: () => (
    <div className="mx-auto max-w-4xl p-6">
      <p className="mb-6 text-sm text-muted-foreground">
        Each table is the single source of truth for one behaviour. The UI calls <code>decide(table, ctx)</code>;
        vitest golden files pin every row. What you read here is generated from the live objects.
      </p>
      <Table table={autosaveRules as never} />
      <Table table={nameRules as never} />
      <Table table={pickerRules as never} />
      <Table table={entryRules as never} />
    </div>
  ),
};
