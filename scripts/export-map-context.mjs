#!/usr/bin/env node
/**
 * Export full map context for AI analysis.
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

const mapName = process.argv[2] || "mage-city";
const fnArgs = JSON.stringify({ adminKey: ADMIN_API_KEY, mapName });
const tmpFile = resolve(tmpdir(), `convex-export-map-${Date.now()}.json`);

try {
  console.log(`Exporting map context for "${mapName}"...`);
  execSync(`npx convex run admin/export:exportMapContext '${fnArgs}' > "${tmpFile}"`, {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
    timeout: 60_000,
  });

  const raw = readFileSync(tmpFile, "utf8");
  const data = JSON.parse(raw);
  try { unlinkSync(tmpFile); } catch { /* ignore */ }

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = resolve(ROOT, "dumps", "map-context", mapName);
  mkdirSync(outDir, { recursive: true });

  const outPath = resolve(outDir, `context-${ts}.json`);
  writeFileSync(outPath, JSON.stringify(data, null, 2), "utf8");

  // Create a simplified version for easy reading
  const simplified = {
    mapName: data.map.name,
    dimensions: `${data.map.width}x${data.map.height}`,
    layers: data.map.layers.map(l => ({ name: l.name, type: l.type, visible: l.visible })),
    objectCount: data.objects.length,
    npcCount: data.npcProfiles.length,
    spriteDefs: data.spriteDefinitions.map(d => d.name),
  };
  writeFileSync(resolve(outDir, "summary.json"), JSON.stringify(simplified, null, 2), "utf8");

  console.log(`\nMap context exported to: ${outPath}`);
  console.log(`Summary:`, simplified);

  // Generate HTML Renderer
  generateRenderer(data, outDir, mapName);

} catch (err) {
  try { unlinkSync(tmpFile); } catch { /* ignore */ }
  console.error("Failed to export map context:", err?.message ?? err);
  process.exit(1);
}

