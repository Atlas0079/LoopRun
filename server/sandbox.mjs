import {readFileSync} from 'node:fs';
import {distance} from '../shared/geo.mjs';

export const PERSONAS = [
  {id:'road-a',name:'跑者 A',color:'#d8f16b'},
  {id:'road-b',name:'跑者 B',color:'#a6b8ff'},
  {id:'road-c',name:'跑者 C',color:'#f0a77d'},
];
export const ROAD_CATALOG=JSON.parse(readFileSync(new URL('./road-routes.json',import.meta.url),'utf8'));

export function simulationRoute(playerId,preset,now){
  const route=ROAD_CATALOG.routes.find(r=>r.id===preset);
  if(!route)throw new Error('请选择一条已经沿步行路网规划的路线。');
  const points=[];let travelled=0;
  for(let i=0;i<route.points.length;i++){
    const p=route.points[i];
    if(!i){points.push({...p,elapsed:0});continue;}
    const previous=route.points[i-1],length=distance(previous,p),steps=Math.max(1,Math.ceil(length/15));
    for(let step=1;step<=steps;step++)points.push({lat:previous.lat+(p.lat-previous.lat)*step/steps,lng:previous.lng+(p.lng-previous.lng)*step/steps,elapsed:(travelled+length*step/steps)/2.8*1000});
    travelled+=length;
  }
  const duration=points.at(-1).elapsed;
  return points.map(({elapsed,...p})=>({...p,time:now-duration+elapsed,accuracy:5}));
}
