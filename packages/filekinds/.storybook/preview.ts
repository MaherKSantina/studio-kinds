import type { Preview } from "@storybook/react-vite";
import "./theme.css";

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    backgrounds: { disable: true },
  },
};

export default preview;
