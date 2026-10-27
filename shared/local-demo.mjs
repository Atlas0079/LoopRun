import {createGame} from './game.mjs';
import {RULES} from './config.mjs';
import {cellCenter} from './geo.mjs';
import {simulationPoints} from './road-simulation.mjs';
import {BOT_PERSONAS} from './bot-personas.mjs';
import {ReplayBots} from './replay-bots.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));
// Same activity operations as the online transport, backed by an isolated on-device world.
export class LocalDemo {
  constructor({routes,read,write,id,now=Date.now}){
    this.routes=routes;this.write=write;this.id=id;this.now=now;this.game=createGame(id);
    this.pending=Promise.resolve();this.listeners=new Set();this.readError='';
    try{
      const saved=read();this.saved=saved;this.data=saved?JSON.parse(saved):this.fresh();
      if(this.data.format!==1||!this.data.world?.players[this.data.playerId]||!this.data.samples)throw new Error('invalid demo data');
      // Restarting the app pauses robots; the user's own simulated activity remains recoverable.
      for(const activity of Object.values(this.data.world.activities))if(activity.playerId!==this.data.playerId&&activity.status==='active')this.game.cancelActivity(this.data.world,activity.playerId,activity.id);
    }catch{this.data=this.fresh();this.saved='';this.readError='本地演示数据无法读取，请在设置中重置演示';}
    this.bots=this.createBots();
  }
  fresh(){
    const world=this.game.emptyState(),playerId='demo-'+this.id();
    this.game.addPlayer(world,{id:playerId,name:'演示跑者',kind:'android-beta'},this.now());
    return {format:1,world,playerId,samples:{}};
  }
  createBots(){
    return new ReplayBots('',BOT_PERSONAS,this.routes.filter(r=>r.id.startsWith('replay-')),()=>this.changed(),{
      realtime:true,catalog:this.routes,login:persona=>({persona:persona.id}),
      request:(client,path,body)=>this.requestAs(client.playerId,path,body),
    });
  }
  subscribe(listener){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
  changed(){for(const listener of this.listeners)listener();}
  transaction(action){
    const work=this.pending.then(async()=>{
      if(this.readError)throw new Error(this.readError);
      const next=clone(this.data);this.game.expirePlayers(next.world,this.now());
      const result=action(next),serialized=JSON.stringify(next);
      if(serialized!==this.saved){await this.write(serialized);this.data=next;this.saved=serialized;this.changed();}
      return clone(result);
    });
    this.pending=work.catch(()=>{});return work;
  }
  async reset(){
    await this.bots.pause();
    const work=this.pending.then(async()=>{
      const next=this.fresh(),serialized=JSON.stringify(next);await this.write(serialized);
      this.data=next;this.saved=serialized;this.readError='';this.bots=this.createBots();this.changed();
    });
    this.pending=work.catch(()=>{});await work;
  }
  async pause(){return this.bots.pause();}
  request(path,body){
    if(path==='/developer/bots'){
      if(this.readError)return Promise.reject(new Error(this.readError));
      if(body?.action==='start')return this.bots.start();
      if(body?.action==='pause')return this.bots.pause();
      if(body?.action==='run')return this.bots.run(body.playerId,body.preset,body.startPercent);
      return Promise.reject(new Error('请选择有效的机器人操作'));
    }
    return this.requestAs(null,path,body);
  }
  requestAs(playerId,path,body){
    return this.transaction(data=>{
      const now=this.now(),world=data.world;playerId=playerId||data.playerId;
      if(path==='/auth/beta'){
        const persona=BOT_PERSONAS.find(p=>p.id===body?.persona);if(!persona)throw new Error('本地跑者不存在');
        this.game.addPlayer(world,{...persona,kind:'android-beta'},now);
        return {token:'local-'+persona.id,playerId:persona.id};
      }
      if(!world.players[playerId])throw new Error('本地账户不存在');
      const [pathname,search='']=path.split('?'),query=new URLSearchParams(search);
      if(pathname==='/health')return {ok:true,mode:'gps',development:true,localDemo:true};
      if(pathname==='/config')return {development:true,routes:this.routes,rules:RULES};
      if(pathname==='/state'){
        const view=this.game.publicState(world,playerId,now);
        if(view.pool){
          const bounds=query.get('bbox')?.split(',').map(Number);
          view.pool.cells=view.pool.cells.filter(cell=>{
            if(query.get('mode')==='mine'&&cell.owner!==playerId)return false;
            if(bounds?.length===4&&bounds.every(Number.isFinite)){const p=cellCenter(cell.key);return p.lng>=bounds[0]&&p.lat>=bounds[1]&&p.lng<=bounds[2]&&p.lat<=bounds[3];}
            return true;
          });
        }
        const limited=(view.pool?.cells.length||0)>3000;if(view.pool)view.pool.cells=view.pool.cells.slice(0,3000);
        return {...view,map:{limited,limit:3000},developerBots:this.bots.status()};
      }
      if(pathname==='/nearby'){
        const center={lat:Number(query.get('lat')),lng:Number(query.get('lng'))};
        if(!Number.isFinite(center.lat)||!Number.isFinite(center.lng))throw new Error('地图位置无效');
        return {runners:this.game.nearby(world,playerId,center,now)};
      }
      if(pathname==='/runs/start'){
        const route=body?.simulation?this.routes.find(r=>r.id===body.preset):null;
        if(body?.simulation&&!route)throw new Error('请选择有效的演示路线');
        if(!body?.simulation&&playerId===data.playerId)throw new Error('本地演示请使用预设路线，真实 GPS 跑步请切换至联机模式');
        let activity=Object.values(world.activities).find(a=>a.playerId===playerId&&a.status==='active');
        if(activity&&activity.source!==(body?.simulation?'simulation':'gps'))throw new Error('请先处理当前活动');
        if(!activity){
          activity=this.game.startActivity(world,playerId,now,{simulation:Boolean(body?.simulation),shareLocation:Boolean(body?.shareLocation)});
          data.samples[activity.id]=[];
          if(route){
            const points=simulationPoints(route,now).map(p=>({...p,time:Math.round(p.time)}));
            Object.assign(activity,{simulationRoute:points,startedAt:points[0].time,roadRouteName:route.name});
          }
        }
        return {id:activity.id,startedAt:activity.startedAt,source:activity.source,shareLocation:activity.shareLocation,now,...(activity.simulationRoute?{route:activity.simulationRoute,roadRouteName:activity.roadRouteName}:{})};
      }
      if(pathname==='/live'){this.game.updateLive(world,playerId,body.activityId,body,now);return {ok:true};}
      const match=pathname.match(/^\/runs\/([^/]+)(?:\/(points|finish|cancel))?$/);
      if(!match)throw new Error('本地演示不支持此操作');
      const [,activityId,operation]=match,activity=world.activities[activityId];
      if(!activity||activity.playerId!==playerId)throw new Error('跑步记录不存在');
      const samples=data.samples[activityId]||[];
      if(operation==='points'){
        if(activity.status!=='active')throw new Error('活动已结束');
        if(!Array.isArray(body?.points)||!body.points.length||body.points.length>200)throw new Error('采样批次无效');
        for(const point of body.points){
          if(!Number.isInteger(point.seq)||point.seq<1||point.seq>6000||!['lat','lng','time','accuracy'].every(k=>Number.isFinite(point[k]))||point.time>now+10000)throw new Error('采样内容无效');
          const previous=samples[point.seq-1];
          if(previous){if(!['seq','lat','lng','time','accuracy'].every(k=>previous[k]===point[k]))throw new Error('重复序号的采样内容冲突');continue;}
          if(point.seq!==samples.length+1)throw new Error('请按序上传采样');
          samples.push({...point});
        }
        data.samples[activityId]=samples;return {acceptedThrough:samples.length};
      }
      if(operation==='finish'){
        if(activity.status==='completed')return activity.report;
        if(samples.length!==body?.pointCount)throw new Error('还有轨迹未保存，请重试');
        return this.game.finishActivity(world,playerId,activityId,samples,now,{endedAt:body.endedAt});
      }
      if(operation==='cancel'){
        if(activity.status==='completed')return {ok:true,report:activity.report};
        this.game.cancelActivity(world,playerId,activityId);return {ok:true};
      }
      if(activity.status!=='completed')throw new Error('这次跑步尚未结算');
      return {id:activityId,...activity.report,route:activity.route};
    });
  }
}
