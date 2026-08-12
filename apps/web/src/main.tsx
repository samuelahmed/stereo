import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import * as amplitude from "@amplitude/unified";
import { App } from "./App";
import "./styles.css";

const AMPLITUDE_API_KEY = import.meta.env.VITE_AMPLITUDE_API_KEY;

// Inlined at build time, so an unset var is a silent no-op in production. Make it loud.
if (!AMPLITUDE_API_KEY) console.warn('Amplitude API key missing — analytics disabled');

if (AMPLITUDE_API_KEY) {
  amplitude.initAll(AMPLITUDE_API_KEY, {"analytics":{"autocapture":true},"sessionReplay":{"sampleRate":1}});
  amplitude.track('Viewed Home Page', { prompt_version: 'BA400.4' }); // helps improve this setup flow — safe to remove once you've verified the event lands
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>,
);
