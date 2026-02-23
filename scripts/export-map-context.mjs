#!/usr/bin/env node
/**
 * Export full map context for AI analysis.
 */
import { execSync } from "child_process";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, resolve } from "path";
import puppeteer from "puppeteer";

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

function toRenderableUrl(url) {
  if (!url || typeof url !== "string") return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("file://")) return url;
  if (url.startsWith("/assets/")) {
    return `file://${resolve(ROOT, "public", url.slice(1))}`;
  }
  return `file://${resolve(ROOT, url)}`;
}

function buildRenderTilesetUrls(data) {
  const urls = {};

  if (data?.map?.tilesetUrl) {
    const resolved = toRenderableUrl(data.map.tilesetUrl);
    if (resolved) urls[data.map.tilesetUrl] = resolved;
  }

  for (const layer of data?.map?.layers ?? []) {
    if (!layer?.tilesetUrl) continue;
    const resolved = toRenderableUrl(layer.tilesetUrl);
    if (resolved) urls[layer.tilesetUrl] = resolved;
  }

  // Back-compat with prior export shape keyed by storage IDs.
  for (const [key, raw] of Object.entries(data?.tilesetUrls ?? {})) {
    const resolved = toRenderableUrl(raw);
    if (resolved) urls[key] = resolved;
  }

  return urls;
}

