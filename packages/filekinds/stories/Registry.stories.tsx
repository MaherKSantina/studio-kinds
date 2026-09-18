/** The registry and its open-with table, rendered from the live objects. */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { tableToMarkdown } from "crosscut";
import { FILE_KINDS } from "../src/lib/filePreviews";
import { openWithRules } from "../src/openWith";

const meta: Meta = { title: "File kinds/Registry" };
export default meta;

export const Registry: StoryObj = {
  render: () => (
    <div className="mx-auto max-w-3xl p-6">
      <h2 className="mb-1 text-lg font-semibold">File-kind registry</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        One row per kind. A kind's studio authors it; every tool views it read-only through this table.
      </p>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/60">
            <tr><th className="px-3 py-2">kind</th><th className="px-3 py-2">extensions</th><th className="px-3 py-2">studio</th></tr>
          </thead>
          <tbody>
            {FILE_KINDS.map((k) => (
              <tr key={k.key} className="border-t">
                <td className="px-3 py-2 font-mono">{k.key}</td>
                <td className="px-3 py-2">{k.extensions.map((e) => `.${e}`).join("  ")}</td>
                <td className="px-3 py-2">{k.studioPath ?? <span className="text-muted-foreground">— (raw editor; viewable everywhere)</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="mb-2 mt-6 font-mono text-sm font-semibold">open-with (golden table)</h3>
      <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{tableToMarkdown(openWithRules as never)}</pre>
    </div>
  ),
};
