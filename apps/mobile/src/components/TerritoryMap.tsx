import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Linking,Pressable,StyleSheet,Text,View} from 'react-native';
import {Map,Camera,GeoJSONSource,Layer,TransformRequestManager,type CameraRef,type MapRef} from '@maplibre/maplibre-react-native';
import type {FeatureCollection,Polygon} from 'geojson';
import {cellCorners} from '../../../../shared/geo.mjs';
import {useApp,type Cell} from '../state/AppProvider';
const EMPTY_CELLS:Cell[]=[];
const INITIAL_VIEW={center:[121.4747,31.2353] as [number,number],zoom:16};

TransformRequestManager.addHeader({id:'looprun-agent',name:'User-Agent',value:'LoopRunAndroid/0.3 (com.looprun.android)'});
export default function TerritoryMap(){
  const {state,snapshot,tiles,setBbox,historyRoute}=useApp(),camera=useRef<CameraRef>(null),map=useRef<MapRef>(null),initialPlayer=useRef(''),firstFix=useRef('');
  const [selected,setSelected]=useState<string|null>(null),[failed,setFailed]=useState(false),[generation,setGeneration]=useState(0);
  const points=snapshot.run?.route||historyRoute||[],last=points.at(-1),cells=state?.pool?.cells||EMPTY_CELLS;
  const mapStyle=useMemo(()=>({version:8 as const,sources:{osm:{type:'raster' as const,tiles:[tiles],tileSize:256,maxzoom:19,attribution:'© OpenStreetMap contributors'}},layers:[{id:'osm',type:'raster' as const,source:'osm'}]}),[tiles]);
  const geometry=useMemo<FeatureCollection<Polygon>>(()=>({type:'FeatureCollection',features:cells.map(cell=>{
    const owner=state?.pool?.members.find(m=>m.id===cell.owner),ring=cellCorners(cell.key).map(p=>[p.lng,p.lat]);
    return {type:'Feature',id:cell.key,properties:{key:cell.key,color:owner?.color||'#a3ada6',opacity:cell.owner?0.15+cell.fortification*0.1:0.1},geometry:{type:'Polygon',coordinates:[[...ring,ring[0]]]}};
  })}),[cells,state?.pool?.members]);
  useEffect(()=>{
    if(state?.player.id&&state.player.id!==initialPlayer.current){initialPlayer.current=state.player.id;const center=state.player.center;if(center)camera.current?.easeTo({center:[center.lng,center.lat],zoom:16,duration:250});}
  },[state?.player.id,state?.player.center]);
  useEffect(()=>{if(last&&snapshot.run?.id!==firstFix.current){firstFix.current=snapshot.run?.id||'';camera.current?.easeTo({center:[last.lng,last.lat],zoom:16,duration:250});}},[last,snapshot.run?.id]);
  useEffect(()=>{
    if(historyRoute?.length){const xs=historyRoute.map(p=>p.lng),ys=historyRoute.map(p=>p.lat);camera.current?.fitBounds([Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)],{padding:{top:30,bottom:30,left:30,right:30},duration:250});}
  },[historyRoute]);
  const cell=cells.find(c=>c.key===selected),owner=state?.pool?.members.find(m=>m.id===cell?.owner);
  function recenter(){const p=last||state?.player.center;if(p)camera.current?.easeTo({center:[p.lng,p.lat],zoom:16,duration:250});}
  return <View style={s.frame}>
    <Map key={generation} ref={map} style={StyleSheet.absoluteFill} mapStyle={mapStyle} scaleBar onDidFailLoadingMap={()=>setFailed(true)} onRegionDidChange={event=>setBbox(event.nativeEvent.bounds.join(','))}>
      <Camera ref={camera} initialViewState={INITIAL_VIEW} minZoom={12} maxZoom={19}/>
      <GeoJSONSource id="territories" data={geometry} onPress={event=>{const value=event.nativeEvent.features?.[0]?.properties?.key;setSelected(typeof value==='string'?value:null);}}>
        <Layer id="territory-fill" type="fill" paint={{'fill-color':['get','color'],'fill-opacity':['get','opacity']}}/>
        <Layer id="territory-line" type="line" paint={{'line-color':['get','color'],'line-width':1.2,'line-opacity':0.9}}/>
      </GeoJSONSource>
      {points.length>1&&<GeoJSONSource id="route" data={{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:points.map(p=>[p.lng,p.lat])}}}>
        <Layer id="route-white" type="line" paint={{'line-color':'#ffffff','line-width':7}}/>
        <Layer id="route-line" type="line" paint={{'line-color':'#1e6652','line-width':3.5}}/>
      </GeoJSONSource>}
      {last&&<GeoJSONSource id="current-point" data={{type:'Feature',properties:{},geometry:{type:'Point',coordinates:[last.lng,last.lat]}}}><Layer id="current-point-dot" type="circle" paint={{'circle-radius':6,'circle-color':'#3567d9','circle-stroke-width':2,'circle-stroke-color':'#ffffff'}}/></GeoJSONSource>}
    </Map>
    <Pressable accessibilityRole="button" accessibilityLabel="回到当前位置或领地" onPress={recenter} style={s.locate}><Text style={s.locateText}>◎</Text></Pressable>
    {failed&&<View style={s.error}><Text style={s.small}>底图暂时无法加载，轨迹记录不受影响。</Text><Pressable onPress={()=>{setGeneration(g=>g+1);setFailed(false);}}><Text style={s.link}>重试地图</Text></Pressable></View>}
    {cell&&<View style={s.detail}><View style={{flex:1}}><Text style={s.detailTitle}>{cell.owner?`${owner?.name||'跑者'}的领地`:'中立格'}</Text><Text style={s.small}>{cell.owner?`加固 ${cell.fortification}/3`:'有效闭环圈住即可占领'}</Text></View><Pressable onPress={()=>setSelected(null)} accessibilityLabel="关闭地块详情" style={s.close}><Text>×</Text></Pressable></View>}
    <Pressable accessibilityRole="link" onPress={()=>Linking.openURL('https://www.openstreetmap.org/copyright')} style={s.copyright}><Text style={s.copyrightText}>© OpenStreetMap contributors</Text></Pressable>
  </View>;
}
const s=StyleSheet.create({frame:{flex:1,minHeight:80,backgroundColor:'#e7eee8'},locate:{position:'absolute',right:12,bottom:32,width:42,height:42,borderRadius:8,backgroundColor:'#fff',alignItems:'center',justifyContent:'center',elevation:3},locateText:{fontSize:27,color:'#315d46'},copyright:{position:'absolute',bottom:0,left:0,backgroundColor:'#ffffffee',paddingHorizontal:5,paddingVertical:2},copyrightText:{fontSize:9,color:'#405e49'},detail:{position:'absolute',left:12,right:65,bottom:27,backgroundColor:'#fff',borderRadius:9,padding:12,flexDirection:'row',alignItems:'center',elevation:3},detailTitle:{fontSize:13,fontWeight:'600',color:'#264b34'},small:{fontSize:11,color:'#6b7c6f',marginTop:4},close:{padding:8},error:{position:'absolute',top:10,left:10,right:10,padding:10,borderRadius:8,backgroundColor:'#fff7e0',flexDirection:'row',alignItems:'center',justifyContent:'space-between'},link:{fontSize:12,color:'#356844',padding:7}});
