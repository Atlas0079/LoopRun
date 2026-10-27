import {distance} from './geo.mjs';
export function simulationPoints(route,now){
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
