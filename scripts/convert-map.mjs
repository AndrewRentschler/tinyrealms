#!/usr/bin/env node
/**
 * Converts the tiny-spaces cozy cabin map into our engine's MapData JSON format.
 * 
 * IMPORTANT: The original tiny-spaces data is COLUMN-MAJOR: tiles[x][y]
 * Our engine uses row-major flat arrays: tiles[y * width + x]
 * This script transposes during flattening.
 * 
 * Run: node scripts/convert-map.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcPath = join(__dirname, '../../tiny-spaces/src/games/cozyspace/maps/cozycabin.js');
const outPath = join(__dirname, '../public/assets/maps/cozy-cabin.json');

// Read the JS source and extract the data
let src = readFileSync(srcPath, 'utf-8');
src = src.replace(/export const /g, 'const ');
src += `\n;({ tilesetpath, tiledimx, tiledimy, screenxtiles, screenytiles, tilesetpxw, tilesetpxh, bgtiles, objmap, overlaymap, animatedsprites, maplabels, animatedtilemap, mapwidth, mapheight });`;
const data = eval(src);

// Original data is column-major: layer2d[x][y]
// width = layer2d.length (number of columns)
// height = layer2d[0].length (number of rows)
const mapWidth = data.bgtiles[0].length;   // outer = columns = width
const mapHeight = data.bgtiles[0][0].length; // inner = rows = height

console.log(`Map dimensions: ${mapWidth} x ${mapHeight} tiles (${mapWidth * data.tiledimx} x ${mapHeight * data.tiledimy} px)`);
console.log(`Tile size: ${data.tiledimx} x ${data.tiledimy} px`);
console.log(`BG layers: ${data.bgtiles.length}`);
console.log(`Animated sprites: ${data.animatedsprites.length}`);
console.log(`Labels: ${data.maplabels.length}`);

// Flatten column-major 2D array into row-major 1D array
// Input: colMajor[x][y]  Output: flat[y * width + x]
function flattenColMajor(colMajor) {
  const w = colMajor.length;
  const h = colMajor[0].length;
  const flat = new Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      flat[y * w + x] = colMajor[x][y];
    }
  }
  return flat;
}

// Build layers
const layers = [];

// Background layers
for (let i = 0; i < data.bgtiles.length; i++) {
  layers.push({
    name: `bg${i}`,
    type: 'bg',
    tiles: flattenColMajor(data.bgtiles[i]),
    visible: true,
  });
}

// Object layers (objmap is also [layer][x][y])
if (data.objmap) {
  for (let i = 0; i < data.objmap.length; i++) {
    layers.push({
      name: `obj${i}`,
      type: 'obj',
      tiles: flattenColMajor(data.objmap[i]),
      visible: true,
    });
  }
}

// Overlay layers
if (data.overlaymap) {
  for (let i = 0; i < data.overlaymap.length; i++) {
    layers.push({
      name: `overlay${i}`,
      type: 'overlay',
      tiles: flattenColMajor(data.overlaymap[i]),
      visible: true,
    });
  }
}

// Build collision mask from objmap layers.
// In the original engine, objmap[layer][x][y] != -1 means blocked.
const collisionMask = new Array(mapWidth * mapHeight).fill(false);
if (data.objmap) {
  for (let layerIdx = 0; layerIdx < data.objmap.length; layerIdx++) {
    const colMajor = data.objmap[layerIdx];
    for (let x = 0; x < mapWidth; x++) {
      for (let y = 0; y < mapHeight; y++) {
        if (colMajor[x][y] !== -1) {
          collisionMask[y * mapWidth + x] = true;
        }
      }
    }
  }
}
const blockedCount = collisionMask.filter(Boolean).length;
console.log(`Collision tiles: ${blockedCount} / ${mapWidth * mapHeight} (${(100 * blockedCount / (mapWidth * mapHeight)).toFixed(1)}%)`);

// Convert animated sprites
const animatedTiles = data.animatedsprites.map((s) => ({
  x: s.x,
  y: s.y,
  width: s.w,
  height: s.h,
  layer: s.layer,
  speed: s.speed,
  spriteSheet: s.sheet
    .replace('./spritesheets/', '/assets/sprites/')
    .replace('cozy-clock0.json', 'cozy-clock.json')
    .replace('sleeping-cat0.json', 'sleeping-cat.json')
    .replace('cozy-candle1.json', 'cozy-candles.json'),
  animation: s.animation,
}));

// Convert labels (sx/sy are already in tile x,y coordinates)
const labels = data.maplabels.map((l) => ({
  name: l.label,
  x: l.sx,
  y: l.sy,
  width: l.ex - l.sx + 1,
  height: l.ey - l.sy + 1,
}));

// Build the MapData object
const mapData = {
  id: 'cozy-cabin',
  name: 'Cozy Cabin',
  width: mapWidth,
  height: mapHeight,
  tileWidth: data.tiledimx,
  tileHeight: data.tiledimy,
  tilesetUrl: '/assets/tilesets/fantasy-interior.png',
  tilesetPxW: data.tilesetpxw,
  tilesetPxH: data.tilesetpxh,
  layers,
  collisionMask,
  labels,
  animatedTiles,
};

// Write output
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(mapData));

const sizeKB = (Buffer.byteLength(JSON.stringify(mapData)) / 1024).toFixed(1);
console.log(`\nWrote ${outPath}`);
console.log(`Size: ${sizeKB} KB`);
console.log(`Layers: ${layers.map((l) => l.name).join(', ')}`);
console.log(`Labels: ${labels.map((l) => l.name).join(', ')}`);
