import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {AppState,Linking,Pressable,StyleSheet,Text,View,type ViewProps} from 'react-native';
import {router,useFocusEffect} from 'expo-router';
import {requireNativeViewManager} from 'expo-modules-core';
import {cellCorners} from '../../../../shared/geo.mjs';
import {useApp} from '../state/AppProvider';

type Point={lat:number;lng:number};
type Camera={id:string;points:Point[]};
type Runner=Point&{id:string;name:string;color:string;seenAt:number;approximate:boolean;samePool:boolean};
type MapProps=ViewProps&{scene:string;onRunnerPress:(event:{nativeEvent:{id:string}})=>void;onRegionChange:(event:{nativeEvent:{bounds:number[]}})=>void;onCellPress:(event:{nativeEvent:{key:string}})=>void;onMapStatus:(event:{nativeEvent:{error:string}})=>void};
const NativeMap=requireNativeViewManager<MapProps>('LoopRunNative');
const INITIAL={lat:31.2353,lng:121.4747};

export default function TerritoryMap(){
  const {state,snapshot,setBbox,historyRoute,developerMode,connection,request}=useApp(),initialPlayer=useRef(''),firstFix=useRef(''),cameraSequence=useRef(0);
  const identity=connection.server+'|'+connection.token;
  const [nearbyResult,setNearby]=useState<{identity:string;runners:Runner[]}>({identity:'',runners:[]}),[nearbyCenter,setNearbyCenter]=useState(INITIAL);
  const [runnerSelection,setRunnerSelection]=useState({identity:'',id:''});
  const [selected,setSelected]=useState<string|null>(null),[error,setError]=useState(''),[generation,setGeneration]=useState(0),[camera,setCamera]=useState<Camera>({id:'initial',points:[INITIAL]});
  const nearby=nearbyResult.identity===identity?nearbyResult.runners:[];
  const selectedRunner=runnerSelection.identity===identity&&nearby.some(r=>r.id===runnerSelection.id)?runnerSelection.id:'';
  const points=snapshot.run?.route||historyRoute||[],last=points.at(-1),cells=state?.pool?.cells;
  const geometry=useMemo(()=>(cells||[]).map(cell=>({key:cell.key,points:cellCorners(cell.key),color:state?.pool?.members.find(m=>m.id===cell.owner)?.color||'#a3ada6',opacity:cell.owner?0.15+cell.fortification*0.1:0.1})),[cells,state?.pool?.members]);
  useEffect(()=>{
    if(state?.player.id&&state.player.id!==initialPlayer.current){initialPlayer.current=state.player.id;setSelected(null);setCamera({id:'player:'+state.player.id,points:[state.player.center||INITIAL]});}
  },[state?.player.id,state?.player.center]);
  useEffect(()=>{if(last&&snapshot.run?.id!==firstFix.current){firstFix.current=snapshot.run?.id||'';setCamera({id:'run:'+snapshot.run?.id,points:[last]});}},[last,snapshot.run?.id]);
  useEffect(()=>{if(historyRoute?.length)setCamera({id:'history:'+ ++cameraSequence.current,points:historyRoute});},[historyRoute]);
  useFocusEffect(useCallback(()=>{
    let cancelled=false,fetching=false;
    async function load(){
      if(fetching||!connection.token||AppState.currentState!=='active')return;fetching=true;
      try{const result=await request<{runners:Runner[]}>('/nearby?lat='+nearbyCenter.lat+'&lng='+nearbyCenter.lng);if(!cancelled)setNearby({identity,runners:result.runners});}
      catch{if(!cancelled)setNearby({identity,runners:[]});}finally{fetching=false;}
    }
    void load();const timer=setInterval(()=>void load(),5000);
    const listener=AppState.addEventListener('change',status=>{if(status==='active')void load();else setNearby({identity,runners:[]});});
    return()=>{cancelled=true;clearInterval(timer);listener.remove();};
  },[nearbyCenter,identity,connection.token,request]));
  const scene=JSON.stringify({cells:geometry,route:points,camera,runners:nearby,selectedRunner});
  const cell=cells?.find(c=>c.key===selected),owner=state?.pool?.members.find(m=>m.id===cell?.owner);
  function recenter(){setCamera({id:'recenter:'+ ++cameraSequence.current,points:[last||state?.player.center||INITIAL]});}
  return <View style={s.frame}>
    <NativeMap key={`${developerMode}:${state?.player.id||'guest'}:${generation}`} style={StyleSheet.absoluteFill} scene={scene}
      onRunnerPress={event=>{const runner=nearby.find(r=>r.id===event.nativeEvent.id);if(!runner)return;setSelected(null);if(selectedRunner===runner.id)router.push({pathname:'/runner',params:{id:runner.id,profile:connection.server}});else setRunnerSelection({identity,id:runner.id});}}
      onRegionChange={event=>{const b=event.nativeEvent.bounds;setBbox(b.join(','));const lat=Number(((b[1]+b[3])/2).toFixed(4)),lng=Number(((b[0]+b[2])/2).toFixed(4));setNearbyCenter(previous=>previous.lat===lat&&previous.lng===lng?previous:{lat,lng});}} onCellPress={event=>{setRunnerSelection({identity,id:''});setSelected(event.nativeEvent.key||null);}} onMapStatus={event=>setError(event.nativeEvent.error)}/>
    {nearby.length>0&&<View style={{position:'absolute',right:4,top:36,padding:5,backgroundColor:'#ffffffdd'}}><Text style={s.small}>附近 {nearby.length} 位跑者 · 大致位置</Text></View>}
    <Pressable accessibilityRole="button" accessibilityLabel="回到当前位置或领地" onPress={recenter} style={s.locate}><Text style={s.locateText}>◎</Text></Pressable>
    {error&&<View style={s.error}><Text style={[s.small,{flex:1}]}>{error}</Text><Pressable onPress={()=>{setError('');setGeneration(g=>g+1);}}><Text style={s.link}>重试地图</Text></Pressable></View>}
    {cell&&<View style={s.detail}><View style={{flex:1}}><Text style={s.detailTitle}>{cell.owner?`${owner?.name||'跑者'}的领地`:'中立格'}</Text><Text style={s.small}>{cell.owner?`加固 ${cell.fortification}/3`:'有效闭环圈住即可占领'}</Text></View><Pressable onPress={()=>setSelected(null)} accessibilityLabel="关闭地块详情" style={s.close}><Text>×</Text></Pressable></View>}
    <Pressable accessibilityRole="link" onPress={()=>void Linking.openURL('https://lbs.amap.com/pages/privacy/')} style={s.privacy}><Text style={s.small}>高德地图隐私政策</Text></Pressable>
  </View>;
}
const s=StyleSheet.create({frame:{flex:1,minHeight:80,backgroundColor:'#e7eee8'},locate:{position:'absolute',left:12,top:12,width:42,height:42,borderRadius:8,backgroundColor:'#fff',alignItems:'center',justifyContent:'center',elevation:3},locateText:{fontSize:27,color:'#315d46'},privacy:{position:'absolute',top:4,right:4,padding:5,backgroundColor:'#ffffffdd'},detail:{position:'absolute',left:12,right:65,bottom:42,backgroundColor:'#fff',borderRadius:9,padding:12,flexDirection:'row',alignItems:'center',elevation:3},detailTitle:{fontSize:13,fontWeight:'600',color:'#264b34'},small:{fontSize:11,color:'#6b7c6f',marginTop:4},close:{padding:8},error:{position:'absolute',top:64,left:10,right:10,padding:10,borderRadius:8,backgroundColor:'#fff7e0',flexDirection:'row',alignItems:'center',justifyContent:'space-between'},link:{fontSize:12,color:'#356844',padding:7}});