function parseLayerTiles(layer) {
  if (Array.isArray(layer?.tiles)) return layer.tiles;
  if (typeof layer?.tiles === "string") {
    try {
      const parsed = JSON.parse(layer.tiles);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function collectTileUsage(mapData) {
  const usage = new Map();

  for (const layer of mapData?.layers ?? []) {
    const tiles = parseLayerTiles(layer);
    for (const tileId of tiles) {
      if (typeof tileId !== "number" || tileId < 0) continue;
      const existing = usage.get(tileId) ?? {
        count: 0,
        layers: new Set(),
      };
      existing.count += 1;
      existing.layers.add(layer.name);
      usage.set(tileId, existing);
    }
  }

  return usage;
}

function buildTileLegend(mapData, usage) {
  const tileWidth = mapData.tileWidth;
  const tileHeight = mapData.tileHeight;
  const tilesPerRow = Math.floor(mapData.tilesetPxW / tileWidth);

  return [...usage.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([tileId, info]) => ({
      tileId,
      sourceX: (tileId % tilesPerRow) * tileWidth,
      sourceY: Math.floor(tileId / tilesPerRow) * tileHeight,
      tileWidth,
      tileHeight,
      usedCount: info.count,
      usedInLayers: [...info.layers].sort(),
    }));
}

try {
  console.log(`Exporting map context for "${mapName}"...`);
  execSync(
    `npx convex run admin/export:exportMapContext '${fnArgs}' > "${tmpFile}"`,
    {
      cwd: ROOT,
      stdio: "inherit",
      shell: true,
      timeout: 60_000,
    },
  );

  const raw = readFileSync(tmpFile, "utf8");
  const data = JSON.parse(raw);
  const renderTilesetUrls = buildRenderTilesetUrls(data);
  data.renderTilesetUrls = renderTilesetUrls;
  try {
    unlinkSync(tmpFile);
  } catch {
    /* ignore */
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = resolve(ROOT, "dumps", "map-context", mapName);
  mkdirSync(outDir, { recursive: true });

  const outPath = resolve(outDir, `context-${ts}.json`);
  writeFileSync(outPath, JSON.stringify(data, null, 2), "utf8");

  // Create a simplified version for easy reading
  const simplified = {
    mapName: data.map.name,
    dimensions: `${data.map.width}x${data.map.height}`,
    layers: data.map.layers.map((l) => ({
      name: l.name,
      type: l.type,
      visible: l.visible,
    })),
    objectCount: data.objects.length,
    npcCount: data.npcProfiles.length,
    spriteDefs: data.spriteDefinitions.map((d) => d.name),
  };
  writeFileSync(
    resolve(outDir, "summary.json"),
    JSON.stringify(simplified, null, 2),
    "utf8",
  );

  const tileUsage = collectTileUsage(data.map);
  const tileLegend = buildTileLegend(data.map, tileUsage);
  writeFileSync(
    resolve(outDir, "tile-legend.json"),
    JSON.stringify(tileLegend, null, 2),
    "utf8",
  );

  const geminiContext = {
    map: {
      name: data.map.name,
      width: data.map.width,
      height: data.map.height,
      tileWidth: data.map.tileWidth,
      tileHeight: data.map.tileHeight,
      labels: data.map.labels ?? [],
      portals: data.map.portals ?? [],
    },
    entities: {
      objects: data.objects ?? [],
      worldItems: data.worldItems ?? [],
      npcProfiles: data.npcProfiles ?? [],
    },
    tiles: {
      totalUniqueUsedTiles: tileLegend.length,
      legendFile: "tile-legend.json",
      mapScreenshotFile: `map-${mapName}.png`,
      tilesetLegendImageFile: `tileset-legend-${mapName}.png`,
      mapTilesetUrl: data.map.tilesetUrl ?? null,
    },
  };
  writeFileSync(
    resolve(outDir, "gemini-context.json"),
    JSON.stringify(geminiContext, null, 2),
    "utf8",
  );

  console.log(`\nMap context exported to: ${outPath}`);
  console.log(`Summary:`, simplified);

  // Generate HTML Renderer
  const htmlPath = generateRenderer(data, outDir, mapName);

  // Capture Screenshot
  await captureScreenshot(htmlPath, outDir, mapName, data.map);
  await captureTilesetLegend(
    outDir,
    mapName,
    data.map,
    data.renderTilesetUrls?.[data.map.tilesetUrl] ?? null,
    tileLegend,
  );
} catch (err) {
  try {
    unlinkSync(tmpFile);
  } catch {
    /* ignore */
  }
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
        const tilesetUrls = ${JSON.stringify(data.renderTilesetUrls ?? {})};

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
                    try {
                        textures[id] = await PIXI.Assets.load(tilesetUrls[id]);
                        console.log('Loaded tileset:', id);
                    } catch (e) {
                        console.error('Failed to load tileset:', id, e);
                    }
                }
            }
            for (const sheet of spriteSheets) {
                if (sheet.imageUrl) {
                    try {
                        textures[sheet.name] = await PIXI.Assets.load(sheet.imageUrl);
                        console.log('Loaded sprite sheet:', sheet.name);
                    } catch (e) {
                        console.error('Failed to load sprite sheet:', sheet.name, e);
                    }
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
                    const layerTilesetKey = layer.tilesetUrl ?? mapData.tilesetUrl ?? mapData.tilesetId;
                    const tilesetTexture = textures[layerTilesetKey];
                    
                    if (tilesetTexture) {
                        const tw = mapData.tileWidth;
                        const th = mapData.tileHeight;
                        // Use actual texture width for tile calculation
                        const texWidth = tilesetTexture.width;
                        const texHeight = tilesetTexture.height;
                        const tilesPerRow = Math.floor(texWidth / tw);
                        const rows = Math.floor(texHeight / th);
                        const maxTileIndex = (tilesPerRow * rows) - 1;
                        let invalidTiles = 0;
                        
                        for (let y = 0; y < mapData.height; y++) {
                            for (let x = 0; x < mapData.width; x++) {
                                const tileIdx = tiles[y * mapData.width + x];
                                if (tileIdx !== -1) {
                                    if (tileIdx < 0 || tileIdx > maxTileIndex) {
                                        invalidTiles++;
                                        continue;
                                    }
                                    const srcX = (tileIdx % tilesPerRow) * tw;
                                    const srcY = Math.floor(tileIdx / tilesPerRow) * th;
                                    
                                    const frame = new PIXI.Rectangle(srcX, srcY, tw, th);
                                    const tex = new PIXI.Texture(tilesetTexture.baseTexture, frame);
                                    const sprite = new PIXI.Sprite(tex);
                                    sprite.x = x * tw;
                                    sprite.y = y * th;
                                    container.addChild(sprite);
                                }
                            }
                        }
                        if (invalidTiles > 0) {
                            console.warn(\`Layer "\${layer.name}" skipped \${invalidTiles} out-of-range tiles (max index \${maxTileIndex}).\`);
                        }
                    } else {
                        // Fallback to colored blocks if texture missing
                        for (let y = 0; y < mapData.height; y++) {
                            for (let x = 0; x < mapData.width; x++) {
                                const tileIdx = tiles[y * mapData.width + x];
                                if (tileIdx !== -1) {
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
        
        // Signal to Puppeteer that we are ready
        window.isReady = false;
        async function checkReady() {
            // Wait for all textures to be loaded
            let attempts = 0;
            while (attempts < 50) {
                const allLoaded = Object.keys(textures).length >= (Object.keys(tilesetUrls).length + spriteSheets.length);
                if (allLoaded) break;
                await new Promise(r => setTimeout(r, 200));
                attempts++;
            }
            // Extra buffer for PixiJS to finish rendering
            await new Promise(r => setTimeout(r, 1000));
            window.isReady = true;
            document.body.setAttribute('data-ready', 'true');
            console.log('Renderer ready for screenshot');
        }
        checkReady();
    </script>
</body>
</html>
  `;
  const htmlPath = resolve(outDir, "index.html");
  writeFileSync(htmlPath, html, "utf8");
  console.log(`Renderer HTML generated: ${htmlPath}`);
  return htmlPath;
}

async function captureScreenshot(htmlPath, outDir, mapName, map) {
  console.log(`Capturing screenshot for ${mapName}...`);
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-web-security",
    ],
  });
  const page = await browser.newPage();

  // Log console messages from the page
  page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));
  page.on("pageerror", (err) => console.error("PAGE ERROR:", err.message));

  const width = Math.max(800, map.width * map.tileWidth);
  const height = Math.max(600, map.height * map.tileHeight);

  await page.setViewport({ width: width + 40, height: height + 100 });
  await page.goto(`file://${htmlPath}`);

  // Wait for the ready signal
  await page.waitForSelector('body[data-ready="true"]', { timeout: 10000 });

  const screenshotPath = resolve(outDir, `map-${mapName}.png`);

  // Target the canvas specifically
  const canvas = await page.$("canvas");
  if (canvas) {
    await canvas.screenshot({ path: screenshotPath });
    console.log(`Screenshot saved to: ${screenshotPath}`);
  } else {
    await page.screenshot({ path: screenshotPath });
    console.log(
      `Full page screenshot saved to: ${screenshotPath} (canvas not found)`,
    );
  }

  await browser.close();
}

async function captureTilesetLegend(
  outDir,
  mapName,
  map,
  tilesetUrl,
  tileLegend,
) {
  if (!tilesetUrl) {
    console.warn(
      "Skipping tileset legend screenshot: no tileset URL resolved.",
    );
    return;
  }
  if (!tileLegend.length) {
    console.warn("Skipping tileset legend screenshot: no used tiles.");
    return;
  }

  console.log(`Capturing tileset legend for ${mapName}...`);
  let tilesetImageSrc = tilesetUrl;
  if (tilesetUrl.startsWith("file://")) {
    const filePath = decodeURIComponent(tilesetUrl.replace("file://", ""));
    const base64 = readFileSync(filePath).toString("base64");
    tilesetImageSrc = `data:image/png;base64,${base64}`;
  }

  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-web-security",
    ],
  });
  const page = await browser.newPage();

  page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));
  page.on("pageerror", (err) => console.error("PAGE ERROR:", err.message));

  const cols = 8;
  const cellW = 220;
  const cellH = 90;
  const rows = Math.ceil(tileLegend.length / cols);
  const width = cols * cellW;
  const height = Math.max(300, rows * cellH + 40);

  await page.setViewport({ width, height });
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <body style="margin:0;background:#111;color:#eee;font-family:Arial,sans-serif;">
        <canvas id="legend" width="${width}" height="${height}"></canvas>
      </body>
    </html>
  `);

  await page.evaluate(
    async ({
      tilesetUrlArg,
      legendArg,
      mapArg,
      colsArg,
      cellWArg,
      cellHArg,
    }) => {
      const canvas = document.getElementById("legend");
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const img = new Image();
      img.src = tilesetUrlArg;
      await img.decode();

      ctx.fillStyle = "#ddd";
      ctx.font = "16px Arial";
      ctx.fillText(
        `Tileset legend - used tile IDs (${legendArg.length})`,
        12,
        22,
      );

      for (let i = 0; i < legendArg.length; i++) {
        const item = legendArg[i];
        const col = i % colsArg;
        const row = Math.floor(i / colsArg);
        const x = col * cellWArg + 10;
        const y = row * cellHArg + 34;

        ctx.strokeStyle = "#444";
        ctx.strokeRect(
          x - 2,
          y - 2,
          mapArg.tileWidth + 4,
          mapArg.tileHeight + 4,
        );
        ctx.drawImage(
          img,
          item.sourceX,
          item.sourceY,
          mapArg.tileWidth,
          mapArg.tileHeight,
          x,
          y,
          mapArg.tileWidth,
          mapArg.tileHeight,
        );

        ctx.fillStyle = "#fff";
        ctx.font = "12px Arial";
        ctx.fillText(`id ${item.tileId}`, x + 40, y + 12);
        ctx.fillText(`count ${item.usedCount}`, x + 40, y + 28);
        ctx.fillStyle = "#aaa";
        ctx.fillText(`${item.usedInLayers.join(", ")}`, x + 40, y + 44);
      }
    },
    {
      tilesetUrlArg: tilesetImageSrc,
      legendArg: tileLegend,
      mapArg: {
        tileWidth: map.tileWidth,
        tileHeight: map.tileHeight,
      },
      colsArg: cols,
      cellWArg: cellW,
      cellHArg: cellH,
    },
  );

  const outPath = resolve(outDir, `tileset-legend-${mapName}.png`);
  const canvas = await page.$("#legend");
  if (canvas) {
    await canvas.screenshot({ path: outPath });
    console.log(`Tileset legend saved to: ${outPath}`);
  }

  await browser.close();
}
