import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { readStoredColorTheme, applyColorTheme } from "./lib/color-theme";

applyColorTheme(readStoredColorTheme());

createRoot(document.getElementById("root")!).render(<App />);
