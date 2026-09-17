import { useMemo } from "react";
import { parseBrief } from "../../kinds/briefDoc";
import type { FeatureNode } from "../../kinds/featureTree";
import Markdown from "./Markdown";

function Sections({ nodes, depth = 0 }: { nodes: FeatureNode[]; depth?: number }) {
  return (
    <>
      {nodes.map((n, i) => (
        <details key={i} open className="section" style={{ marginLeft: depth ? 14 : 0 }}>
          <summary>
            <span className="stitle">{n.name || "Untitled"}</span>
            {n.description && <span className="sdesc"> — {n.description}</span>}
          </summary>
          {n.prose && <Markdown text={n.prose} />}
          {n.children?.length ? <Sections nodes={n.children} depth={depth + 1} /> : null}
        </details>
      ))}
    </>
  );
}

/** A brief: a title, a line, and titled sections with markdown bodies, nested. */
export default function BriefView({ text }: { text: string }) {
  const doc = useMemo(() => parseBrief(text), [text]);
  return (
    <div className="brief">
      {doc.title && <h2 className="btitle">{doc.title}</h2>}
      {doc.description && <p className="bdesc muted">{doc.description}</p>}
      {doc.sections.length
        ? <Sections nodes={doc.sections} />
        : <p className="muted">An empty brief — no sections yet.</p>}
    </div>
  );
}
