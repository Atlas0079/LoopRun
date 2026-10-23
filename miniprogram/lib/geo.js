var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// shared/geo.mjs
var geo_exports = {};
__export(geo_exports, {
  approximateLocation: () => approximateLocation,
  cellArea: () => cellArea,
  cellCenter: () => cellCenter,
  cellCorners: () => cellCorners,
  cellKey: () => cellKey,
  distance: () => distance,
  enclosedCells: () => enclosedCells,
  gcjToWgs: () => gcjToWgs,
  offsetPoint: () => offsetPoint,
  overlap: () => overlap,
  project: () => project,
  unproject: () => unproject,
  validateRoute: () => validateRoute,
  wgsToGcj: () => wgsToGcj
});
module.exports = __toCommonJS(geo_exports);

// shared/config.mjs
var DEFAULT_CENTER = { lat: 31.2353, lng: 121.4747 };
var RULES = Object.freeze({
  poolSize: 6,
  maxFortification: 3,
  normalDamage: 1,
  returnDamage: 2,
  returnAfterMs: 3 * 864e5,
  removeAfterMs: 14 * 864e5,
  hexFlatToFlat: 50,
  gridReferenceLatitude: DEFAULT_CENTER.lat,
  publicLocationSize: 80,
  minPoints: 8,
  minDistance: 600,
  minDurationMs: 18e4,
  maxClosure: 80,
  minCells: 4,
  maxCells: 12e3,
  maxPoints: 6e3,
  maxAccuracy: 80,
  maxGapMs: 9e4,
  maxSpeed: 10,
  maxAverageSpeed: 7,
  liveLifetimeMs: 35e3,
  sessionLifetimeMs: 30 * 864e5
});

