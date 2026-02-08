/**
 * Entry point – plain TypeScript, no React.
 * Always connects to Convex (local or cloud).
 */
import { initConvexClient } from "./lib/convexClient.ts";
import { App } from "./App.ts";
import "./index.css";

const convex = initConvexClient();
const root = document.getElementById("root")!;
const app = new App(root, convex);
app.start();

// Expose for debugging in dev console
if (import.meta.env.DEV) {
  (window as any).__app = app;
  (window as any).__convex = convex;
}
