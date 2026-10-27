import {readFileSync} from 'node:fs';
import {simulationPoints} from '../shared/road-simulation.mjs';

export const PERSONAS = [
  {id:'road-a',name:'跑者 A',color:'#d8f16b'},
  {id:'road-b',name:'跑者 B',color:'#a6b8ff'},
  {id:'road-c',name:'跑者 C',color:'#f0a77d'},
];
export {BOT_PERSONAS} from '../shared/bot-personas.mjs';

export const ROAD_CATALOG=JSON.parse(readFileSync(new URL('./road-routes.json',import.meta.url),'utf8'));

export function simulationRoute(playerId,preset,now){
  const route=ROAD_CATALOG.routes.find(r=>r.id===preset);
  if(!route)throw new Error('请选择一条已经沿步行路网规划的路线。');
  return simulationPoints(route,now);
}
