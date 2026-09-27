import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { configureFileKinds } from "filekinds";
import App from "./App";
import "./index.css";
import "./styles.css";

// Every document is one file, so the renderers read nothing beside it; a viewer that asks anyway is
// told so instead of reaching a server. Remote content stays off: nothing a document names is fetched.
configureFileKinds({
  readFile: async (path) => { throw new Error(`The page reads nothing beside the document (${path})`); },
  remoteContent: false,
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
