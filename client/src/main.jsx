import React from "react";
import { createRoot } from "react-dom/client";
import { AppProviders } from "./app/providers.jsx";
import { AppRouter } from "./app/router.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppProviders>
      <AppRouter />
    </AppProviders>
  </React.StrictMode>,
);
