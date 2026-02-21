# MapRenderer.ts Analysis Report

**Date:** 2025-02-20  
**Scope:** `src/engine/MapRenderer.ts`, `src/engine/MapRenderer/renderLayer.ts`, `src/engine/MapRenderer/loadTileset.ts`

---

## 1. Types to Fix

### 1.1 Texture.source width access

**Location:** `src/engine/MapRenderer/renderLayer.ts` (lines 7–12)

**Current code:**
```typescript
function getSourceWidth(source: unknown, fallback: number): number {
  if (source && typeof source === "object" && "width" in source) {
    const w = (source as { width: unknown }).width;
    if (typeof w === "number") return w;
  }
  return fallback;
}
// ...
const sourceWidth = getSourceWidth(tilesetTexture.source, mapData.tilesetPxW);
```

**Issue:** Uses `unknown` and runtime checks instead of PixiJS types. In PixiJS v8, `Texture.source` is `TextureSource`, which exposes width directly.

**Correct type:** `TextureSource` has:
- `resourceWidth` / `resourceHeight` – pixel dimensions (not resolution-adjusted)
- `pixelWidth` / `pixelHeight` – same
- `width` / `height` – resolution-adjusted

For tileset layout, use pixel dimensions.

**Recommended fix:**
```typescript
import type { TextureSource } from "pixi.js";

function getSourceWidth(source: TextureSource, fallback: number): number {
  return source.resourceWidth ?? source.pixelWidth ?? fallback;
}
```

Or, if you prefer to avoid a helper:
```typescript
const sourceWidth = tilesetTexture.source.resourceWidth ?? mapData.tilesetPxW;
```

---

### 1.2 `__regionKey` on tileGhostContainer

**Locations:** `src/engine/MapRenderer.ts` lines 428, 439, 468, 477

**Current code:**
```typescript
// Line 428 (showTileGhost)
if ((this.tileGhostContainer as any).__regionKey !== key) {
  // ...
  (this.tileGhostContainer as any).__regionKey = key;
}

// Lines 468, 477 (showIrregularTileGhost)
if ((this.tileGhostContainer as any).__regionKey !== key) {
  // ...
  (this.tileGhostContainer as any).__regionKey = key;
}
```

**Issue:** Uses `(this.tileGhostContainer as any).__regionKey` to store a cache key on the container.

**Recommended fix:** Add a typed property on the class:

```typescript
// Add to class properties (near line 396):
private tileGhostRegionKey: string | null = null;

// In loadMap(), when clearing (around line 107):
this.tileGhostRegionKey = null;

// In showTileGhost (replace lines 428–439):
if (this.tileGhostRegionKey !== key) {
  this.tileGhostContainer.removeChildren();
  // ... build sprites ...
  this.tileGhostRegionKey = key;
}

// In showIrregularTileGhost (replace lines 468–477):
if (this.tileGhostRegionKey !== key) {
  this.tileGhostContainer.removeChildren();
  // ... build sprites ...
  this.tileGhostRegionKey = key;
}
```

---

## 2. Performance Bottlenecks

### 2.1 renderLayer: new Texture + Rectangle per tile

**Severity:** High  
**Location:** `src/engine/MapRenderer/renderLayer.ts` lines 43–56

**Current behavior:**
```typescript
for (let y = 0; y < mapData.height; y++) {
  for (let x = 0; x < mapData.width; x++) {
    // ...
    const frame = new Rectangle(srcX, srcY, mapData.tileWidth, mapData.tileHeight);
    const texture = new Texture({ source: tilesetTexture.source, frame });
    const sprite = new Sprite(texture);
    // ...
  }
}
```

For a 50×50 map with 3 layers, this creates ~7,500 `Rectangle` instances, ~7,500 `Texture` instances, and ~7,500 `Sprite` instances. Each `Texture` shares the same `source` but allocates a new frame object and internal UV data.

**Recommendation:**
- Add a texture frame cache keyed by `${tilesetUrl}:${srcX}:${srcY}:${tileW}:${tileH}` (or by tile index if tile size is fixed).
- Reuse `Texture` instances for identical frames. PixiJS `Texture` with the same source + frame can be shared across sprites.
- Optionally pool or reuse `Rectangle` instances for frame creation (lower impact than texture reuse).

