/**
 * The studio-files skill, bundled at build time: `skills/studio-files/SKILL.md`, the guide "A Studio
 * document is asked for" exported from claude/claude.playbook. Claude.ai chat and Cowork never read
 * a CLAUDE.md, so the text travels to them as this skill — copied from the page, or the zip a release
 * ships, unzipped into ~/.claude/skills.
 */
import raw from "../../../skills/studio-files/SKILL.md?raw";

export const SKILL_PATH = "skills/studio-files/SKILL.md";
export const SKILL_RELEASES = "https://github.com/MaherKSantina/studio-kinds/releases/latest";

/** The skill: its front matter (name, description) read, and its body — the markdown after it. */
export interface Skill {
  name: string;
  description: string;
  /** The whole file, front matter included — what a skills folder holds. */
  text: string;
  /** The markdown body alone — what is rendered. */
  body: string;
}

function parse(text: string): Skill {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  const head = m ? m[1] : "";
  const body = m ? text.slice(m[0].length) : text;
  const field = (key: string) => head.match(new RegExp(`^${key}:\\s*(.*)$`, "m"))?.[1].trim() ?? "";
  return { name: field("name"), description: field("description"), text, body };
}

export const SKILL: Skill = parse(raw);
