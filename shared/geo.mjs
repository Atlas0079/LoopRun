import { RULES } from './config.mjs';

const R = 6378137;
const rad = Math.PI / 180;
const REFERENCE_SCALE = 1 / Math.cos(RULES.gridReferenceLatitude * rad);
const HEX_WIDTH = RULES.hexFlatToFlat * REFERENCE_SCALE;
const HEX_RADIUS = HEX_WIDTH / Math.sqrt(3);
const HEX_ROW = HEX_RADIUS * 1.5;

export function project(point) {
  return { x: R * point.lng * rad, y: R * Math.log(Math.tan(Math.PI / 4 + point.lat * rad / 2)) };
}

export function unproject(point) {
  return { lng: point.x / R / rad, lat: (2 * Math.atan(Math.exp(point.y / R)) - Math.PI / 2) / rad };
}

export function distance(a, b) {
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

export function cellKey(point) {
  const p = project(point);
  const q = (Math.sqrt(3) / 3 * p.x - p.y / 3) / HEX_RADIUS;
  const r = (2 / 3 * p.y) / HEX_RADIUS;
  const cubeY = -q-r;
  let x = Math.round(q), y = Math.round(cubeY), z = Math.round(r);
  const dx=Math.abs(x-q),dy=Math.abs(y-cubeY),dz=Math.abs(z-r);
  if(dx>dy && dx>dz) x=-y-z;
  else if(dy>dz) y=-x-z;
  else z=-x-y;
  return `h:${x}:${z}`;
}

function projectedCenter(key) {
  const [,q,r] = key.split(':').map((part,index)=>index?Number(part):part);
  if(!key.startsWith('h:') || !Number.isInteger(q) || !Number.isInteger(r)) throw new Error('六边形编号无效。');
  return {x:HEX_WIDTH*(q+r/2),y:HEX_ROW*r};
}

export function cellCenter(key) {
  return unproject(projectedCenter(key));
}

export function cellCorners(key) {
  const center=projectedCenter(key);
  return Array.from({length:6},(_,i)=>{
    const angle=(30+i*60)*rad;
    return unproject({x:center.x+HEX_RADIUS*Math.cos(angle),y:center.y+HEX_RADIUS*Math.sin(angle)});
  });
}

export function cellArea(key) {
  return 3*Math.sqrt(3)/2*HEX_RADIUS**2*Math.cos(cellCenter(key).lat*rad)**2;
}

export function approximateLocation(point) {
  const p=project(point),size=RULES.publicLocationSize*REFERENCE_SCALE;
  return unproject({x:(Math.floor(p.x/size)+0.5)*size,y:(Math.floor(p.y/size)+0.5)*size});
}

function inside(point, ring) {
  let winding = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    const side = (b.x-a.x)*(point.y-a.y)-(point.x-a.x)*(b.y-a.y);
    if(a.y<=point.y && b.y>point.y && side>0) winding++;
    else if(a.y>point.y && b.y<=point.y && side<0) winding--;
  }
  return winding !== 0;
}

export function enclosedCells(route) {
  // 分别保留返回起点附近形成的子闭环，绕两圈或反向重跑也取覆盖并集。
  const loops=[];
  let start=0,travelled=0;
  for(let i=1;i<route.length;i++) {
    travelled+=distance(route[i-1],route[i]);
    if(travelled>=200 && distance(route[start],route[i])<=25 && i-start>=3) {
      loops.push(route.slice(start,i+1));start=i;travelled=0;
    }
  }
  if(!loops.length || (route.length-start>=4 && distance(route[start],route.at(-1))<=RULES.maxClosure)) loops.push(route.slice(start));
  const rings=loops.map(loop=>loop.map(project));
  const ring=route.map(project);
  const xs = ring.map(p => p.x), ys = ring.map(p => p.y);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const firstRow=Math.floor(minY/HEX_ROW)-1,lastRow=Math.ceil(maxY/HEX_ROW)+1;
  if ((Math.ceil((maxX-minX)/HEX_WIDTH)+3)*(lastRow-firstRow+1)>RULES.maxCells*4) throw new Error('本次包围范围过大，请选择更小的闭环。');
  const cells = [];
  for(let r=firstRow;r<=lastRow;r++) {
    const firstColumn=Math.floor(minX/HEX_WIDTH-r/2)-1,lastColumn=Math.ceil(maxX/HEX_WIDTH-r/2)+1;
    for(let q=firstColumn;q<=lastColumn;q++) {
      const point={x:HEX_WIDTH*(q+r/2),y:HEX_ROW*r};
      if(rings.some(loop=>inside(point,loop))) cells.push(`h:${q}:${r}`);
    }
  }
  if (cells.length > RULES.maxCells) throw new Error('本次包围范围超过首版上限。');
  return cells;
}