function generateRenderer(data, outDir, mapName) {
  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Map Renderer - ${mapName}</title>
    <script src="https://pixijs.download/v7.x/pixi.min.js"></script>
    <style>
        body { margin: 0; background: #222; color: #eee; font-family: sans-serif; }
        canvas { display: block; margin: 20px auto; border: 4px solid #444; image-rendering: pixelated; }
        #controls { padding: 20px; background: #333; position: sticky; top: 0; z-index: 100; }
        .layer-toggle { margin-right: 15px; cursor: pointer; }
    </style>
</head>
<body>
    <div id="controls">
        <strong>Map: ${mapName} (${data.map.width}x${data.map.height})</strong> | 
        <span id="layer-toggles"></span>
    </div>
    <div id="container"></div>

    <script>
        const mapData = ${JSON.stringify(data.map)};
        const objects = ${JSON.stringify(data.objects)};
        const spriteDefs = ${JSON.stringify(data.spriteDefinitions)};
        const spriteSheets = ${JSON.stringify(data.spriteSheets)};
        const tilesetUrls = ${JSON.stringify(data.tilesetUrls)};

        const app = new PIXI.Application({
            width: mapData.width * mapData.tileWidth,
            height: mapData.height * mapData.tileHeight,
            backgroundColor: 0x000000,
        });
        document.getElementById('container').appendChild(app.view);

        const layerContainers = {};
        const textures = {};

        async function init() {
            // Load textures
            for (const id in tilesetUrls) {
                if (tilesetUrls[id]) {
                    textures[id] = await PIXI.Assets.load(tilesetUrls[id]);
                }
            }
            for (const sheet of spriteSheets) {
                if (sheet.imageUrl) {
                    textures[sheet.name] = await PIXI.Assets.load(sheet.imageUrl);
                }
            }

            mapData.layers.forEach(layer => {
                const container = new PIXI.Container();
                container.name = layer.name;
                container.visible = layer.visible;
                app.stage.addChild(container);
                layerContainers[layer.name] = container;

                // Create toggle
                const label = document.createElement('label');
                label.className = 'layer-toggle';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = layer.visible;
                cb.onchange = () => container.visible = cb.checked;
                label.appendChild(cb);
                label.appendChild(document.createTextNode(layer.name));
                document.getElementById('layer-toggles').appendChild(label);

                if (layer.tiles) {
                    const tiles = JSON.parse(layer.tiles);
                    const tilesetTexture = textures[mapData.tilesetId];
                    
                    for (let y = 0; y < mapData.height; y++) {
                        for (let x = 0; x < mapData.width; x++) {
                            const tileIdx = tiles[y * mapData.width + x];
                            if (tileIdx !== -1) {
                                if (tilesetTexture) {
                                    const tw = mapData.tileWidth;
                                    const th = mapData.tileHeight;
                                    const cols = Math.floor(mapData.tilesetPxW / tw);
                                    const tx = (tileIdx % cols) * tw;
                                    const ty = Math.floor(tileIdx / cols) * th;
                                    
                                    const frame = new PIXI.Rectangle(tx, ty, tw, th);
                                    const tex = new PIXI.Texture(tilesetTexture.baseTexture, frame);
                                    const sprite = new PIXI.Sprite(tex);
                                    sprite.x = x * tw;
                                    sprite.y = y * th;
                                    container.addChild(sprite);
                                } else {
                                    const g = new PIXI.Graphics();
                                    const color = (tileIdx * 1234567) % 0xFFFFFF;
                                    g.beginFill(color, 0.8);
                                    g.drawRect(x * mapData.tileWidth, y * mapData.tileHeight, mapData.tileWidth, mapData.tileHeight);
                                    g.endFill();
                                    container.addChild(g);
                                }
                            }
                        }
                    }
                }
            });

            // Draw objects
            const objLayer = new PIXI.Container();
            app.stage.addChild(objLayer);
            objects.forEach(obj => {
                const def = spriteDefs.find(d => d.name === obj.spriteDefName);
                const sheetName = def?.spriteSheetUrl.split('/').pop().replace('.json', '');
                const sheet = spriteSheets.find(s => s.name === sheetName);
                const sheetTexture = textures[sheetName];

                if (sheetTexture && sheet && def) {
                    // Just draw the first frame of the default animation for now
                    const animName = def.defaultAnimation;
                    const frameName = sheet.animations[animName]?.[0] || Object.keys(sheet.frames)[0];
                    const frameData = sheet.frames[frameName];
                    if (frameData) {
                        const f = frameData.frame;
                        const tex = new PIXI.Texture(sheetTexture.baseTexture, new PIXI.Rectangle(f.x, f.y, f.w, f.h));
                        const sprite = new PIXI.Sprite(tex);
                        sprite.x = obj.x;
                        sprite.y = obj.y;
                        sprite.anchor.set(def.anchorX ?? 0.5, def.anchorY ?? 1.0);
                        sprite.scale.set(obj.scaleOverride ?? def.scale ?? 1.0);
                        if (obj.flipX) sprite.scale.x *= -1;
                        objLayer.addChild(sprite);
                    }
                } else {
                    const g = new PIXI.Graphics();
                    g.beginFill(0xFF0000, 0.5);
                    g.drawCircle(obj.x, obj.y, 5);
                    g.endFill();
                    objLayer.addChild(g);
                }
                
                const text = new PIXI.Text(obj.instanceName || obj.spriteDefName, { fontSize: 8, fill: 0xffffff });
                text.x = obj.x;
                text.y = obj.y;
                objLayer.addChild(text);
            });
        }

        init();
    </script>
</body>
</html>
  `;
  const htmlPath = resolve(outDir, "index.html");
  writeFileSync(htmlPath, html, "utf8");
  console.log(`Renderer HTML generated: ${htmlPath}`);
}
