# AudioManager Performance Notes

## Current optimizations

- **Buffer cache**: `loadBuffer` caches decoded `AudioBuffer`s by URL. Repeated loads of the same SFX/music avoid re-fetch and re-decode.
- **OfflineAudioContext**: When `AudioContext` is not yet unlocked, decoding uses `OfflineAudioContext` so we can decode without user gesture; playback starts once unlocked.

## Potential bottlenecks

1. **Unbounded cache**: `bufferCache` grows without limit. Many unique URLs could increase memory. Consider LRU eviction if many distinct sounds are used.
2. **Synchronous decode**: `decodeAudioData` is async but blocks the main thread during decode. Large files may cause brief stalls.
3. **Adapter creation**: `toPlaybackAdapter()` and `toLoadAndPlayAdapter()` allocate new objects per call. Called frequently (e.g. in `stop()` → `stopPlayback()`), this adds GC pressure. Consider caching adapters if profiling shows impact.

## Recommendations

- Profile with many ambient SFX and map changes to validate cache and adapter overhead.
- If cache grows large, add `maxCacheSize` and evict least-recently-used entries.
