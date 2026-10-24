import http from 'node:http';
import { randomBytes,createHash } from 'node:crypto';
import { readFile,stat } from 'node:fs/promises';
import { resolve,dirname,extname,sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store.mjs';
import { RULES,DEFAULT_CENTER,COLORS } from '../shared/config.mjs';
import { addPlayer,expirePlayers,startActivity,finishActivity,cancelActivity,updateLive,publicState,nearby } from './game.mjs';
import { PERSONAS,BOT_PERSONAS,ROAD_CATALOG,simulationRoute } from './sandbox.mjs';
import { ReplayBots } from './replay-bots.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const production=process.env.NODE_ENV==='production';
const sandbox=process.env.ALLOW_SANDBOX ? process.env.ALLOW_SANDBOX==='true' : !production;
if(production && sandbox) throw new Error('生产环境禁止开启 ALLOW_SANDBOX。');
const host=process.env.HOST || '127.0.0.1', port=Number(process.env.PORT || 4173);
const publicUrl=process.env.PUBLIC_URL || `http://localhost:${port}`;
const store=new Store(resolve(root,process.env.DATA_FILE || (sandbox?'data/looprun.sqlite':'data/looprun-production.sqlite')));
if(!sandbox && Object.values(store.read().players).some(p=>p.kind!=='wechat')) throw new Error('正式环境必须使用独立于道路回放的新数据库。');
let vite;
if(!production) { const {createServer}=await import('vite'); vite=await createServer({configFile:resolve(root,'vite.config.mjs'),server:{middlewareMode:true}}); }
const subscribers=new Set(), buckets=new Map();
const hash=value=>createHash('sha256').update(value).digest('hex');
const notify=()=>{ for(const response of subscribers) response.write('event: refresh\ndata: {}\n\n'); };
const bots=sandbox?new ReplayBots(`http://${host==='0.0.0.0'?'127.0.0.1':host.includes(':')?`[${host}]`:host}:${port}`,BOT_PERSONAS,ROAD_CATALOG.routes.filter(r=>r.id.startsWith('replay-')),notify):null;
function send(response,status,payload) { response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); response.end(JSON.stringify(payload)); }
function fail(message,status=400,code) { return Object.assign(new Error(message),{status,code}); }
function auth(request,state) {
  const bearer=request.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1];
  const cookie=request.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('looprun_session='))?.slice(16);
  const token=bearer || cookie;
  const session=token && state.sessions[hash(token)];
  if(!session || session.expiresAt<Date.now() || !state.players[session.playerId]) throw fail('请先登录。',401,'UNAUTHENTICATED');
  return session.playerId;
}
function login(response,playerId) {
  const token=randomBytes(32).toString('base64url');
  store.change(s=>{s.sessions[hash(token)]={playerId,expiresAt:Date.now()+RULES.sessionLifetimeMs};});
  response.setHeader('Set-Cookie',`looprun_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${RULES.sessionLifetimeMs/1000}${production?'; Secure':''}`);
  return token;
}
async function body(request) {
  let chunks=[],size=0;
  for await(const chunk of request) { size+=chunk.length; if(size>1200000) throw fail('请求内容过大。',413); chunks.push(chunk); }
  if(!size) return {};
  try { const value=JSON.parse(Buffer.concat(chunks).toString('utf8')); if(!value || typeof value!=='object' || Array.isArray(value)) throw 0; return value; }
  catch { throw fail('请求需为有效的 JSON 对象。'); }
}
function textName(input) { return String(input || '跑者').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,12) || '跑者'; }
function rateLimit(request,path) {
  const key=`${request.socket.remoteAddress}:${path.startsWith('/api/auth')?'auth':'api'}`;
  const now=Date.now(), limit=path.startsWith('/api/auth')?30:600;
  let bucket=buckets.get(key);
  if(!bucket || now-bucket.start>60000) {bucket={start:now,count:0};buckets.set(key,bucket);}
  if(++bucket.count>limit) throw fail('操作较频繁，请稍后重试。',429);
  if(buckets.size>10000) for(const [k,v] of buckets) if(now-v.start>60000) buckets.delete(k);
}

