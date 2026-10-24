import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Linking,Pressable,StyleSheet,Text,View,type ViewProps} from 'react-native';
import {requireNativeViewManager} from 'expo-modules-core';
import {cellCorners} from '../../../../shared/geo.mjs';
import {useApp} from '../state/AppProvider';

type Point={lat:number;lng:number};
type Camera={id:string;points:Point[]};
type MapProps=ViewProps&{scene:string;onRegionChange:(event:{nativeEvent:{bounds:number[]}})=>void;onCellPress:(event:{nativeEvent:{key:string}})=>void;onMapStatus:(event:{nativeEvent:{error:string}})=>void};
const NativeMap=requireNativeViewManager<MapProps>('LoopRunNative');
const INITIAL={lat:31.2353,lng:121.4747};

export default function TerritoryMap(){
  const {state,snapshot,setBbox,historyRoute,developerMode}=useApp(),initialPlayer=useRef(''),firstFix=useRef(''),cameraSequence=useRef(0);
  const [selected,setSelected]=useState<string|null>(null),[error,setError]=useState(''),[generation,setGeneration]=useState(0),[camera,setCamera]=useState<Camera>({id:'initial',points:[INITIAL]});
  const points=snapshot.run?.route||historyRoute||[],last=points.at(-1),cells=state?.pool?.cells;
  const geometry=useMemo(()=>(cells||[]).map(cell=>({key:cell.key,points:cellCorners(cell.key),color:state?.pool?.members.find(m=>m.id===cell.owner)?.color||'#a3ada6',opacity:cell.owner?0.15+cell.fortification*0.1:0.1})),[cells,state?.pool?.members]);
  useEffect(()=>{
    if(state?.player.id&&state.player.id!==initialPlayer.current){initialPlayer.current=state.player.id;setSelected(null);setCamera({id:'player:'+state.player.id,points:[state.player.center||INITIAL]});}
  },[state?.player.id,state?.player.center]);
  useEffect(()=>{if(last&&snapshot.run?.id!==firstFix.current){firstFix.current=snapshot.run?.id||'';setCamera({id:'run:'+snapshot.run?.id,points:[last]});}},[last,snapshot.run?.id]);
  useEffect(()=>{if(historyRoute?.length)setCamera({id:'history:'+ ++cameraSequence.current,points:historyRoute});},[historyRoute]);
  const scene=JSON.stringify({cells:geometry,route:points,camera});
  const cell=cells?.find(c=>c.key===selected),owner=state?.pool?.members.find(m=>m.id===cell?.owner);
  function recenter(){setCamera({id:'recenter:'+ ++cameraSequence.current,points:[last||state?.player.center||INITIAL]});}
  return <View style={s.frame}>
    <NativeMap key={`${developerMode}:${state?.player.id||'guest'}:${generation}`} style={StyleSheet.absoluteFill} scene={scene}
      onRegionChange={event=>setBbox(event.nativeEvent.bounds.join(','))} onCellPress={event=>setSelected(event.nativeEvent.key)} onMapStatus={event=>setError(event.nativeEvent.error)}/>
    <Pressable accessibilityRole="button" accessibilityLabel="回到当前位置或领地" onPress={recenter} style={s.locate}><Text style={s.locateText}>◎</Text></Pressable>
    {error&&<View style={s.error}><Text style={[s.small,{flex:1}]}>{error}</Text><Pressable onPress={()=>{setError('');setGeneration(g=>g+1);}}><Text style={s.link}>重试地图</Text></Pressable></View>}
    {cell&&<View style={s.detail}><View style={{flex:1}}><Text style={s.detailTitle}>{cell.owner?`${owner?.name||'跑者'}的领地`:'中立格'}</Text><Text style={s.small}>{cell.owner?`加固 ${cell.fortification}/3`:'有效闭环圈住即可占领'}</Text></View><Pressable onPress={()=>setSelected(null)} accessibilityLabel="关闭地块详情" style={s.close}><Text>×</Text></Pressable></View>}
    <Pressable accessibilityRole="link" onPress={()=>void Linking.openURL('https://lbs.amap.com/pages/privacy/')} style={s.privacy}><Text style={s.small}>高德地图隐私政策</Text></Pressable>
  </View>;
}
const s=StyleSheet.create({frame:{flex:1,minHeight:80,backgroundColor:'#e7eee8'},locate:{position:'absolute',right:12,bottom:44,width:42,height:42,borderRadius:8,backgroundColor:'#fff',alignItems:'center',justifyContent:'center',elevation:3},locateText:{fontSize:27,color:'#315d46'},privacy:{position:'absolute',top:4,right:4,padding:5,backgroundColor:'#ffffffdd'},detail:{position:'absolute',left:12,right:65,bottom:42,backgroundColor:'#fff',borderRadius:9,padding:12,flexDirection:'row',alignItems:'center',elevation:3},detailTitle:{fontSize:13,fontWeight:'600',color:'#264b34'},small:{fontSize:11,color:'#6b7c6f',marginTop:4},close:{padding:8},error:{position:'absolute',top:32,left:10,right:10,padding:10,borderRadius:8,backgroundColor:'#fff7e0',flexDirection:'row',alignItems:'center',justifyContent:'space-between'},link:{fontSize:12,color:'#356844',padding:7}});
