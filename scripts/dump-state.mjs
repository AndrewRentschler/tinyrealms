#!/usr/bin/env node
/**
 * Dump all world state from Convex to a JSON file.
 *
 * Usage:
 *   npm run dump                                     # writes to dumps/state-<timestamp>.json
 *   node scripts/dump-state.mjs --out my-dump.json   # writes to my-dump.json
 *   node scripts/dump-state.mjs --tiles              # include full tile data (large!)
 *
 * Requires the local Convex dev server to be running (npx convex dev --local).
 */

import { execSync } from "child_process";
import { mkdirSync, writeFileSync, readFileSync, unlinkSync } from "fs";
import { resolve, dirname } from "path";
import { tmpdir } from "os";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");

// Parse flags
const args = process.argv.slice(2);
const includeTiles = args.includes("--tiles");
const outIdx = args.indexOf("--out");
const outArg = outIdx >= 0 ? args[outIdx + 1] : null;

// Build the Convex run arguments
const fnArgs = JSON.stringify({ includeTiles: includeTiles || undefined });
const tmpFile = resolve(tmpdir(), `convex-dump-${Date.now()}.json`);

console.log("Querying Convex (admin:dumpAll)...");

try {
  // Run via shell, redirecting stdout to temp file to keep output clean
  execSync(`npx convex run admin:dumpAll '${fnArgs}' > "${tmpFile}"`, {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
    timeout: 60_000,
  });

  // Parse the output
  const raw = readFileSync(tmpFile, "utf-8");
  const data = JSON.parse(raw);

  // Clean up temp file
  try { unlinkSync(tmpFile); } catch { /* ignore */ }

  // Determine output path
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const defaultDir = resolve(ROOT, "dumps");
  const outPath = outArg ? resolve(outArg) : resolve(defaultDir, `state-${ts}.json`);

  // Ensure output directory exists
  mkdirSync(dirname(outPath), { recursive: true });

  // Write formatted JSON
  writeFileSync(outPath, JSON.stringify(data, null, 2), "utf-8");

  // Print summary
  const counts = data._counts ?? {};
  console.log(`\nDumped to: ${outPath}`);
  console.log(`Exported at: ${data._exportedAt}\n`);
  console.log("Table counts:");
  for (const [table, count] of Object.entries(counts)) {
    console.log(`  ${String(table).padEnd(20)} ${count}`);
  }
  console.log("");
} catch (err) {
  // Clean up temp file on error
  try { unlinkSync(tmpFile); } catch { /* ignore */ }
  console.error("Failed to dump state:", err.message);
  process.exit(1);
}
