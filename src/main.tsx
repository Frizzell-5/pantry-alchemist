import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { registerServiceWorker } from "./lib/install.ts";
import { requestPersistentStorage } from "./lib/store.ts";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();
// Ask the browser to keep saved recipes and progress even when the device is low on space.
requestPersistentStorage();
