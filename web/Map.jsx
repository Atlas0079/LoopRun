import React,{useEffect,useRef,useState} from 'react';
import L from 'leaflet';
import {Plus,Minus,LocateFixed} from 'lucide-react';
import {DEFAULT_CENTER} from '../shared/config.mjs';
import {cellCorners} from '../shared/geo.mjs';

const ll=p=>[p.lat,p.lng];
function fitTerritory(map,data){const own=(data.pool?.cells||[]).filter(c=>c.owner===data.player.id);if(own.length)map.fitBounds(own.flatMap(c=>cellCorners(c.key).map(ll)),{padding:[26,26],maxZoom:17,animate:false});else map.setView(ll(data.player.center||DEFAULT_CENTER),16,{animate:false});}
function fitRoute(map,route){map.fitBounds(route.map(ll),{padding:[26,26],maxZoom:17,animate:false});}
export default function TerritoryMap({data,runners,route,currentPoint,filters,onCell}) {
  const container=useRef(),mapRef=useRef(),baseRef=useRef(),territoryRef=useRef(),routeRef=useRef(),liveRef=useRef(),poolRef=useRef(),viewRef=useRef(),routeRendererRef=useRef(),previousRouteRef=useRef(false);
  viewRef.current={data,route,currentPoint};
  const [tileError,setTileError]=useState(false);
  useEffect(()=>{
    const map=L.map(container.current,{zoomControl:false,attributionControl:false,preferCanvas:true,minZoom:12,maxZoom:19}).setView(ll(data.player.center || DEFAULT_CENTER),16);
    L.control.scale({position:'bottomleft',maxWidth:70,imperial:false,metric:true}).addTo(map);
    mapRef.current=map;
    map.createPane('routePane');map.getPane('routePane').style.zIndex='450';map.getPane('routePane').style.pointerEvents='none';routeRendererRef.current=L.canvas({pane:'routePane'});
    territoryRef.current=L.layerGroup().addTo(map);routeRef.current=L.layerGroup().addTo(map);liveRef.current=L.layerGroup().addTo(map);
    const observer=new ResizeObserver(()=>{map.invalidateSize();const view=viewRef.current;if(!view.currentPoint){if(view.route?.length)fitRoute(map,view.route);else fitTerritory(map,view.data);}});observer.observe(container.current);
    return()=>{observer.disconnect();map.remove();mapRef.current=null;};
  },[]);
  useEffect(()=>{
    const map=mapRef.current;if(!map)return;
    baseRef.current?.remove();setTileError(false);
    const layer=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,crossOrigin:true}).addTo(map);
    layer.on('tileerror',()=>setTileError(true));baseRef.current=layer;layer.bringToBack();
    territoryRef.current?.eachLayer(layer=>layer.bringToFront?.());
  },[]);
  useEffect(()=>{
    const group=territoryRef.current,map=mapRef.current;if(!group)return;
    group.clearLayers();
    const members=new Map((data.pool?.members || []).map(p=>[p.id,p]));
    for(const cell of data.pool?.cells || []) {
      const mine=cell.owner===data.player.id,neutral=!cell.owner;
      if((mine&&!filters.mine)||(!mine&&!neutral&&!filters.rivals)||(neutral&&!filters.neutral))continue;
      const owner=members.get(cell.owner),color=owner?.color || '#8d9792';
      const polygon=L.polygon(cellCorners(cell.key).map(ll),{color:neutral?'#919b91':color,weight:mine?1.8:1.2,fillColor:color,fillOpacity:neutral?0.12:0.18+cell.fortification*0.09,dashArray:neutral?'4 5':undefined,lineCap:'butt',lineJoin:'miter'}).addTo(group);
      const tooltip=document.createElement('div');tooltip.className='cell-tooltip';tooltip.textContent=neutral?'中立区域 · 下次圈住即可占领':`${owner?.name || '跑者'}的领地 · ${cell.fortification}/3 加固`;
      polygon.bindTooltip(tooltip,{direction:'top',className:'territory-tooltip'});
      polygon.on('click',()=>onCell({...cell,name:owner?.name,color}));
    }
    if(data.pool?.id!==poolRef.current) {
      poolRef.current=data.pool?.id;
      fitTerritory(map,data);
    }
  },[data,filters,onCell]);
  useEffect(()=>{
    const group=routeRef.current;if(!group)return;group.clearLayers();
    const renderer=routeRendererRef.current;
    if(route?.length) {
      L.polyline(route.map(ll),{renderer,color:'#fff',weight:7,opacity:0.95,interactive:false}).addTo(group);
      L.polyline(route.map(ll),{renderer,color:'#1e6652',weight:3.5,opacity:1,lineCap:'round',interactive:false}).addTo(group);
      L.circleMarker(ll(route[0]),{renderer,radius:6,color:'#1e5545',weight:3,fillColor:'#fff',fillOpacity:1}).addTo(group).bindTooltip('起点',{direction:'top'});
      if(!currentPoint&&route.length>1)L.circleMarker(ll(route.at(-1)),{renderer,radius:4,color:'#1e5545',weight:2,fillColor:'#1e5545',fillOpacity:1}).addTo(group);
    }
    if(currentPoint) L.circleMarker(ll(currentPoint),{renderer,radius:7,color:'#fff',weight:3,fillColor:'#3567d9',fillOpacity:1,interactive:false}).addTo(group);
    if(route?.length && !currentPoint)fitRoute(mapRef.current,route);
    else if(currentPoint&&!previousRouteRef.current)mapRef.current.setView(ll(currentPoint),16,{animate:false});
    else if(!route?.length&&previousRouteRef.current)fitTerritory(mapRef.current,data);
    previousRouteRef.current=Boolean(route?.length);
  },[route,currentPoint]);
  useEffect(()=>{
    const group=liveRef.current;if(!group)return;group.clearLayers();
    if(!filters.nearby)return;
    for(const runner of runners) {
      const marker=L.circleMarker(ll(runner),{radius:8,color:'#fff',weight:2.5,fillColor:runner.color,fillOpacity:1}).addTo(group);
      const node=document.createElement('span');node.textContent=`${runner.name} · ${runner.source==='simulation'?'道路回放':'约 80 米区域'}${runner.samePool?' · 同池':''}`;
      marker.bindTooltip(node,{permanent:true,direction:'top',className:'runner-tooltip'});
      L.circle(ll(runner),{radius:40,weight:1,color:runner.color,fillColor:runner.color,fillOpacity:0.09}).addTo(group);
    }
  },[runners,filters.nearby]);
  function recenter(){if(currentPoint)mapRef.current.setView(ll(currentPoint),16,{animate:false});else if(route?.length)fitRoute(mapRef.current,route);else fitTerritory(mapRef.current,data);}
  return <div className="map-surface">
    <div className="map-container real-map" ref={container}/>
    {tileError&&<div className="map-error">底图暂不可用，领地仍可查看。<button onClick={()=>{setTileError(false);baseRef.current.redraw();}}>重试底图</button></div>}
    <div className="map-tools">
      <button title="放大地图" aria-label="放大地图" onClick={()=>mapRef.current.zoomIn()}><Plus size={18}/></button>
      <button title="缩小地图" aria-label="缩小地图" onClick={()=>mapRef.current.zoomOut()}><Minus size={18}/></button>
      <span/>
      <button title={currentPoint?'回到当前位置':route?.length?'查看完整路线':'回到我的领地'} aria-label={currentPoint?'回到当前位置':route?.length?'查看完整路线':'回到我的领地'} onClick={recenter}><LocateFixed size={19}/></button>
    </div>
    <div className="map-scale"><small><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></small></div>
  </div>;
}