export function validateRoute(raw, startedAt, now) {
  if (!Array.isArray(raw) || raw.length < RULES.minPoints || raw.length > RULES.maxPoints) throw new Error(`有效采样点需为 ${RULES.minPoints}–${RULES.maxPoints} 个。`);
  const route = raw.map(p => ({ lat: Number(p.lat), lng: Number(p.lng), time: Number(p.time), accuracy: Number(p.accuracy) }));
  for (const p of route) {
    if (![p.lat, p.lng, p.time, p.accuracy].every(Number.isFinite) || Math.abs(p.lat) > 80 || Math.abs(p.lng) > 180 || p.accuracy < 0 || p.accuracy > RULES.maxAccuracy) throw new Error('定位精度不足或轨迹格式无效。请在开阔区域继续采样。');
  }
  if (route[0].time < startedAt - 10000 || route.at(-1).time > now + 10000 || now - route.at(-1).time > 120000) throw new Error('轨迹时间与本次活动不一致。');
  let length = 0;
  for (let i = 1; i < route.length; i++) {
    const dt = route[i].time - route[i - 1].time;
    const segment = distance(route[i - 1], route[i]);
    if (dt <= 0 || dt > RULES.maxGapMs) throw new Error('定位采样有较长中断，本次不能作为连续闭环结算。');
    if (segment / (dt / 1000) > RULES.maxSpeed) throw new Error('检测到异常速度或定位跳点，本次未改变领地。');
    length += segment;
  }
  const duration = route.at(-1).time - route[0].time;
  const closure = distance(route[0], route.at(-1));
  if (duration < RULES.minDurationMs || length < RULES.minDistance) throw new Error('有效闭环至少需要 600 米、3 分钟，请继续跑步。');
  if (length / (duration / 1000) > RULES.maxAverageSpeed) throw new Error('本次平均速度超出跑步模式范围。');
  if (closure > RULES.maxClosure) throw new Error(`距起点还有 ${Math.round(closure)} 米，请回到起点 ${RULES.maxClosure} 米范围内再结束。`);
  const cells = enclosedCells(route);
  if (cells.length < RULES.minCells) throw new Error('闭环包围范围太小，需至少覆盖 4 个地图格。');
  return { route, cells, distance: length, duration, closure, area: cells.reduce((sum, key) => sum + cellArea(key), 0) };
}

export function overlap(a, b) {
  const other = new Set(b);
  const common = a.filter(k => other.has(k)).length;
  return common / Math.max(1, Math.min(a.length, b.length));
}

export function offsetPoint(center, east, north) {
  const p = project(center), scale = 1 / Math.cos(center.lat * rad);
  return unproject({ x: p.x + east * scale, y: p.y + north * scale });
}

// 小程序地图使用 GCJ-02，所有规则计算和存储统一为 WGS84。
export function wgsToGcj(point) {
  const { lat, lng } = point;
  if (lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271) return { lat, lng };
  const x = lng - 105, y = lat - 35;
  let dLat = -100 + 2*x + 3*y + 0.2*y*y + 0.1*x*y + 0.2*Math.sqrt(Math.abs(x));
  dLat += (20*Math.sin(6*x*Math.PI)+20*Math.sin(2*x*Math.PI))*2/3;
  dLat += (20*Math.sin(y*Math.PI)+40*Math.sin(y/3*Math.PI))*2/3;
  dLat += (160*Math.sin(y/12*Math.PI)+320*Math.sin(y*Math.PI/30))*2/3;
  let dLng = 300+x+2*y+0.1*x*x+0.1*x*y+0.1*Math.sqrt(Math.abs(x));
  dLng += (20*Math.sin(6*x*Math.PI)+20*Math.sin(2*x*Math.PI))*2/3;
  dLng += (20*Math.sin(x*Math.PI)+40*Math.sin(x/3*Math.PI))*2/3;
  dLng += (150*Math.sin(x/12*Math.PI)+300*Math.sin(x/30*Math.PI))*2/3;
  const magic = 1-0.00669342162296594323*Math.sin(lat*rad)**2;
  dLat = dLat*180/((6378245*(1-0.00669342162296594323))/(magic*Math.sqrt(magic))*Math.PI);
  dLng = dLng*180/(6378245/Math.sqrt(magic)*Math.cos(lat*rad)*Math.PI);
  return { lat: lat+dLat, lng: lng+dLng };
}

export function gcjToWgs(point) {
  let guess={...point};
  for(let i=0;i<3;i++) {
    const converted=wgsToGcj(guess);
    guess={lat:guess.lat+point.lat-converted.lat,lng:guess.lng+point.lng-converted.lng};
  }
  return guess;
}
