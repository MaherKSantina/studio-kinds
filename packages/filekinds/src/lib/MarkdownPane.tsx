import React from "react";
import "./markdown.css";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { rawFileUrlFor } from "../api";

/** A document's markdown. Given the document's store path (`path`, or the
 *  registry's `agentId`), relative image and link targets resolve INSIDE the
 *  store — a handover page shows the PNGs saved beside it — while web,
 *  data and anchor urls pass through untouched. */
export const MarkdownPane: React.FC<{ content: string; height?: number | string; breaks?: boolean; path?: string; agentId?: string }> = ({
  content, height = "100%", breaks, path, agentId,
}) => {
  const docPath = path ?? agentId;
  const urlTransform = React.useCallback((url: string) => {
    if (docPath && url && !/^([a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(url)) return rawFileUrlFor(docPath, url) ?? defaultUrlTransform(url);
    return defaultUrlTransform(url);
  }, [docPath]);
  return (
    <div className="md-body" style={{ height, overflowY: height === "auto" ? "visible" : "auto" }}>
      <ReactMarkdown remarkPlugins={breaks ? [remarkGfm, remarkBreaks] : [remarkGfm]} urlTransform={urlTransform}>{content}</ReactMarkdown>
    </div>
  );
};
