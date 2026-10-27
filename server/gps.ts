import Fastify, { type FastifyRequest } from 'fastify';
import websocket from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';
import { randomBytes,createHash,timingSafeEqual } from 'node:crypto';
import { PgStore, type Sample } from './pg-store.js';
import { RULES, DEFAULT_CENTER } from '../shared/config.mjs';
import { BOT_PERSONAS,ROAD_CATALOG,simulationRoute } from './sandbox.mjs';
import { ReplayBots } from './replay-bots.mjs';
import { addPlayer,expirePlayers,startActivity,finishActivity,cancelActivity,updateLive,publicState,nearby } from './game.mjs';

type RoadRoute={id:string;name:string;description:string;distance:number;points:{lat:number;lng:number}[]};
const roadRoutes:RoadRoute[]=ROAD_CATALOG.routes;
const databaseUrl=process.env.DATABASE_URL;
if(!databaseUrl)throw new Error('请配置独立 GPS PostgreSQL 数据库 DATABASE_URL。');
const development=process.env.GPS_DEVELOPER_MODE==='true';
if(development!==decodeURIComponent(new URL(databaseUrl).pathname).endsWith('_development'))throw new Error('开发服务必须使用以 _development 结尾的独立数据库，普通 GPS 服务不得连接开发库。');
const store=new PgStore(databaseUrl);await store.init(development?'development':'gps');
if(Object.values((await store.read()).players).some(p=>p.kind!=='android-beta'))throw new Error('GPS 内测库不能包含回放或其他客户端身份。');
const app=Fastify({logger:{level:'info',redact:['req.headers.authorization','req.body']},bodyLimit:250000,ajv:{customOptions:{removeAdditional:false,coerceTypes:false}}});
await app.register(rateLimit,{max:600,timeWindow:'1 minute'});
await app.register(websocket);
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const problem=(message:string,statusCode=400,code?:string)=>Object.assign(new Error(message),{statusCode,code});
const equal=(a:string,b:string)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
const sockets=new Set<{send:(s:string)=>void;close:()=>void}>();
const notify=()=>{for(const socket of sockets)try{socket.send(JSON.stringify({type:'refresh'}));}catch{sockets.delete(socket);}};
const gpsHost=process.env.GPS_HOST||'127.0.0.1',gpsPort=Number(process.env.GPS_PORT||4180);
const botBase=`http://${gpsHost==='0.0.0.0'?'127.0.0.1':gpsHost.includes(':')?`[${gpsHost}]`:gpsHost}:${gpsPort}`;
const bots=development?new ReplayBots(botBase,BOT_PERSONAS,roadRoutes.filter(r=>r.id.startsWith('replay-')),notify,{
  login:(persona:{id:string;name:string})=>({installSecret:createHash('sha256').update(`${process.env.BETA_ACCESS_CODE}:${persona.id}`).digest('base64url'),accessCode:process.env.BETA_ACCESS_CODE,name:persona.name}),
  catalog:roadRoutes,realtime:true,
}):null;
const identities=new WeakMap<FastifyRequest,string>();
async function auth(request:FastifyRequest){
  const token=request.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{32,128})$/)?.[1];
  const row=token?(await store.db.query('SELECT data FROM sessions WHERE id=$1',[hash(token)])).rows[0]:null;
  if(!row||row.data.expiresAt<Date.now())throw problem('请先连接内测账户。',401,'UNAUTHENTICATED');
  identities.set(request,row.data.playerId);
}
const uid=(r:FastifyRequest)=>identities.get(r)!;
const authenticated={preValidation:auth};
const object=(properties:Record<string,unknown>,required:string[]=[])=>({type:'object',additionalProperties:false,properties,required});
const string={type:'string'},number={type:'number'},boolean={type:'boolean'};
app.setErrorHandler((error:any,_request,reply)=>{
  const known=error.statusCode||error.code==='INVITE_UNAVAILABLE'||/^[\u3400-\u9fff]/u.test(error.message||'');
  if(!known)app.log.error({name:error.name,code:error.code},'GPS request failed');
  reply.code(error.statusCode||(known?400:500)).send({error:error.validation?'请求格式不正确，请检查当前内测版本。':known?error.message:'服务暂不可用，请稍后重试。',code:error.validation?'INVALID_REQUEST':error.code});
});
app.get('/api/health',async()=>({ok:true,mode:'gps',development,version:'0.6.0'}));
app.get('/api/config',async()=>({sandbox:false,development,rules:RULES,center:DEFAULT_CENTER,version:'0.6.0',...(development?{routes:roadRoutes.map(({id,name,description,distance,points})=>({id,name,description,distance,points}))}:{})}));
app.post('/api/auth/beta',{config:{rateLimit:{max:30,timeWindow:'1 minute'}},schema:{body:object({installSecret:{type:'string',pattern:'^[A-Za-z0-9_-]{43,128}$'},accessCode:{type:'string',maxLength:128},name:{type:'string',minLength:1,maxLength:12}},['installSecret'])}},async(request,reply)=>{
  const body=request.body as {installSecret:string;accessCode?:string;name?:string};
  const playerId=`app_${hash(body.installSecret).slice(0,40)}`;
  const token=randomBytes(32).toString('base64url');
  await store.change(s=>{
    if(!s.players[playerId]){
      const code=process.env.BETA_ACCESS_CODE;
      if(!code)throw problem('内测邀请口令尚未配置。',503);
      if(!equal(body.accessCode||'',code))throw problem('内测邀请口令不正确。',403);
      const name=(body.name||'跑者').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,12)||'跑者';
      addPlayer(s,{id:playerId,name,color:undefined,kind:'android-beta'},Date.now());
    }
    else if(body.name)s.players[playerId].name=body.name.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,12)||'跑者';
    s.sessions[hash(token)]={playerId,expiresAt:Date.now()+RULES.sessionLifetimeMs};
  });
  return reply.send({token,playerId,now:Date.now()});
});
app.get('/api/state',authenticated,async(request)=>{
  const query=request.query as {bbox?:string;mode?:string};
  const state=await store.read(),view=publicState(state,uid(request),Date.now());
  let limited=false;
  if(query.mode&&!['mine','pool'].includes(query.mode))throw problem('地图模式无效。');
  if(query.bbox){
    const bbox=query.bbox.split(',').map(Number);
    if(bbox.length!==4||!bbox.every(Number.isFinite)||bbox[0]>=bbox[2]||bbox[1]>=bbox[3]||bbox[0]<-180||bbox[2]>180||bbox[1]<-80||bbox[3]>80||bbox[2]-bbox[0]>5||bbox[3]-bbox[1]>5)throw problem('地图范围过大或无效，请放大后查看。');
    if(view.pool){const slice=await store.cells(view.pool.id,bbox,query.mode==='mine'?uid(request):undefined);view.pool.cells=slice.cells;limited=slice.limited;}
  }else if(view.pool){view.pool.cells=view.pool.cells.filter(c=>query.mode!=='mine'||c.owner===uid(request));limited=view.pool.cells.length>3000;view.pool.cells=view.pool.cells.slice(0,3000);}
  return {...view,...(bots?{developerBots:bots.status()}:{}),map:{limited,limit:3000}};
});
app.post('/api/developer/bots',{...authenticated,schema:{body:object({action:{type:'string',enum:['start','pause','run']},playerId:string,preset:string,startPercent:{type:'integer',minimum:0,maximum:99}},['action'])}},async request=>{
  if(!bots)throw problem('普通环境没有开发工具。',404);
  const body=request.body as {action:string;playerId?:string;preset?:string;startPercent?:number};
  if(body.action==='pause')return bots.pause();
  if(body.action==='run')return bots.run(body.playerId,body.preset,body.startPercent);
  return bots.start();
});
app.get('/api/events',{websocket:true,preValidation:auth},socket=>{
  sockets.add(socket);socket.send(JSON.stringify({type:'refresh'}));socket.on('close',()=>sockets.delete(socket));
});
app.get('/api/nearby',authenticated,async(request)=>{
  const q=request.query as {lat:string;lng:string},center={lat:Number(q.lat),lng:Number(q.lng)};
  if(![center.lat,center.lng].every(Number.isFinite)||Math.abs(center.lat)>80||Math.abs(center.lng)>180)throw problem('位置无效。');
  return {runners:nearby(await store.read(),uid(request),center,Date.now())};
});
app.post('/api/runs/start',{...authenticated,schema:{body:object({shareLocation:boolean,invite:{type:'string',maxLength:128},...(development?{simulation:{type:'boolean',const:true},preset:string}:{})}) }},async(request)=>{
  const options=request.body as {shareLocation?:boolean;invite?:string;simulation?:boolean;preset?:string};
  if(options.simulation&&!roadRoutes.some(r=>r.id===options.preset))throw problem('请选择有效的开发测试路线。');
  if(options.preset&&!options.simulation)throw problem('路线选项仅用于模拟跑步。');
  const activity=await store.change(s=>{expirePlayers(s,Date.now());const existing=Object.values(s.activities).find(a=>a.playerId===uid(request)&&a.status==='active');
    if(existing){if(existing.source!==(options.simulation?'simulation':'gps'))throw problem('请先处理当前跑步，再开始另一种跑步。',409);existing.shareLocation=Boolean(options.shareLocation);if(!existing.shareLocation)s.players[uid(request)].live=null;return existing;}
    const a=startActivity(s,uid(request),Date.now(),options);
    if(options.simulation){const route=simulationRoute(uid(request),options.preset,Date.now()).map((p:Omit<Sample,'seq'>)=>({...p,time:Math.round(p.time)}));Object.assign(a,{simulationRoute:route,startedAt:route[0].time,roadRouteName:roadRoutes.find(r=>r.id===options.preset)!.name});}
    return a;
  });
  notify();return {id:activity.id,startedAt:activity.startedAt,shareLocation:activity.shareLocation,now:Date.now(),source:activity.source,...(activity.source==='simulation'?{route:activity.simulationRoute,roadRouteName:activity.roadRouteName}:{})};
});
app.post('/api/runs/:id/points',{...authenticated,schema:{body:object({points:{type:'array',minItems:1,maxItems:200,items:object({seq:{type:'integer',minimum:1,maximum:6000},lat:number,lng:number,time:{type:'integer'},accuracy:number},['seq','lat','lng','time','accuracy'])}},['points'])}},async(request)=>{
  const id=(request.params as {id:string}).id;
  return store.append(uid(request),id,(request.body as {points:Sample[]}).points,Date.now());
});
app.post('/api/runs/:id/finish',{...authenticated,schema:{body:object({endedAt:{type:'integer'},pointCount:{type:'integer',minimum:1,maximum:6000},acceptFallback:boolean},['endedAt','pointCount'])}},async(request)=>{
  const id=(request.params as {id:string}).id,body=request.body as {endedAt:number;pointCount:number;acceptFallback?:boolean};
  const report=await store.change(async s=>{
    expirePlayers(s,Date.now());const a=s.activities[id];
    if(!a||a.playerId!==uid(request))throw problem('跑步记录不存在。',404);
    if(a.status==='completed')return a.report;
    const samples=await store.samples(id);
    if(samples.length!==body.pointCount)throw problem('还有轨迹未上传，请继续补传后结算。',409,'UPLOAD_INCOMPLETE');
    return finishActivity(s,uid(request),id,samples,Date.now(),{endedAt:body.endedAt,acceptFallback:Boolean(body.acceptFallback)});
  });
  notify();return report;
});
app.post('/api/runs/:id/cancel',authenticated,async(request)=>{
  const result=await store.change(s=>{const id=(request.params as {id:string}).id,a=s.activities[id];
    if(!a||a.playerId!==uid(request))throw problem('活动不存在。',404);
    if(a.status==='completed')return {ok:true,report:a.report};
    cancelActivity(s,uid(request),id);return {ok:true};
  });notify();return result;
});
app.get('/api/runs/:id',authenticated,async(request)=>{
  const a=(await store.read()).activities[(request.params as {id:string}).id];
  if(!a||a.playerId!==uid(request)||a.status!=='completed')throw problem('跑步记录不存在。',404);
  return {id:a.id,...a.report,route:a.route};
});
app.post('/api/live',{...authenticated,schema:{body:object({activityId:string,lat:number,lng:number,share:boolean},['activityId','lat','lng','share'])}},async(request)=>{
  const body=request.body as {activityId:string;lat:number;lng:number;share:boolean};
  await store.change(s=>updateLive(s,uid(request),body.activityId,body,Date.now()));return {ok:true};
});
app.post('/api/auth/logout',authenticated,async(request)=>{
  await store.change(s=>{for(const [id,session] of Object.entries(s.sessions))if(session.playerId===uid(request))delete s.sessions[id];});return {ok:true};
});
const sweep=setInterval(()=>{store.change(s=>expirePlayers(s,Date.now())).then(changed=>{if(changed)notify();}).catch(()=>app.log.error('GPS maintenance failed'));},60000);sweep.unref();
app.addHook('preClose',async()=>{clearInterval(sweep);await bots?.pause();});
app.addHook('onClose',async()=>{for(const socket of sockets)socket.close();await store.close();});
await app.listen({host:gpsHost,port:gpsPort});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{app.close().then(()=>process.exit(0));});
