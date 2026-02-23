#!/usr/bin/env node
import { execSync } from "child_process";
import { dirname, resolve } from "path";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
const DEFAULT_CHUNK_WORLD_WIDTH = 64;
const DEFAULT_CHUNK_WORLD_HEIGHT = 64;

if (!ADMIN_API_KEY) {
  console.error("Error: ADMIN_API_KEY is not set.");
  console.error("  export ADMIN_API_KEY='your-secret'");
  process.exit(1);
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const args = new Set(argv);
  const apply = args.has("--apply");
  const dryRun = !apply || args.has("--dry-run");
  const confirm = args.has("--confirm");

  if (apply && !confirm) {
    console.error("Blocked: --apply requires --confirm");
    process.exit(1);
  }

  const getNumberArg = (name, fallback) => {
    const index = argv.indexOf(name);
    if (index < 0) return fallback;
    const parsed = Number(argv[index + 1]);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      console.error(`${name} must be a number > 0`);
      process.exit(1);
    }
    return parsed;
  };

  return {
    dryRun,
    confirm,
    chunkWorldWidth: getNumberArg("--chunk-world-width", DEFAULT_CHUNK_WORLD_WIDTH),
    chunkWorldHeight: getNumberArg("--chunk-world-height", DEFAULT_CHUNK_WORLD_HEIGHT),
  };
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
  const output = execSync(
    `npx convex run "admin:reconcileGlobalSpatial" '${payload}'`,
    {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    },
  );
  return parseJsonFromOutput(output);
}

try {
  const args = parseArgs();
  const result = runMutation(args);
  console.log(`mode=${result.dryRun ? "dry-run" : "apply"}`);
  console.log(`locations: scanned=${result.scannedLocations} candidates=${result.candidateLocations}`);
  console.log(
    `upserts: inserted=${result.inserted} patched=${result.patched} unchanged=${result.unchanged} total=${result.upserted}`,
  );
  console.log(
    `skipped: missingSource=${result.skippedMissingSource} missingCoords=${result.skippedMissingCoords}`,
  );
} catch (error) {
  console.error("reconcile-global-spatial failed:", error?.message ?? error);
  process.exit(1);
}
