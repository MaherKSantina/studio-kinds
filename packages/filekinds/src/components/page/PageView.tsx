/**
 * A `.page` open — the page its template makes from its model, and nothing
 * else: no heading, no toolbar; the host's strip names the file. The page
 * renders in `PageFrame`, the sandboxed frame a `.views` page view renders in
 * too. Nothing here writes the file.
 */
import React, { useMemo } from "react";
import { ViewerProps } from "../../lib/filePreviews";
import { parsePage } from "../../lib/pageDoc";
import { PageFrame } from "./PageFrame";

export default function PageView({ content, height = "100%" }: ViewerProps) {
  const doc = useMemo(() => parsePage(content), [content]);
  return <PageFrame page={doc} title={doc.title} height={height} />;
}