async function api(request,response,url) {
  const path=url.pathname, method=request.method, wallNow=Date.now(),now=wallNow+store.read().demoOffsetMs;
  rateLimit(request,path);
  const origin=request.headers.origin;
  if(method!=='GET' && origin && origin!==new URL(publicUrl).origin && origin!==`http://${request.headers.host}` && !origin.startsWith('https://servicewechat.com')) throw fail('请求来源不受支持。',403);
  if(path==='/api/config' && method==='GET') return send(response,200,{sandbox,rules:RULES,center:DEFAULT_CENTER,version:'0.2.0',personas:PERSONAS,routes:sandbox?ROAD_CATALOG.routes.map(({id,name,description,points,distance,roads})=>({id,name,description,points,distance,roads})):[],routeProvider:ROAD_CATALOG.provider,wechatReady:Boolean(process.env.WECHAT_APP_ID && process.env.WECHAT_APP_SECRET)});
  if(path==='/api/health' && method==='GET') return send(response,200,{ok:true,version:'0.2.0',sandbox,mode:sandbox?'road-replay':'gps'});
  if(path==='/api/auth/development' && method==='POST') {
    if(!sandbox) throw fail('开发身份仅在本地沙盒可用。',404);
    const data=await body(request);
    const persona=[...PERSONAS,...BOT_PERSONAS].find(p=>p.id===data.persona);
    if(!persona)throw fail('请选择有效的道路回放身份。');
    store.change(s=>addPlayer(s,{...persona,kind:'road-replay'},now));
    return send(response,200,{token:login(response,persona.id),playerId:persona.id});
  }
  if(path==='/api/auth/wechat' && method==='POST') {
    const data=await body(request), appid=process.env.WECHAT_APP_ID,secret=process.env.WECHAT_APP_SECRET;
    if(!appid || !secret) throw fail('服务端尚未配置微信登录。请先完成 AppID / AppSecret 接入。',503,'WECHAT_UNCONFIGURED');
    if(typeof data.code!=='string' || data.code.length>256) throw fail('微信登录凭证无效。');
    const endpoint=new URL('https://api.weixin.qq.com/sns/jscode2session');
    endpoint.search=new URLSearchParams({appid,secret,js_code:data.code,grant_type:'authorization_code'}).toString();
    let result;
    try { const remote=await fetch(endpoint,{signal:AbortSignal.timeout(12000)}); if(!remote.ok) throw 0; result=await remote.json(); } catch { throw fail('微信登录暂不可用，请重试。',502); }
    if(!result.openid || result.errcode) throw fail('微信登录凭证已失效，请重新登录。',401);
    const id=`wx_${hash(`${appid}:${result.openid}`).slice(0,32)}`;
    store.change(s=>addPlayer(s,{id,name:textName(data.name)},now));
    return send(response,200,{token:login(response,id),playerId:id});
  }
  if(path.startsWith('/api/invites/') && method==='GET') {
    const token=path.slice('/api/invites/'.length);
    const state=store.read(),invite=state.invites[token],p=invite && state.players[invite.playerId];
    if(!invite || invite.expiresAt<now || !p || p.poolId!==invite.poolId) throw fail('这张邀请已失效，请让朋友重新生成。',404);
    return send(response,200,{name:p.name,color:p.color,poolName:state.pools[p.poolId]?.name,available:state.pools[p.poolId].members.length<RULES.poolSize,expiresAt:invite.expiresAt});
  }
  // 清退先独立落库，不能因随后业务请求失败而回滚。
  const expired=store.change(s=>expirePlayers(s,now,wallNow));
  if(expired) notify();
  const state=store.read(), playerId=auth(request,state);
  if(path==='/api/state' && method==='GET') return send(response,200,{...publicState(state,playerId,now),...(bots?{replayBots:bots.status()}:{})});
  if(path==='/api/sandbox/bots' && method==='POST') {
    if(!bots)throw fail('此操作仅在道路回放环境可用。',404);
    const data=await body(request);
    if(data.action==='start')return send(response,200,await bots.start());
    if(data.action==='pause')return send(response,200,await bots.pause());
    throw fail('请选择启动或暂停机器人。');
  }
  if(/^\/api\/runs\/[^/]+$/.test(path) && method==='GET') {
    const a=state.activities[path.split('/')[3]];
    if(!a || a.playerId!==playerId || a.status!=='completed') throw fail('跑步记录不存在。',404);
    return send(response,200,{id:a.id,...a.report,route:a.route});
  }
  if(path==='/api/events' && method==='GET') {
    response.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});
    response.write('event: refresh\ndata: {}\n\n'); subscribers.add(response);
    const ping=setInterval(()=>response.write(': heartbeat\n\n'),20000);
    request.on('close',()=>{clearInterval(ping);subscribers.delete(response);});
    return;
  }
  if(path==='/api/nearby' && method==='GET') {
    const center={lat:Number(url.searchParams.get('lat')),lng:Number(url.searchParams.get('lng'))};
    if(![center.lat,center.lng].every(Number.isFinite) || Math.abs(center.lat)>80 || Math.abs(center.lng)>180) throw fail('位置无效。');
    return send(response,200,{runners:nearby(state,playerId,center,now)});
  }
  if(path==='/api/auth/logout' && method==='POST') {
    store.change(s=>{for(const [key,session] of Object.entries(s.sessions)) if(session.playerId===playerId) delete s.sessions[key];});
    response.setHeader('Set-Cookie','looprun_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    return send(response,200,{ok:true});
  }
  const data=method==='POST'?await body(request):{};
  let result;
  if(path==='/api/profile' && method==='POST') result=store.change(s=>{s.players[playerId].name=textName(data.name); return {ok:true};});
  else if(path==='/api/runs/start' && method==='POST') {
    if(data.simulation && !sandbox) throw fail('正式环境不接受模拟轨迹。',403);
    if(!data.simulation && sandbox) throw fail('当前为道路回放环境；实际 GPS 请使用独立的正式环境。',400);
    if(data.invite && (typeof data.invite!=='string' || data.invite.length>128)) throw fail('邀请无效。');
    result=store.change(s=>{
      const activity=startActivity(s,playerId,now,data);
      if(data.simulation) {
        const route=simulationRoute(playerId,data.preset,now);
        activity.startedAt=route[0].time; activity.simulationRoute=route;
        activity.roadRouteName=ROAD_CATALOG.routes.find(r=>r.id===data.preset).name;
      }
      return {id:activity.id,startedAt:activity.startedAt,source:activity.source,route:activity.simulationRoute || [],roadRouteName:activity.roadRouteName};
    });
  }
  else if(/^\/api\/runs\/[^/]+\/finish$/.test(path) && method==='POST') {
    const id=path.split('/')[3];
    result=store.change(s=>{
      const activity=s.activities[id];
      if(activity?.status==='active' && activity.source==='simulation' && activity.playerId===playerId) {
        const shift=now-activity.simulationRoute.at(-1).time;
        activity.simulationRoute=activity.simulationRoute.map(p=>({...p,time:p.time+shift}));
        activity.startedAt=activity.simulationRoute[0].time;
      }
      const points=activity?.source==='simulation' ? activity.simulationRoute : data.points;
      return finishActivity(s,playerId,id,points,now,{acceptFallback:Boolean(data.acceptFallback)});
    });
  }
  else if(/^\/api\/runs\/[^/]+\/cancel$/.test(path) && method==='POST') result=store.change(s=>{cancelActivity(s,playerId,path.split('/')[3]);return {ok:true};});
  else if(path==='/api/live' && method==='POST') result=store.change(s=>{updateLive(s,playerId,data.activityId,{lat:Number(data.lat),lng:Number(data.lng),share:data.share},now);return {ok:true};});
  else if(path==='/api/invites' && method==='POST') {
    result=store.change(s=>{
      const p=s.players[playerId];
      if(!p.poolId) throw fail('完成首次闭环并入池后，就能邀请朋友。');
      if(s.pools[p.poolId].members.length>=RULES.poolSize) throw fail('本池已满 6 人，暂时无法邀请。');
      const existing=Object.entries(s.invites).find(([,i])=>i.playerId===playerId && i.poolId===p.poolId && i.expiresAt>now);
      const token=existing?.[0] || randomBytes(18).toString('base64url');
      const invite=existing?.[1] || {playerId,poolId:p.poolId,expiresAt:now+7*86400000};
      s.invites[token]=invite;
      return {token,url:`${publicUrl}/join/${token}`,path:`pages/home/index?invite=${token}`,expiresAt:invite.expiresAt};
    });
  }
  else if(path==='/api/sandbox/advance' && method==='POST') {
    if(!sandbox) throw fail('此操作仅在道路回放环境可用。',404);
    if(bots.enabled)throw fail('请先暂停机器人，再推进日期。');
    const days=Number(data.days);
    if(![1,3,4,14].includes(days)) throw fail('请选择支持的回放日期间隔。');
    result=store.change(s=>{
      if(Object.values(s.activities).some(a=>a.status==='active')) throw fail('请先结束所有进行中的回放。');
      s.demoOffsetMs+=days*86400000;
      const next=wallNow+s.demoOffsetMs;expirePlayers(s,next,wallNow);
      return {now:next,days};
    });
  }
  else throw fail('接口不存在。',404);
  if(path!=='/api/live') notify(); send(response,200,result);
}

