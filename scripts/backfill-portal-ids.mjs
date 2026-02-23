#!/usr/bin/env node
import { execSync } from "child_process";
import { dirname, resolve } from "path";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

if (!ADMIN_API_KEY) {
  console.error("Error: ADMIN_API_KEY is not set.");
  console.error("  export ADMIN_API_KEY='your-secret'");
  process.exit(1);
}

function parseArgs() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has("--apply");
  const dryRun = !apply || args.has("--dry-run");
  const confirm = args.has("--confirm");

  if (apply && !confirm) {
    console.error("Blocked: --apply requires --confirm");
    process.exit(1);
  }

  return { dryRun, confirm };
}

function parseJsonFromOutput(output) {
  const text = String(output ?? "").trim();
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(lines[i]);
    } catch {
      // keep scanning trailing lines
    }
  }
  throw new Error("Could not parse JSON response from convex output");
}

function runMutation(args) {
  const payload = JSON.stringify({ adminKey: ADMIN_API_KEY, ...args });
  const output = execSync(`npx convex run "admin:backfillPortalIds" '${payload}'`, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    shell: true,
  });
  return parseJsonFromOutput(output);
}

try {
  const { dryRun, confirm } = parseArgs();
  const result = runMutation({ dryRun, confirm });
  console.log(`mode=${result.dryRun ? "dry-run" : "apply"}`);
  console.log(
    `maps: total=${result.totalMaps} withPortals=${result.mapsWithPortals} affected=${result.affectedMaps}`,
  );
  console.log(
    `portals: total=${result.totalPortals} missing=${result.missingPortalIds} assigned=${result.assignedPortalIds}`,
  );
} catch (error) {
  console.error("backfill-portal-ids failed:", error?.message ?? error);
  process.exit(1);
}
