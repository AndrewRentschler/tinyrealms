#!/usr/bin/env node
/**
 * Dump only maps from Convex to a JSON file.
 *
 * - Does NOT include map tiles (lightweight by default)
 * - Reads ADMIN_API_KEY from process.env, with fallback to .env.local
 *
 * Usage:
 *   npm run dump:maps
 */
import { execSync } from "child_process";
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { resolve, dirname } from "path";
import { tmpdir } from "os";

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

const fnArgs = JSON.stringify({ adminKey: ADMIN_API_KEY });
const tmpFile = resolve(tmpdir(), `convex-dump-maps-${Date.now()}.json`);

try {
  execSync(`npx convex run admin/restore:dumpAll '${fnArgs}' > "${tmpFile}"`, {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
    timeout: 60_000,
  });

  const raw = readFileSync(tmpFile, "utf8");
  const data = JSON.parse(raw);
  try { unlinkSync(tmpFile); } catch { /* ignore */ }

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = resolve(ROOT, "dumps", `maps-${ts}.json`);
  mkdirSync(dirname(outPath), { recursive: true });

  const mapsOnly = {
    _exportedAt: data._exportedAt,
    maps: data.maps ?? [],
    _counts: { maps: data?._counts?.maps ?? 0 },
  };

  writeFileSync(outPath, JSON.stringify(mapsOnly, null, 2), "utf8");
  console.log(`\nMaps dumped to: ${outPath}`);
  console.log(`Map count: ${mapsOnly._counts.maps}\n`);
} catch (err) {
  try { unlinkSync(tmpFile); } catch { /* ignore */ }
  console.error("Failed to dump maps:", err?.message ?? err);
  process.exit(1);
}
