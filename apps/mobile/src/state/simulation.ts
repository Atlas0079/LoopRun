import type {LocalRun,Point} from '../../modules/looprun-native';
import {distance} from '../../../../shared/geo.mjs';
export type SimulatedActivity={id:string;startedAt:number;source:'simulation';route:Omit<Point,'seq'>[];roadRouteName?:string};
export type Simulation=LocalRun&{source:'simulation';fullRoute:Point[];wallStartedAt:number};
export function createSimulation(activity:SimulatedActivity,recovered=false):Simulation{
  const fullRoute=activity.route.map((p,i)=>({...p,seq:i+1}));
  if(fullRoute.length<2)throw new Error('服务器没有返回有效的模拟路线');
  const run:Simulation={id:activity.id,source:'simulation',started:activity.startedAt,offset_ms:0,status:'recording',acked:0,distance:0,max_gap:0,error:'',pointCount:1,route:fullRoute.slice(0,1),fullRoute,wallStartedAt:Date.now()-(recovered?14000:0)};
  return advanceSimulation(run,Date.now());
}
export function advanceSimulation(run:Simulation,now:number):Simulation{
  if(run.status!=='recording')return run;
  const count=Math.max(1,Math.min(run.fullRoute.length,Math.ceil((now-run.wallStartedAt)/14000*run.fullRoute.length)));
  if(count===run.pointCount)return run;
  const route=run.fullRoute.slice(0,count);
  return {...run,route,pointCount:count,distance:route.reduce((sum,p,i)=>sum+(i?distance(route[i-1],p):0),0)};
}
