export function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

export function volumeFromDistance(
  dist: number,
  radius: number,
  baseVolume: number,
): number {
  if (dist >= radius) return 0;
  return (1 - dist / radius) * baseVolume;
}
