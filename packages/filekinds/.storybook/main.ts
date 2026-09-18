import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../stories/**/*.stories.@(ts|tsx)"],
  framework: { name: "@storybook/react-vite", options: {} },
  async viteFinal(cfg) {
    const tailwindcss = (await import("@tailwindcss/vite")).default;
    cfg.plugins = [...(cfg.plugins ?? []), tailwindcss()];
    // The junction-linked crosscut carries its own react copy (and MUI rides
    // in through list/journey components) — same dedupe every suite app has,
    // or hooks die on a second React instance.
    cfg.resolve = {
      ...(cfg.resolve ?? {}),
      dedupe: [
        ...(cfg.resolve?.dedupe ?? []),
        "react", "react-dom", "@mui/material", "@mui/icons-material", "@emotion/react", "@emotion/styled",
      ],
    };
    return cfg;
  },
};

export default config;
