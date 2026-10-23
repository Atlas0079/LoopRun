import {readFile,writeFile} from 'node:fs/promises';
import {distance,enclosedCells,overlap} from '../shared/geo.mjs';

const definitions=[
  {id:'park',name:'人民广场街区',description:'六合路—九江路—浙江中路',locations:[[31.2329,121.4708],[31.2372,121.4708],[31.2372,121.476],[31.2329,121.476],[31.2329,121.4708]]},
  {id:'east',name:'向东跑一圈',description:'南京东路周边步行街区',locations:[[31.2332,121.4737],[31.2381,121.4737],[31.2381,121.4802],[31.2332,121.4802],[31.2332,121.4737]]},
  {id:'north',name:'北侧街区',description:'另一片可步行街区',locations:[[31.2402,121.4710],[31.2440,121.4710],[31.2440,121.4772],[31.2402,121.4772],[31.2402,121.4710]]},
  {id:'outer',name:'外围长圈',description:'沿外围道路包围两个街区',locations:[[31.2295,121.4680],[31.2340,121.4680],[31.2410,121.4680],[31.2410,121.4750],[31.2410,121.4850],[31.2340,121.4850],[31.2295,121.4850],[31.2295,121.4750],[31.2295,121.4680]]},
];
function decode(encoded){
  let index=0,lat=0,lng=0;const points=[];
  const next=()=>{let result=0,shift=0,value;do{value=encoded.charCodeAt(index++)-63;result|=(value&31)<<shift;shift+=5;}while(value>=32);return result&1?~(result>>1):result>>1;};
  while(index<encoded.length){lat+=next();lng+=next();points.push({lat:lat/1e6,lng:lng/1e6});}return points;
}
let cached=[];try{cached=JSON.parse(await readFile('server/road-routes.json','utf8')).routes;}catch{}
const routes=[];
for(const definition of definitions){
  const existing=cached.find(r=>r.id===definition.id&&JSON.stringify(r.locations)===JSON.stringify(definition.locations));
  if(existing){routes.push(existing);console.log(JSON.stringify({id:existing.id,cached:true,km:(existing.distance/1000).toFixed(2)}));continue;}
  let value;
  if(!value){
    const response=await fetch('https://valhalla1.openstreetmap.de/route',{
      method:'POST',headers:{'Content-Type':'application/json','X-Client-Id':'LoopRun-local-preview','User-Agent':'LoopRunLocal/0.1 (local route preview)'},
      body:JSON.stringify({locations:definition.locations.map(([lat,lon])=>({lat,lon,type:'break'})),costing:'pedestrian',directions_options:{units:'kilometers'}}),signal:AbortSignal.timeout(35000),
    });
    value=await response.json();if(!response.ok)throw new Error(JSON.stringify(value));
  }
  const points=[];
  for(const leg of value.trip.legs){
    const shape=typeof leg.shape==='string'?decode(leg.shape):leg.shape.coordinates.map(([lng,lat])=>({lat,lng}));
    for(const p of shape)if(!points.length||distance(points.at(-1),p)>0.1)points.push(p);
  }
  const length=points.reduce((n,p,i)=>n+(i?distance(points[i-1],p):0),0);
  const roads=[...new Set(value.trip.legs.flatMap(l=>l.maneuvers.flatMap(m=>m.street_names||[])))];
  const route={...definition,points,distance:length,roads,closure:distance(points[0],points.at(-1)),providerSummary:value.trip.summary};
  const cells=enclosedCells(points);route.coveredCells=cells.length;
  routes.push(route);console.log(JSON.stringify({id:route.id,km:(length/1000).toFixed(2),points:points.length,cells:cells.length,closure:route.closure,roads}));
  if(definition.id!=='outer')await new Promise(resolve=>setTimeout(resolve,1100));
}
const footprints=routes.map(r=>enclosedCells(r.points));
console.log(JSON.stringify({parkEastOverlap:overlap(footprints[0],footprints[1]),parkNorthOverlap:overlap(footprints[0],footprints[2]),outerCoversPark:footprints[0].every(key=>footprints[3].includes(key))}));
await writeFile('server/road-routes.json',JSON.stringify({provider:'Valhalla pedestrian routing / OpenStreetMap',source:'https://valhalla1.openstreetmap.de/route',license:'© OpenStreetMap contributors · ODbL',fetchedAt:new Date().toISOString(),routes},null,2));
