import {distance} from './geo.mjs';

// Client-side GPS simulator: route geometry is fixed, timestamps follow the actual clock.
export function roadPlayback(route,startPercent=0){
  if(!Number.isInteger(startPercent)||startPercent<0||startPercent>99)throw new Error('起跑位置应为路线的 0 至 99%。');
  const ring=route.points.slice(0,-1),start=Math.floor(ring.length*startPercent/100);
  const points=[...ring.slice(start),...ring.slice(0,start),ring[start]],lengths=[0];
  for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+distance(points[i-1],points[i]));
  return {points,lengths,duration:Math.ceil(lengths.at(-1)/2.8*1000)};
}
export function playbackPoint(playback,elapsed){
  const meters=Math.min(playback.lengths.at(-1),Math.max(0,elapsed)/1000*2.8);
  let i=1;while(i<playback.points.length-1&&playback.lengths[i]<meters)i++;
  const previous=playback.points[i-1],next=playback.points[i],length=playback.lengths[i]-playback.lengths[i-1];
  const ratio=length?(meters-playback.lengths[i-1])/length:0;
  return {lat:previous.lat+(next.lat-previous.lat)*ratio,lng:previous.lng+(next.lng-previous.lng)*ratio,accuracy:5};
}
export function playbackSamples(playback,startedAt,through,now){
  const count=Math.floor(playback.duration/3000)+1+(playback.duration%3000?1:0),points=[];
  for(let i=through;i<count&&points.length<200;i++){
    const elapsed=Math.min(i*3000,playback.duration),time=startedAt+elapsed;
    if(time>now)break;
    points.push({...playbackPoint(playback,elapsed),seq:i+1,time});
  }
  return points;
}