// shared/geo.mjs
var R = 6378137;
var rad = Math.PI / 180;
var REFERENCE_SCALE = 1 / Math.cos(RULES.gridReferenceLatitude * rad);
var HEX_WIDTH = RULES.hexFlatToFlat * REFERENCE_SCALE;
var HEX_RADIUS = HEX_WIDTH / Math.sqrt(3);
var HEX_ROW = HEX_RADIUS * 1.5;
function project(point) {
  return { x: R * point.lng * rad, y: R * Math.log(Math.tan(Math.PI / 4 + point.lat * rad / 2)) };
}
function unproject(point) {
  return { lng: point.x / R / rad, lat: (2 * Math.atan(Math.exp(point.y / R)) - Math.PI / 2) / rad };
}
function distance(a, b) {
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
function cellKey(point) {
  const p = project(point);
  const q = (Math.sqrt(3) / 3 * p.x - p.y / 3) / HEX_RADIUS;
  const r = 2 / 3 * p.y / HEX_RADIUS;
  const cubeY = -q - r;
  let x = Math.round(q), y = Math.round(cubeY), z = Math.round(r);
  const dx = Math.abs(x - q), dy = Math.abs(y - cubeY), dz = Math.abs(z - r);
  if (dx > dy && dx > dz) x = -y - z;
  else if (dy > dz) y = -x - z;
  else z = -x - y;
  return `h:${x}:${z}`;
}
function projectedCenter(key) {
  const [, q, r] = key.split(":").map((part, index) => index ? Number(part) : part);
  if (!key.startsWith("h:") || !Number.isInteger(q) || !Number.isInteger(r)) throw new Error("\u516D\u8FB9\u5F62\u7F16\u53F7\u65E0\u6548\u3002");
  return { x: HEX_WIDTH * (q + r / 2), y: HEX_ROW * r };
}
function cellCenter(key) {
  return unproject(projectedCenter(key));
}
function cellCorners(key) {
  const center = projectedCenter(key);
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (30 + i * 60) * rad;
    return unproject({ x: center.x + HEX_RADIUS * Math.cos(angle), y: center.y + HEX_RADIUS * Math.sin(angle) });
  });
}
function cellArea(key) {
  return 3 * Math.sqrt(3) / 2 * HEX_RADIUS ** 2 * Math.cos(cellCenter(key).lat * rad) ** 2;
}
function approximateLocation(point) {
  const p = project(point), size = RULES.publicLocationSize * REFERENCE_SCALE;
  return unproject({ x: (Math.floor(p.x / size) + 0.5) * size, y: (Math.floor(p.y / size) + 0.5) * size });
}
function inside(point, ring) {
  let winding = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    const side = (b.x - a.x) * (point.y - a.y) - (point.x - a.x) * (b.y - a.y);
    if (a.y <= point.y && b.y > point.y && side > 0) winding++;
    else if (a.y > point.y && b.y <= point.y && side < 0) winding--;
  }
  return winding !== 0;
}
function enclosedCells(route) {
  const loops = [];
  let start = 0, travelled = 0;
  for (let i = 1; i < route.length; i++) {
    travelled += distance(route[i - 1], route[i]);
    if (travelled >= 200 && distance(route[start], route[i]) <= 25 && i - start >= 3) {
      loops.push(route.slice(start, i + 1));
      start = i;
      travelled = 0;
    }
  }
  if (!loops.length || route.length - start >= 4 && distance(route[start], route.at(-1)) <= RULES.maxClosure) loops.push(route.slice(start));
  const rings = loops.map((loop) => loop.map(project));
  const ring = route.map(project);
  const xs = ring.map((p) => p.x), ys = ring.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const firstRow = Math.floor(minY / HEX_ROW) - 1, lastRow = Math.ceil(maxY / HEX_ROW) + 1;
  if ((Math.ceil((maxX - minX) / HEX_WIDTH) + 3) * (lastRow - firstRow + 1) > RULES.maxCells * 4) throw new Error("\u672C\u6B21\u5305\u56F4\u8303\u56F4\u8FC7\u5927\uFF0C\u8BF7\u9009\u62E9\u66F4\u5C0F\u7684\u95ED\u73AF\u3002");
  const cells = [];
  for (let r = firstRow; r <= lastRow; r++) {
    const firstColumn = Math.floor(minX / HEX_WIDTH - r / 2) - 1, lastColumn = Math.ceil(maxX / HEX_WIDTH - r / 2) + 1;
    for (let q = firstColumn; q <= lastColumn; q++) {
      const point = { x: HEX_WIDTH * (q + r / 2), y: HEX_ROW * r };
      if (rings.some((loop) => inside(point, loop))) cells.push(`h:${q}:${r}`);
    }
  }
  if (cells.length > RULES.maxCells) throw new Error("\u672C\u6B21\u5305\u56F4\u8303\u56F4\u8D85\u8FC7\u9996\u7248\u4E0A\u9650\u3002");
  return cells;
}
function validateRoute(raw, startedAt, now) {
  if (!Array.isArray(raw) || raw.length < RULES.minPoints || raw.length > RULES.maxPoints) throw new Error(`\u6709\u6548\u91C7\u6837\u70B9\u9700\u4E3A ${RULES.minPoints}\u2013${RULES.maxPoints} \u4E2A\u3002`);
  const route = raw.map((p) => ({ lat: Number(p.lat), lng: Number(p.lng), time: Number(p.time), accuracy: Number(p.accuracy) }));
  for (const p of route) {
    if (![p.lat, p.lng, p.time, p.accuracy].every(Number.isFinite) || Math.abs(p.lat) > 80 || Math.abs(p.lng) > 180 || p.accuracy < 0 || p.accuracy > RULES.maxAccuracy) throw new Error("\u5B9A\u4F4D\u7CBE\u5EA6\u4E0D\u8DB3\u6216\u8F68\u8FF9\u683C\u5F0F\u65E0\u6548\u3002\u8BF7\u5728\u5F00\u9614\u533A\u57DF\u7EE7\u7EED\u91C7\u6837\u3002");
  }
  if (route[0].time < startedAt - 1e4 || route.at(-1).time > now + 1e4 || now - route.at(-1).time > 12e4) throw new Error("\u8F68\u8FF9\u65F6\u95F4\u4E0E\u672C\u6B21\u6D3B\u52A8\u4E0D\u4E00\u81F4\u3002");
  let length = 0;
  for (let i = 1; i < route.length; i++) {
    const dt = route[i].time - route[i - 1].time;
    const segment = distance(route[i - 1], route[i]);
    if (dt <= 0 || dt > RULES.maxGapMs) throw new Error("\u5B9A\u4F4D\u91C7\u6837\u6709\u8F83\u957F\u4E2D\u65AD\uFF0C\u672C\u6B21\u4E0D\u80FD\u4F5C\u4E3A\u8FDE\u7EED\u95ED\u73AF\u7ED3\u7B97\u3002");
    if (segment / (dt / 1e3) > RULES.maxSpeed) throw new Error("\u68C0\u6D4B\u5230\u5F02\u5E38\u901F\u5EA6\u6216\u5B9A\u4F4D\u8DF3\u70B9\uFF0C\u672C\u6B21\u672A\u6539\u53D8\u9886\u5730\u3002");
    length += segment;
  }
  const duration = route.at(-1).time - route[0].time;
  const closure = distance(route[0], route.at(-1));
  if (duration < RULES.minDurationMs || length < RULES.minDistance) throw new Error("\u6709\u6548\u95ED\u73AF\u81F3\u5C11\u9700\u8981 600 \u7C73\u30013 \u5206\u949F\uFF0C\u8BF7\u7EE7\u7EED\u8DD1\u6B65\u3002");
  if (length / (duration / 1e3) > RULES.maxAverageSpeed) throw new Error("\u672C\u6B21\u5E73\u5747\u901F\u5EA6\u8D85\u51FA\u8DD1\u6B65\u6A21\u5F0F\u8303\u56F4\u3002");
  if (closure > RULES.maxClosure) throw new Error(`\u8DDD\u8D77\u70B9\u8FD8\u6709 ${Math.round(closure)} \u7C73\uFF0C\u8BF7\u56DE\u5230\u8D77\u70B9 ${RULES.maxClosure} \u7C73\u8303\u56F4\u5185\u518D\u7ED3\u675F\u3002`);
  const cells = enclosedCells(route);
  if (cells.length < RULES.minCells) throw new Error("\u95ED\u73AF\u5305\u56F4\u8303\u56F4\u592A\u5C0F\uFF0C\u9700\u81F3\u5C11\u8986\u76D6 4 \u4E2A\u5730\u56FE\u683C\u3002");
  return { route, cells, distance: length, duration, closure, area: cells.reduce((sum, key) => sum + cellArea(key), 0) };
}
function overlap(a, b) {
  const other = new Set(b);
  const common = a.filter((k) => other.has(k)).length;
  return common / Math.max(1, Math.min(a.length, b.length));
}
function offsetPoint(center, east, north) {
  const p = project(center), scale = 1 / Math.cos(center.lat * rad);
  return unproject({ x: p.x + east * scale, y: p.y + north * scale });
}
function wgsToGcj(point) {
  const { lat, lng } = point;
  if (lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271) return { lat, lng };
  const x = lng - 105, y = lat - 35;
  let dLat = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  dLat += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
  dLat += (20 * Math.sin(y * Math.PI) + 40 * Math.sin(y / 3 * Math.PI)) * 2 / 3;
  dLat += (160 * Math.sin(y / 12 * Math.PI) + 320 * Math.sin(y * Math.PI / 30)) * 2 / 3;
  let dLng = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  dLng += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
  dLng += (20 * Math.sin(x * Math.PI) + 40 * Math.sin(x / 3 * Math.PI)) * 2 / 3;
  dLng += (150 * Math.sin(x / 12 * Math.PI) + 300 * Math.sin(x / 30 * Math.PI)) * 2 / 3;
  const magic = 1 - 0.006693421622965943 * Math.sin(lat * rad) ** 2;
  dLat = dLat * 180 / (6378245 * (1 - 0.006693421622965943) / (magic * Math.sqrt(magic)) * Math.PI);
  dLng = dLng * 180 / (6378245 / Math.sqrt(magic) * Math.cos(lat * rad) * Math.PI);
  return { lat: lat + dLat, lng: lng + dLng };
}
function gcjToWgs(point) {
  let guess = { ...point };
  for (let i = 0; i < 3; i++) {
    const converted = wgsToGcj(guess);
    guess = { lat: guess.lat + point.lat - converted.lat, lng: guess.lng + point.lng - converted.lng };
  }
  return guess;
}
