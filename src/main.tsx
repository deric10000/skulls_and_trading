import { IconContext } from "@phosphor-icons/react";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import {
  PERF_MARK,
  observeLongTasks,
  perfMark,
} from "./lib/performance/marks";

perfMark(PERF_MARK.appStart);
observeLongTasks();

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element with id=\"root\" was not found.");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <IconContext.Provider value={{ weight: "fill" }}>
      <App />
    </IconContext.Provider>
  </React.StrictMode>,
);
