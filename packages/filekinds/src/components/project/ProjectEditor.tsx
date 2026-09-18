/**
 * THE PROJECT AUTHORING SURFACE — the `.project` kind's registry `Editor`.
 * The whole surface is the shared ProjectView (tree of typed items on the
 * left, previews and node browsers on the right — or, by the project's
 * MODE, the folder it stands on, or the same material as working memory),
 * chromeless and mirroring its own selection into the page URL so a reload
 * restores it. Edits (the mode flip, the Ask's changes) write back through
 * `onChange`.
 */
import type { KindEditorProps } from "../../lib/filePreviews";
import ProjectView from "./ProjectView";

export default function ProjectEditor({ content, onChange, docPath }: KindEditorProps) {
  return <ProjectView content={content} height="100%" agentId={docPath} path={docPath} chromeless urlSync editable onChange={onChange} />;
}
