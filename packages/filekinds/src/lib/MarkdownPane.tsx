import React from "react";
import "./markdown.css";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { isRemoteUrl, rawFileUrlFor, remoteContentAllowed } from "../api";

/** A remote image when remote content is off: the URL, shown, not fetched. */
const HeldImage: React.FC<React.ImgHTMLAttributes<HTMLImageElement>> = (props) => {
  const src = props.src ?? "";
  if (!isRemoteUrl(src) || remoteContentAllowed()) return <img {...props} />;
  return (
    <span className="md-held-image" title="Remote content is off in this Studio — the image is not fetched">
      🖼 {props.alt ? `${props.alt} — ` : ""}<code>{src}</code>
    </span>
  );
};

/** A document's markdown. Given the document's store path (`path`, or the
 *  registry's `agentId`), relative image and link targets resolve INSIDE the
 *  store — a handover page shows the PNGs saved beside it — while web,
 *  data and anchor urls pass through untouched. A remote image is fetched
 *  only when the host allows remote content (`configureFileKinds`). */
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
      <ReactMarkdown remarkPlugins={breaks ? [remarkGfm, remarkBreaks] : [remarkGfm]} urlTransform={urlTransform} components={{ img: HeldImage }}>{content}</ReactMarkdown>
    </div>
  );
};
