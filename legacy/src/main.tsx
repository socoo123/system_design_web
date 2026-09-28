import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { ThemeProvider } from "./hooks/useTheme";
import { LocaleProvider } from "./hooks/useLocale";
import { initZoomHotkeys } from "./lib/zoom";
import "./styles/globals.css";

initZoomHotkeys();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <ThemeProvider>
        <LocaleProvider>
          <App />
        </LocaleProvider>
      </ThemeProvider>
    </HashRouter>
  </React.StrictMode>,
);
