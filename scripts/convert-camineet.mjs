/**
 * Convert the Camineet map from tiny-spaces JS format to our JSON format.
 * 
 * IMPORTANT: The old engine stores tiles as tiles[x][y] (column-major),
 * but our engine expects row-major flat arrays (index = y * width + x).
 * 
 * Run with: node scripts/convert-camineet.mjs
 */
import { readFileSync, writeFileSync } from 'fs';

const src = readFileSync('/Users/martin/projects/tiny-spaces/src/games/ps1/maps/ps1-camineet.js', 'utf8');

function extractConst(name) {
  const re = new RegExp(`export const ${name}\\s*=\\s*(.+?)(?:;|$)`, 's');
  const m = src.match(re);
  if (!m) throw new Error(`Could not find ${name}`);
  return m[1].trim();
}

const tiledimx = parseInt(extractConst('tiledimx'));
const tiledimy = parseInt(extractConst('tiledimy'));
const tilesetpxw = parseInt(extractConst('tilesetpxw'));
const tilesetpxh = parseInt(extractConst('tilesetpxh'));

// Parse array sections
const bgtilesStart = src.indexOf('export const bgtiles = [');
const bgtilesEnd = src.indexOf('\nexport const objmap');
const bgtilesStr = src.slice(bgtilesStart + 'export const bgtiles = '.length, bgtilesEnd).trim();

const objmapStart = src.indexOf('export const objmap = [');
const objmapEnd = src.indexOf('\nexport const animatedsprites');
const objmapStr = src.slice(objmapStart + 'export const objmap = '.length, objmapEnd).trim();

const labelsStart = src.indexOf('export const maplabels = [');
const labelsEnd = src.indexOf('];\n\nexport const mapwidth');
const labelsStr = src.slice(labelsStart + 'export const maplabels = '.length, labelsEnd + 1).trim();

const bgtiles = eval(bgtilesStr);
const objmap = eval(objmapStr);
const maplabels = eval(labelsStr);

// OLD ENGINE: tiles[x][y] → first index is X (columns), second is Y (rows)
// bgtiles[layer][x][y]
// So: bgtiles[0].length = number of columns (width)
//     bgtiles[0][0].length = number of rows (height)
//
// OLD ENGINE CODE:
//   export const mapwidth = bgtiles[0][0].length;   ← tiles[0][0].length = number of rows
//   export const mapheight = bgtiles[0].length;      ← tiles[0].length = number of columns
//
// Wait — that's confusing. Let me re-read the old code:
//   for (let x = 0; x < tiles.length; x++)
//     for (let y = 0; y < tiles[0].length; y++)
//       tiles[x][y]
// And then: addTileLevelCoords(x, y, ...)
//
// So tiles.length = number of x positions = width
//    tiles[0].length = number of y positions = height
// And: mapwidth = bgtiles[0][0].length ... wait that seems wrong
//
// Actually: mapwidth = bgtiles[0][0].length and mapheight = bgtiles[0].length
// bgtiles[0] is layer 0, bgtiles[0].length = number of x positions
// bgtiles[0][0].length = number of y positions
// So mapwidth = bgtiles[0][0].length = number of y positions??
//
// No wait. In the old code:
//   export const mapwidth = bgtiles[0][0].length;
//   export const mapheight = bgtiles[0].length;
// The variable names say "mapwidth" comes from the second dimension.
// But the rendering loop has x as the first dimension.
// This is self-contradictory... unless mapwidth/mapheight are defined 
// relative to the screen (mapwidth = horizontal = x), and the data is:
//   bgtiles[layer][col][row] where col=x dimension
// So bgtiles[0].length = number of cols = mapheight (??)
//
// Let me just check the actual dimensions:
const dim1 = bgtiles[0].length;       // first dimension
const dim2 = bgtiles[0][0].length;    // second dimension
console.log(`Data dimensions: bgtiles[0].length=${dim1}, bgtiles[0][0].length=${dim2}`);
console.log(`Old code says: mapwidth=${dim2}, mapheight=${dim1}`);

// The old rendering loop iterates:
//   for x in 0..tiles.length (= dim1)
//     for y in 0..tiles[0].length (= dim2)
//       addTileLevelCoords(x, y, ..., tiles[x][y])
// So x goes 0..dim1, y goes 0..dim2, and (x,y) are tile coordinates
// This means dim1 = max X = width, dim2 = max Y = height
// But the old code ALSO says: mapwidth = bgtiles[0][0].length = dim2
//
// The old code's mapwidth/mapheight names are SWAPPED relative to the data!
// Let's ignore the names and follow the rendering: first dim = X, second dim = Y
// Width (X extent) = dim1, Height (Y extent) = dim2

const width = dim1;   // X extent (first index in old data)
const height = dim2;  // Y extent (second index in old data)

console.log(`Map size: ${width} x ${height} tiles (${width*tiledimx} x ${height*tiledimy} px)`);
console.log(`BG layers: ${bgtiles.length}, ObjMap layers: ${objmap.length}`);
console.log(`Labels: ${maplabels.length}`);

// Flatten: old data is tiles[x][y], our format needs flat[y * width + x]
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
    type: "bg",
    tiles: flattenLayer(bgtiles[i]),
    visible: true,
  });
}
for (let i = 0; i < objmap.length; i++) {
  layers.push({
    name: `obj${i}`,
    type: "obj",
    tiles: flattenLayer(objmap[i]),
    visible: true,
  });
}
layers.push({
  name: "overlay",
  type: "overlay",
  tiles: new Array(width * height).fill(-1),
  visible: true,
});

// Convert labels — in the old engine labels use (sx,sy) as tile coords
// Since old engine has x as first dim, these should map directly
const labels = maplabels.map(l => ({
  name: l.label,
  x: l.sx,
  y: l.sy,
  width: (l.ex - l.sx) + 1,
  height: (l.ey - l.sy) + 1,
}));

const mapJson = {
  id: "camineet",
  name: "camineet",
  width,
  height,
  tileWidth: tiledimx,
  tileHeight: tiledimy,
  tilesetUrl: "/assets/tilesets/ps1-camineet.png",
  tilesetPxW: tilesetpxw,
  tilesetPxH: tilesetpxh,
  layers,
  collisionMask: buildCollisionMask(),
  labels,
  animatedTiles: [],
  portals: [
    {
      name: "exit-to-cabin",
      x: 35, y: 14,
      width: 1, height: 2,
      targetMap: "cozy-cabin",
      targetSpawn: "start1",
      direction: "right",
      transition: "fade",
    }
  ],
  musicUrl: "/assets/audio/ps1-town.mp3",
  combatEnabled: false,
  status: "published",
};

writeFileSync('public/assets/maps/camineet.json', JSON.stringify(mapJson));
console.log(`Wrote public/assets/maps/camineet.json (${(JSON.stringify(mapJson).length / 1024).toFixed(0)} KB)`);