const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2','.json':'application/json; charset=utf-8'};
const server=http.createServer(async(request,response)=>{
  response.setHeader('X-Content-Type-Options','nosniff');
  response.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  response.setHeader('X-Frame-Options','DENY');
  const url=new URL(request.url,`http://${request.headers.host || 'localhost'}`);
  try {
    if(url.pathname.startsWith('/api/')) return await api(request,response,url);
    if(vite) return vite.middlewares(request,response,()=>{response.writeHead(404);response.end('Not found');});
    let path=resolve(root,'dist',`.${decodeURIComponent(url.pathname)}`);
    const dist=resolve(root,'dist');
    if(path!==dist && !path.startsWith(dist+sep)) throw fail('路径无效。',403);
    let info;
    try {info=await stat(path);} catch {}
    if(!info?.isFile()) {
      if(extname(url.pathname)) {response.writeHead(404);return response.end('Not found');}
      path=resolve(dist,'index.html');
    }
    const content=await readFile(path);
    response.writeHead(200,{'Content-Type':mime[extname(path)] || 'application/octet-stream','Cache-Control':path.endsWith('index.html')?'no-cache':'public, max-age=3600'});response.end(content);
  } catch(error) {
    if(response.headersSent) return response.end();
    const known=error.status || error.code==='INVITE_UNAVAILABLE' || /^[\u3400-\u9fff]/u.test(error.message || '');
    if(!known) console.error('Request failed:',error.name,error.message);
    send(response,error.status || (known?400:500),{error:known?error.message:'服务暂不可用，请稍后重试。',code:error.code});
  }
});
const sweep=setInterval(()=>{try {if(store.change(s=>expirePlayers(s,Date.now()+s.demoOffsetMs,Date.now()))) notify();} catch(error) {console.error('Maintenance failed:',error.message);}},60000);
sweep.unref();
server.listen(port,host,()=>console.log(`LoopRun ${sandbox?'ROAD REPLAY':'PRODUCTION'} ready at ${publicUrl}`));
async function shutdown(){clearInterval(sweep);await bots?.pause();for(const r of subscribers)r.end();await vite?.close();server.close(()=>{store.close();process.exit(0);});}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
