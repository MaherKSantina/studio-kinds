import DOMPurify from "dompurify";
import { marked } from "marked";
import { useMemo } from "react";

/** Markdown to HTML, sanitised: the text is the viewer's own, but a page with a public URL takes no chances. */
export default function Markdown({ text }: { text: string }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(text, { async: false })), [text]);
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}
