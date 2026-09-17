/**
 * The templates of the kinds this repository carries — what "Start from the
 * template" inserts, and what the mirrored engine test reads through
 * `fileTemplate`. The text matches the suite's templates for these kinds; the
 * suite's own fileTemplates.ts is not mirrored because it reaches into parts of
 * the suite this repository does not carry.
 */
const playbookText = (stem: string) => `version: 2
title: ${stem}
description: The state space, the events, and what is true while they happen.
decisions:
  - key: example
    label: An example decision
    values:
      - { key: not-yet, label: Not yet }
      - { key: done, label: Done }
events: []
topics: []
`;

const briefText = (stem: string) => `title: ${stem}
description: ""
sections:
  - title: First section
    body: ""
`;

const mdText = (stem: string) => `# ${stem}\n`;

/** A fresh document of the kind the file name's extension picks. */
export function fileTemplate(fileName: string, stem: string): string {
  const ext = fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase();
  switch (ext) {
    case "playbook": return playbookText(stem);
    case "brief": return briefText(stem);
    default: return mdText(stem);
  }
}
