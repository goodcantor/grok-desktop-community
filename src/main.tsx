import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/app.css";
import "./styles/shell.css";
import "./styles/workspace.css";
import "./styles/ui.css";
import "./styles/composer.css";
import "./styles/usability.css";
import "./styles/usage.css";
import "./styles/conversation.css";
import "../shared/theme-palette.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
