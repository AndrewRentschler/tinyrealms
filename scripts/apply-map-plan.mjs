#!/usr/bin/env node
/**
 * Apply a structured map plan through admin/mapPlan:applyMapPlan.
 *
 * Usage:
 *   npm run map:apply-plan -- ./scripts/map-plan-template.json
 *   npm run map:apply-plan -- ./my-plan.json --no-export
 */
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");

function readEnvLocalAdminKey() {
  const envPath = resolve(ROOT, ".env.local");
  let content = "";
  try {
    content = readFileSync(envPath, "utf8");
  } catch {
    return undefined;
  }

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (key !== "ADMIN_API_KEY") continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return undefined;
}

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || readEnvLocalAdminKey();
if (!ADMIN_API_KEY) {
  console.error("Error: ADMIN_API_KEY not found in env or .env.local.");
  process.exit(1);
}

const planPathArg = process.argv[2];
if (!planPathArg) {
  console.error(
    "Usage: node scripts/apply-map-plan.mjs <plan.json> [--no-export]",
  );
  process.exit(1);
}

const planPath = resolve(ROOT, planPathArg);
const noExport = process.argv.includes("--no-export");

let plan;
try {
  plan = JSON.parse(readFileSync(planPath, "utf8"));
} catch (error) {
  console.error(`Failed to read/parse plan file: ${planPath}`);
  console.error(String(error));
  process.exit(1);
}

if (!plan || typeof plan !== "object" || typeof plan.mapName !== "string") {
  console.error("Plan must be an object and include mapName:string");
  process.exit(1);
}

const args = JSON.stringify({
  adminKey: ADMIN_API_KEY,
  plan,
});

console.log(`Applying plan to map "${plan.mapName}" from ${planPath}...`);
execSync(`npx convex run admin/mapPlan:applyMapPlan '${args}'`, {
  cwd: ROOT,
  stdio: "inherit",
  shell: true,
});

if (!noExport) {
  console.log(`\nRe-exporting visual/context bundle for "${plan.mapName}"...`);
  execSync(`npm run export:map -- "${plan.mapName}"`, {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
  });
}
