export const DEFAULT_CENTER = { lat: 31.2353, lng: 121.4747 };

export const RULES = Object.freeze({
  poolSize: 6,
  maxFortification: 3,
  normalDamage: 1,
  returnDamage: 2,
  returnAfterMs: 3 * 86400000,
  removeAfterMs: 14 * 86400000,
  hexFlatToFlat: 50,
  gridReferenceLatitude: DEFAULT_CENTER.lat,
  publicLocationSize: 80,
  minPoints: 8,
  minDistance: 600,
  minDurationMs: 180000,
  maxClosure: 80,
  minCells: 4,
  maxCells: 12000,
  maxPoints: 6000,
  maxAccuracy: 80,
  maxGapMs: 90000,
  maxSpeed: 10,
  maxAverageSpeed: 7,
  liveLifetimeMs: 35000,
  sessionLifetimeMs: 30 * 86400000,
});

export const COLORS = ['#d8f16b', '#a6b8ff', '#f0a77d', '#8ed5ce', '#e7a8d4', '#c3c7ca'];

export function localDay(time) {
  return new Date(time + 8 * 3600000).toISOString().slice(0, 10);
}

export function comebackDamage(player, time) {
  return !player.lastValidRunAt || time - player.lastValidRunAt >= RULES.returnAfterMs
    ? RULES.returnDamage : RULES.normalDamage;
}
