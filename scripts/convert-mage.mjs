/**
 * Convert the Mage City map from tiny-spaces JS format to our JSON format.
 *
 * The old engine stores tiles as tiles[x][y] (column-major).
 * Our engine expects row-major flat arrays: index = y * width + x.
 *
 * Run with: node scripts/convert-mage.mjs
 */
import { readFileSync, writeFileSync } from 'fs';

const src = readFileSync(
  '/Users/martin/projects/tiny-spaces/src/games/mage/maps/mage.js',
  'utf8',
);

// Strip "export" so we can eval
const evalSrc =
  src.replace(/export const/g, 'const') +
  '; return { bgtiles, objmap, maplabels, tiledimx, tiledimy, tilesetpxw, tilesetpxh };';

const data = new Function(evalSrc)();

const { bgtiles, objmap, maplabels, tiledimx, tiledimy, tilesetpxw, tilesetpxh } = data;

// Column-major: first dim = X (width), second dim = Y (height)
const width = bgtiles[0].length;       // X extent
const height = bgtiles[0][0].length;   // Y extent

console.log(`Map: ${width}x${height} tiles (${width * tiledimx}x${height * tiledimy} px)`);
console.log(`Tile: ${tiledimx}x${tiledimy}`);
console.log(`Tileset: ${tilesetpxw}x${tilesetpxh} → ${tilesetpxw / tiledimx} cols`);
console.log(`BG layers: ${bgtiles.length}, OBJ layers: ${objmap.length}`);
console.log(`Labels: ${maplabels.length}`);

// Flatten column-major [x][y] to row-major flat[y * width + x]
function flattenLayer(layer2d) {
  const flat = new Array(width * height).fill(-1);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      flat[y * width + x] = layer2d[x][y];
    }
  }
  return flat;
}

// Build collision mask from objmap
function buildCollisionMask() {
  const mask = new Array(width * height).fill(false);
  for (const layer of objmap) {
    for (let x = 0; x < layer.length; x++) {
      for (let y = 0; y < layer[0].length; y++) {
        if (layer[x][y] !== undefined && layer[x][y] !== -1) {
          mask[y * width + x] = true;
        }
      }
    }
  }
  return mask;
}

// Build layers
const layers = [];
for (let i = 0; i < bgtiles.length; i++) {
  layers.push({
    name: `bg${i}`,
    type: 'bg',
    tiles: flattenLayer(bgtiles[i]),
    visible: true,
  });
}
for (let i = 0; i < objmap.length; i++) {
  layers.push({
    name: `obj${i}`,
    type: 'obj',
    tiles: flattenLayer(objmap[i]),
    visible: true,
  });
}
layers.push({
  name: 'overlay',
  type: 'overlay',
  tiles: new Array(width * height).fill(-1),
  visible: true,
});

// Convert labels
const labels = maplabels.map((l) => ({
  name: l.label,
  x: l.sx,
  y: l.sy,
  width: l.ex - l.sx + 1,
  height: l.ey - l.sy + 1,
}));

// Add a few extra useful labels
labels.push(
  { name: 'spawn1', x: 25, y: 25, width: 1, height: 1 },  // center of map
);

const mapJson = {
  id: 'mage-city',
  name: 'mage-city',
  width,
  height,
  tileWidth: tiledimx,
  tileHeight: tiledimy,
  tilesetUrl: '/assets/tilesets/mage-city.png',
  tilesetPxW: tilesetpxw,
  tilesetPxH: tilesetpxh,
  layers,
  collisionMask: buildCollisionMask(),
  labels,
  animatedTiles: [],
  portals: [
    {
      name: 'exit-to-cabin',
      x: 0,
      y: 8,
      width: 1,
      height: 2,
      targetMap: 'cozy-cabin',
      targetSpawn: 'start1',
      direction: 'right',
      transition: 'fade',
    },
  ],
  musicUrl: '/assets/audio/magecity.mp3',
  combatEnabled: false,
  status: 'published',
};

writeFileSync('public/assets/maps/mage-city.json', JSON.stringify(mapJson));
console.log(
  `Wrote public/assets/maps/mage-city.json (${(JSON.stringify(mapJson).length / 1024).toFixed(0)} KB)`,
);
