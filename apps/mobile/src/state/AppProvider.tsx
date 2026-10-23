import React,{createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import {AppState,PermissionsAndroid,Platform} from 'react-native';
import Native,{type Snapshot,type Configuration,type Report} from '../../modules/looprun-native';

export type Cell={key:string;owner:string|null;fortification:number};
export type Member={id:string;name:string;color:string;ownedCells:number;area:number};
export type ServerState={now:number;player:Member&{damage:number;fortifiedCells:number;runCount:number;totalDistance:number;center?:{lat:number;lng:number};removedReason?:string};pool:null|{id:string;name:string;cells:Cell[];members:Member[]};activities:(Report&{id:string;routeName?:string})[];activeActivity?:{id:string}|null;map:{limited:boolean}};
export type Connection=Configuration;
export type GeoPoint={lat:number;lng:number;time:number;accuracy:number};
type ContextValue={connection:Connection|null;state:ServerState|null;snapshot:Snapshot;privacy:boolean;busy:boolean;error:string;mode:'mine'|'pool';tiles:string;historyRoute:GeoPoint[]|null;setHistoryRoute:(p:GeoPoint[]|null)=>void;setMode:(m:'mine'|'pool')=>void;setBbox:(s:string)=>void;acceptPrivacy:()=>Promise<void>;connect:(base:string,code:string,name:string)=>Promise<void>;request:<T>(path:string,body?:unknown)=>Promise<T>;start:(share:boolean)=>Promise<void>;stop:()=>Promise<void>;discard:()=>Promise<void>;sync:()=>Promise<void>;perform:(f:()=>Promise<void>)=>Promise<void>;refresh:()=>Promise<void>};
const Context=createContext<ContextValue|null>(null);
const defaultTiles='https://tile.openstreetmap.org/{z}/{x}/{y}.png';
async function fetchJson<T>(base:string,path:string,body?:unknown,token?:string):Promise<T>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
  try{
    const response=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',signal:controller.signal,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});
    const value=await response.json();if(!response.ok)throw new Error(value.error||`服务器暂时无法处理请求 (${response.status})`);return value;
  }catch(error){if(error instanceof Error&&error.name==='AbortError')throw new Error('连接服务器超时，请检查地址和网络');throw error;}
  finally{clearTimeout(timer);}
}
export function AppProvider({children}:{children:React.ReactNode}){
  const [connection,setConnection]=useState<Connection|null>(()=>Native.configuration()),[state,setState]=useState<ServerState|null>(null),[snapshot,setSnapshot]=useState<Snapshot>({}),[privacy,setPrivacy]=useState(()=>connection?.privacy==='accepted'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[mode,setMode]=useState<'mine'|'pool'>('pool'),[bbox,setBbox]=useState(''),[tiles,setTiles]=useState(defaultTiles),[historyRoute,setHistoryRoute]=useState<GeoPoint[]|null>(null);
  const connectionRef=useRef(connection),queryRef=useRef({mode,bbox}),refreshing=useRef(false);
  useEffect(()=>{connectionRef.current=connection;queryRef.current={mode,bbox};},[connection,mode,bbox]);
  const request=useCallback(<T,>(path:string,body?:unknown)=>{
    const current=connectionRef.current;if(!current?.server||!current.token)throw new Error('请先连接内测服务器');return fetchJson<T>(current.server,path,body,current.token);
  },[]);
  const local=useCallback(async()=>{setSnapshot(JSON.parse(await Native.snapshot()));},[]);
  const refresh=useCallback(async()=>{
    if(!connectionRef.current?.token||refreshing.current)return;refreshing.current=true;
    try{const q=queryRef.current;setState(await request<ServerState>(`/state?mode=${q.mode}${q.bbox?'&bbox='+encodeURIComponent(q.bbox):''}`));setError('');}
    catch(e){setError(e instanceof Error?e.message:'服务器连接失败');}finally{refreshing.current=false;}
  },[request]);
  useEffect(()=>{let active=true;Native.snapshot().then(text=>{if(active)setSnapshot(JSON.parse(text));}).catch(()=>{});return()=>{active=false;};},[]);
  useEffect(()=>{if(!connection?.token)return;void refresh();void fetchJson<{maps:{tiles:string}}>(connection.server,'/config').then(c=>setTiles(c.maps.tiles)).catch(()=>{});},[connection?.token,connection?.server,refresh]);
  useEffect(()=>{const timer=setTimeout(()=>{void refresh();},450);return()=>clearTimeout(timer);},[bbox,mode,refresh]);
  useEffect(()=>{
    const timer=setInterval(()=>{if(AppState.currentState==='active')void local().catch(()=>{});},1500);
    const poll=setInterval(()=>{if(AppState.currentState==='active')void refresh();},15000);
    const listener=AppState.addEventListener('change',status=>{if(status==='active'){void local();void refresh();}});
    return()=>{clearInterval(timer);clearInterval(poll);listener.remove();};
  },[local,refresh]);
  useEffect(()=>{
    if(!connection?.token)return;
    // React Native supports authenticated WebSocket headers; no token is put in the URL.
    const Ctor=WebSocket as unknown as new(url:string,protocols:string[]|null,options:{headers:Record<string,string>})=>WebSocket;
    const socket=new Ctor(connection.server.replace(/^http/,'ws')+'/api/events',null,{headers:{Authorization:`Bearer ${connection.token}`}});
    socket.onmessage=()=>{void refresh();};return()=>socket.close();
  },[connection?.server,connection?.token,refresh]);
  async function perform(action:()=>Promise<void>){setBusy(true);setError('');try{await action();}catch(e){setError(e instanceof Error?e.message:'操作失败，数据仍保存在本机');}finally{await local().catch(()=>{});setBusy(false);}}
  async function connect(input:string,code:string,name:string){
    const base=Native.validateServer(input);
    if(snapshot.run&&connectionRef.current?.server!==base)throw new Error('请先处理本机未完成的活动，再切换服务器');
    const health=await fetchJson<{mode:string}>(base,'/health');if(health.mode!=='gps')throw new Error('此地址不是 GPS 内测服务，请勿连接道路回放环境');
    const stored=Native.configuration();
    const result=await fetchJson<{token:string}>(base,'/auth/beta',{installSecret:stored.installSecret,accessCode:code,name});
    await Native.configure(base,result.token);const next=Native.configuration();connectionRef.current=next;setConnection(next);await refresh();
  }
  async function start(share:boolean){
    if(!privacy)throw new Error('请先阅读并确认地图和定位用途');
    const permissions=[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION];
    const granted=await PermissionsAndroid.requestMultiple(permissions);
    if(granted[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]!==PermissionsAndroid.RESULTS.GRANTED)throw new Error('跑步需要精确定位，请在系统设置中允许精确位置');
    if(Platform.OS==='android'&&Number(Platform.Version)>=33)await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    const activity=await request<{id:string;startedAt:number;now:number;shareLocation:boolean}>('/runs/start',{shareLocation:share});
    try{await Native.begin(activity.id,activity.startedAt,activity.now-Date.now(),activity.shareLocation);setHistoryRoute(null);await local();await refresh();}
    catch(e){await request(`/runs/${activity.id}/cancel`,{}).catch(()=>{});throw e;}
  }
  async function sync(){try{setSnapshot(JSON.parse(await Native.sync()));}finally{await local();await refresh();}}
  async function stop(){await Native.stop();await local();await sync();}
  async function discard(){await Native.discard();await local();await sync();}
  async function acceptPrivacy(){await Native.acceptPrivacy();setPrivacy(true);}
  return <Context.Provider value={{connection,state,snapshot,privacy,busy,error,mode,tiles,historyRoute,setHistoryRoute,setMode,setBbox,acceptPrivacy,connect,request,start,stop,discard,sync,perform,refresh}}>{children}</Context.Provider>;
}
export function useApp(){const value=useContext(Context);if(!value)throw new Error('缺少 App 状态');return value;}
