# WorldItemLayer Performance Report

Analysis of `src/engine/WorldItemLayer` (and refactored `WorldItemLayer/*.ts`) with applied optimizations and remaining notes.

## Applied optimizations

1. **Single-loop update** — Bob animation and nearest-item search run in one pass over `rendered` in `update.ts`.
2. **Squared distance** — `update()` and `findItemAt()` compare `distSq` to `radiusSq` / `ITEM_INTERACT_RADIUS_SQ` to avoid `Math.sqrt` in the hot path.
3. **Parallel loadAll** — `loadAll()` uses `Promise.all(items.map(...))` so item adds (and texture/sprite loads) run in parallel instead of sequentially.

## Remaining considerations

- **Texture/sprite caches** — No eviction; growth is bounded by distinct (tileset, tile rect) and sprite sheet URLs. If maps use many unique defs over time, consider clearing caches in `clear()` on map unload or an LRU cap.
- **findItemAt allocation** — Returns a new `{ id, defName, available, def }` per call. Fine unless called every frame (e.g. build-mode cursor); then consider reusing a single result object or returning the `RenderedWorldItem` when acceptable.
- **Ghost create/destroy** — On def change, ghost is destroyed and recreated. Acceptable for typical build-mode usage; if def switches are very frequent, consider reusing one ghost node and swapping texture/sprite.
