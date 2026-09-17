import BriefView from "./BriefView";
import Markdown from "./Markdown";
import PlaybookView from "./PlaybookView";

/** The document rendered by its kind — the same dispatch a written entry inside a playbook uses. */
export default function Preview({ kind, text }: { kind: string; text: string }) {
  switch (kind) {
    case "playbook": return <PlaybookView text={text} />;
    case "brief": return <BriefView text={text} />;
    case "md": return <Markdown text={text} />;
    default: return <pre className="raw">{text}</pre>;
  }
}
