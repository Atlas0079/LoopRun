import React,{createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import {AppState,PermissionsAndroid,Platform} from 'react-native';
import Native,{type Snapshot,type Configuration,type Report} from '../../modules/looprun-native';
import {advanceSimulation,createSimulation,type Simulation,type SimulatedActivity} from './simulation';

export type Cell={key:string;owner:string|null;fortification:number};
export type Member={id:string;name:string;color:string;ownedCells:number;area:number};
export type GeoPoint={lat:number;lng:number;time:number;accuracy:number};
export type DeveloperRoute={id:string;name:string;description:string;distance:number;points:{lat:number;lng:number}[]};
export type Bot={id:string;playerId?:string;name:string;phase:string;route?:string;routeId?:string;startPercent:number;progress:number;completed:number;total:number;error:string|null};
export type Bots={enabled:boolean;players:Bot[]};
export type ServerState={now:number;player:Member&{damage:number;fortifiedCells:number;runCount:number;totalDistance:number;center?:{lat:number;lng:number};removedReason?:string};pool:null|{id:string;name:string;cells:Cell[];members:Member[]};activities:(Report&{id:string;routeName?:string})[];activeActivity?:(SimulatedActivity&{source:'simulation'})|{id:string;source:'gps'}|null;map:{limited:boolean};developerBots?:Bots};
export type Connection=Configuration;
type ContextValue={connection:Connection;developerMode:boolean;routes:DeveloperRoute[];state:ServerState|null;snapshot:Snapshot;privacy:boolean;busy:boolean;error:string;mode:'mine'|'pool';historyRoute:GeoPoint[]|null;previewLabel:string|null;setHistoryRoute:(p:GeoPoint[]|null)=>void;previewRoute:(route:DeveloperRoute)=>void;setMode:(m:'mine'|'pool')=>void;setBbox:(s:string)=>void;acceptPrivacy:()=>Promise<void>;connect:(base:string,code:string,name:string)=>Promise<void>;setDeveloperMode:(enabled:boolean)=>Promise<Connection>;request:<T>(path:string,body?:unknown)=>Promise<T>;start:(share:boolean)=>Promise<void>;startSimulation:(preset:string)=>Promise<void>;controlBots:(action:'start'|'pause'|'run',playerId?:string,preset?:string,startPercent?:number)=>Promise<void>;stop:()=>Promise<void>;discard:()=>Promise<void>;sync:()=>Promise<void>;perform:(f:()=>Promise<void>)=>Promise<void>;refresh:()=>Promise<void>};
const Context=createContext<ContextValue|null>(null);
async function fetchJson<T>(base:string,path:string,body?:unknown,token?:string):Promise<T>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
  try{
    const response=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',signal:controller.signal,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
    const value=await response.json();if(!response.ok)throw new Error(value.error||('服务器暂时无法处理请求 ('+response.status+')'));return value;
  }catch(error){if(error instanceof Error&&error.name==='AbortError')throw new Error('连接服务器超时，请检查地址和网络');throw error;}
  finally{clearTimeout(timer);}
}
export function AppProvider({children}:{children:React.ReactNode}){
  const [connection,setConnection]=useState<Connection>(()=>Native.configuration()),[state,setState]=useState<ServerState|null>(null),[nativeSnapshot,setNativeSnapshot]=useState<Snapshot>({}),[privacy,setPrivacy]=useState(()=>connection.privacy==='accepted'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[mode,setMode]=useState<'mine'|'pool'>('pool'),[bbox,setBbox]=useState(''),[historyRoute,storeHistoryRoute]=useState<GeoPoint[]|null>(null),[previewLabel,setPreviewLabel]=useState<string|null>(null),[routes,setRoutes]=useState<DeveloperRoute[]>([]),[simulation,storeSimulation]=useState<Simulation|null>(null),[simulationReport,setSimulationReport]=useState<Snapshot>({});
  const connectionRef=useRef(connection),queryRef=useRef({mode,bbox}),refreshing=useRef<Connection|null>(null),simulationRef=useRef<Simulation|null>(null),working=useRef(false);
  const developerMode=connection.developerMode;
  const snapshot:Snapshot=simulation?{run:simulation}:nativeSnapshot.run?nativeSnapshot:
    (simulationReport.report?.finishedAt||0)>(nativeSnapshot.report?.finishedAt||0)?simulationReport:nativeSnapshot;
  function updateSimulation(value:Simulation|null){simulationRef.current=value;storeSimulation(value);}
  function setHistoryRoute(points:GeoPoint[]|null){setPreviewLabel(null);storeHistoryRoute(points);}
  function previewRoute(route:DeveloperRoute){if(!connectionRef.current.developerMode)throw new Error('请先开启开发者模式');setPreviewLabel(route.name);storeHistoryRoute(route.points.map(p=>({...p,time:0,accuracy:5})));}
  useEffect(()=>{queryRef.current={mode,bbox};},[mode,bbox]);
  const request=useCallback(<T,>(path:string,body?:unknown)=>{
    const current=connectionRef.current;if(!current.server||!current.token)throw new Error('请先连接当前环境的服务器');return fetchJson<T>(current.server,path,body,current.token);
  },[]);
  const local=useCallback(async()=>{const current=connectionRef.current;const value=JSON.parse(await Native.snapshot());if(connectionRef.current===current)setNativeSnapshot(value);},[]);
  const refresh=useCallback(async()=>{
    const current=connectionRef.current;
    if(!current.token||refreshing.current===current)return;refreshing.current=current;
    try{
      const q=queryRef.current,next=await fetchJson<ServerState>(current.server,'/state?mode='+q.mode+(q.bbox?'&bbox='+encodeURIComponent(q.bbox):''),undefined,current.token);
      if(connectionRef.current!==current)return;
      setState(next);setError('');
      if(current.developerMode&&next.activeActivity?.source==='simulation'&&simulationRef.current?.id!==next.activeActivity.id){
        const value=createSimulation({...next.activeActivity,route:next.activeActivity.route},true);simulationRef.current=value;storeSimulation(value);
      }
    }catch(e){if(connectionRef.current===current)setError(e instanceof Error?e.message:'服务器连接失败');}
    finally{if(refreshing.current===current)refreshing.current=null;}
  },[]);
  useEffect(()=>{void local().catch(()=>{});},[local,developerMode]);
  useEffect(()=>{
    const current=connection;if(!current.token)return;
    void refresh();void fetchJson<{development:boolean;routes?:DeveloperRoute[]}>(current.server,'/config').then(c=>{if(connectionRef.current!==current)return;if(c.development!==current.developerMode)throw new Error('服务器环境与开发者开关不一致，请重新连接');setRoutes(current.developerMode?c.routes||[]:[]);}).catch(e=>{if(connectionRef.current===current)setError(e.message);});
  },[connection,refresh]);
  useEffect(()=>{const timer=setTimeout(()=>{void refresh();},450);return()=>clearTimeout(timer);},[bbox,mode,refresh]);
  useEffect(()=>{
    const timer=setInterval(()=>{if(AppState.currentState==='active')void local().catch(()=>{});},1500);
    const poll=setInterval(()=>{if(AppState.currentState==='active')void refresh();},15000);
    const listener=AppState.addEventListener('change',status=>{if(status==='active'){void local();void refresh();}});
    return()=>{clearInterval(timer);clearInterval(poll);listener.remove();};
  },[local,refresh]);
  useEffect(()=>{
    if(!connection.token)return;
    const Ctor=WebSocket as unknown as new(url:string,protocols:string[]|null,options:{headers:Record<string,string>})=>WebSocket;
    const socket=new Ctor(connection.server.replace(/^http/,'ws')+'/api/events',null,{headers:{Authorization:'Bearer '+connection.token}});
    socket.onmessage=()=>{void refresh();};return()=>socket.close();
  },[connection.server,connection.token,refresh]);
  useEffect(()=>{
    if(!developerMode)return;
    const timer=setInterval(()=>{const current=simulationRef.current;if(current){const next=advanceSimulation(current,Date.now());if(next!==current){simulationRef.current=next;storeSimulation(next);}}},250);
    return()=>clearInterval(timer);
  },[developerMode]);
  async function perform(action:()=>Promise<void>){if(working.current)return;working.current=true;setBusy(true);setError('');try{await action();}catch(e){setError(e instanceof Error?e.message:'操作失败，数据仍保存在本机');}finally{await local().catch(()=>{});working.current=false;setBusy(false);}}
  async function connect(input:string,code:string,name:string){
    const base=Native.validateServer(input),current=connectionRef.current;
    if((snapshot.run||state?.activeActivity)&&current.server!==base)throw new Error('请先处理未完成的活动，再切换服务器');
    const health=await fetchJson<{mode:string;development:boolean}>(base,'/health');
    if(health.mode!=='gps'||health.development!==current.developerMode)throw new Error(current.developerMode?'开发者模式只能连接独立开发测试服务':'普通模式只能连接真实 GPS 服务');
    const stored=Native.configuration(),result=await fetchJson<{token:string}>(base,'/auth/beta',{installSecret:stored.installSecret,accessCode:code,name});
    await Native.configure(base,result.token);const next=Native.configuration();connectionRef.current=next;setConnection(next);setState(null);await refresh();
  }
  async function setDeveloperMode(enabled:boolean){
    const current=connectionRef.current;if(current.developerMode===enabled)return current;
    if(snapshot.run||JSON.parse(await Native.snapshot()).run)throw new Error('请先结束、上传或放弃当前活动，再切换开发者模式');
    if(current.token){const remote=await request<ServerState>('/state');if(remote.activeActivity)throw new Error('服务器仍有未完成的活动，请先处理后再切换模式');}
    await Native.setDeveloperMode(enabled);
    const next=Native.configuration();connectionRef.current=next;setConnection(next);setState(null);setNativeSnapshot({});setSimulationReport({});updateSimulation(null);setHistoryRoute(null);setRoutes([]);setMode('pool');setBbox('');await local();await refresh();return next;
  }
  async function start(share:boolean){
    if(simulationRef.current||JSON.parse(await Native.snapshot()).run||state?.activeActivity)throw new Error('请先处理当前活动');
    if(!privacy)throw new Error('请先阅读并确认地图和定位用途');
    const permissions=[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION];
    const granted=await PermissionsAndroid.requestMultiple(permissions);
    if(granted[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]!==PermissionsAndroid.RESULTS.GRANTED)throw new Error('跑步需要精确定位，请在系统设置中允许精确位置');
    if(Platform.OS==='android'&&Number(Platform.Version)>=33)await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    const activity=await request<{id:string;startedAt:number;now:number;shareLocation:boolean}>('/runs/start',{shareLocation:share});
    try{await Native.begin(activity.id,activity.startedAt,activity.now-Date.now(),activity.shareLocation);setSimulationReport({});setHistoryRoute(null);await local();await refresh();}
    catch(e){await request('/runs/'+activity.id+'/cancel',{}).catch(()=>{});throw e;}
  }
  async function startSimulation(preset:string){
    if(!connectionRef.current.developerMode)throw new Error('请先开启开发者模式');
    if(!privacy)throw new Error('请先在地图确认地图和定位用途');
    if(simulationRef.current||JSON.parse(await Native.snapshot()).run||state?.activeActivity)throw new Error('请先处理当前活动');
    const activity=await request<SimulatedActivity>('/runs/start',{simulation:true,preset,shareLocation:false});
    updateSimulation(createSimulation(activity));setSimulationReport({});setHistoryRoute(null);await refresh();
  }
  async function controlBots(action:'start'|'pause'|'run',playerId?:string,preset?:string,startPercent?:number){
    if(!connectionRef.current.developerMode)throw new Error('请先开启开发者模式');
    const result=await request<Bots>('/developer/bots',{action,playerId,preset,startPercent});await refresh();
    if(result.players.some(p=>p.phase==='暂停失败，请重试'))throw new Error('部分机器人暂停失败，请重试暂停');
  }
  async function syncSimulation(){
    let current=simulationRef.current;if(!current)return;
    if(current.pointCount!==current.fullRoute.length)throw new Error('请等待模拟路线播放完成后再结算');
    try{
      updateSimulation({...current,status:'pending',error:''});
      for(let offset=current.acked;offset<current.fullRoute.length;offset+=200){
        const ack:{acceptedThrough:number}=await request<{acceptedThrough:number}>('/runs/'+current.id+'/points',{points:current.fullRoute.slice(offset,offset+200)});
        current={...current,status:'pending',acked:ack.acceptedThrough};updateSimulation(current);
      }
      const report=await request<Report>('/runs/'+current.id+'/finish',{endedAt:current.fullRoute.at(-1)!.time,pointCount:current.fullRoute.length});
      updateSimulation(null);setSimulationReport({report,reportId:current.id});await refresh();
    }catch(e){const latest=simulationRef.current;if(latest)updateSimulation({...latest,status:'pending',error:e instanceof Error?e.message:'模拟上传失败，请重试'});throw e;}
  }
  async function sync(){if(simulationRef.current){await syncSimulation();return;}try{setNativeSnapshot(JSON.parse(await Native.sync()));}finally{await local();await refresh();}}
  async function stop(){if(simulationRef.current){await syncSimulation();return;}await Native.stop();await local();await sync();}
  async function discard(){const run=simulationRef.current;if(run){await request('/runs/'+run.id+'/cancel',{});updateSimulation(null);setSimulationReport({});await refresh();return;}await Native.discard();await local();await sync();}
  async function acceptPrivacy(){await Native.acceptPrivacy();setPrivacy(true);}
  return <Context.Provider value={{connection,developerMode,routes,state,snapshot,privacy,busy,error,mode,historyRoute,previewLabel,setHistoryRoute,previewRoute,setMode,setBbox,acceptPrivacy,connect,setDeveloperMode,request,start,startSimulation,controlBots,stop,discard,sync,perform,refresh}}>{children}</Context.Provider>;
}
export function useApp(){const value=useContext(Context);if(!value)throw new Error('缺少 App 状态');return value;}
