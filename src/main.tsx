import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./components/layout/App";
import ErrorBoundary from "./components/layout/ErrorBoundary";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
