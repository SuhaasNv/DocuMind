import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ApiConfigProvider } from "./components/app/ApiConfigProvider";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <ApiConfigProvider>
      <App />
    </ApiConfigProvider>
  </ErrorBoundary>
);