**Example approach:**
```typescript
// In MapRenderer or a shared module:
private tileTextureCache = new Map<string, Texture>();

function getTileTexture(
  tilesetTexture: Texture,
  srcX: number, srcY: number,
  tileW: number, tileH: number
): Texture {
  const key = `${tilesetTexture.uid}:${srcX}:${srcY}:${tileW}:${tileH}`;
  let tex = this.tileTextureCache.get(key);
  if (!tex) {
    tex = new Texture({
      source: tilesetTexture.source,
      frame: new Rectangle(srcX, srcY, tileW, tileH),
    });
    this.tileTextureCache.set(key, tex);
  }
  return tex;
}
```

Cache should be cleared when maps/tilesets change (e.g. in `loadMap`).

---

### 2.2 setTile: full layer re-render

**Severity:** Medium  
**Location:** `src/engine/MapRenderer.ts` lines 177–193

**Current behavior:**
```typescript
setTile(layerIndex: number, x: number, y: number, tileIndex: number) {
  // ...
  container.removeChildren();
  renderLayer(container, layer, this.mapData, tilesetTexture);
}
```

A single tile change triggers `removeChildren()` and a full `renderLayer()` over all tiles in that layer.

**Recommendation:**
- Keep a reference to the sprite at each tile (e.g. `Map<layerIndex, Sprite[][]>` or flat array).
- On `setTile`, update only the sprite at `(x, y)`: change its `texture` (from cache) and leave others untouched.
- Reduces work from O(width × height) to O(1) per tile change.

---

### 2.3 showTileGhost / showIrregularTileGhost: rebuild on region change

**Severity:** Low–Medium  
**Location:** `src/engine/MapRenderer.ts` lines 428–439, 468–477

**Current behavior:**
- Cache key: `${region.col},${region.row},${region.w},${region.h}` (or `irr:...` for irregular).
- When the key changes, all ghost sprites are removed and rebuilt.
- Rebuild creates new `Rectangle`, `Texture`, and `Sprite` for each tile in the region.

**Assessment:** The cache key approach is reasonable: rebuild only when the region changes. The main cost is the per-tile allocations during rebuild.

**Recommendations:**
1. Use the same texture frame cache as in `renderLayer` for ghost tiles.
2. Consider caching ghost sprite sets by region key (reuse sprites when returning to a previously used region) if region changes are frequent.
3. Replace `__regionKey` with `tileGhostRegionKey` as in §1.2.

---

### 2.4 Other hotspots

| Location | Severity | Description |
|----------|----------|-------------|
| `renderCollisionOverlay` (lines 283–309) | Low | Loops over all tiles; uses `Graphics.rect()` per collision tile. Acceptable for overlay toggle; could batch rects if needed. |
| `renderGrid` (lines 511–535) | Low | Loops over width+1 and height+1 for lines. One-time cost when toggling grid. |
| `renderPortalOverlay` / `renderLabelOverlay` | Low | Create new `Graphics` and `Text` per portal/label. Only runs when overlays change. |
| `loadMap` double loop | Medium | For each layer, `renderLayer` does a full tile loop. Mitigated by texture caching in §2.1. |

---

## 3. Summary

| Category | Item | Severity | Effort |
|----------|------|----------|--------|
| Types | `Texture.source` width → use `resourceWidth` / `pixelWidth` | Low | Small |
| Types | `__regionKey` → `tileGhostRegionKey` | Low | Small |
| Performance | Texture/frame cache in `renderLayer` | High | Medium |
| Performance | Incremental `setTile` (update single sprite) | Medium | Medium |
| Performance | Texture cache for tile ghost | Low | Small |

---

## 4. Additional Notes

- **Dead code:** `MapRenderer` has a private `loadTilesetTexture` at lines 533–539, but `loadMap` uses the imported `loadTilesetTexture` from `./MapRenderer/loadTileset.ts`. The private method also uses `Assets`, which is not imported in `MapRenderer.ts`. Consider removing the private method if it is unused.
- **PixiJS v8:** `Texture.source` is `TextureSource`; use its typed properties instead of `unknown` and runtime checks.
