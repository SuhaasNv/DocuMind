import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Fail fast if VITE_API_URL is not set (api.ts throws when first imported).
import "./lib/api";

createRoot(document.getElementById("root")!).render(<App />);
