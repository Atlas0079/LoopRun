// Automatic clients use the same authenticated HTTP endpoints as the replay UI.
export class ReplayBots {
  constructor(baseUrl,personas,routes,changed=()=>{},options={}) {
    this.baseUrl=baseUrl;this.personas=personas;this.routes=routes;this.changed=changed;
    this.options=options;this.enabled=false;this.clients=this.makeClients(0);this.pending=Promise.resolve();
  }
  makeClients(rounds){return this.personas.map((persona,i)=>({persona,phase:'未开始',completed:0,plan:Array.from({length:rounds},(_,round)=>this.routes[(i+round)%this.routes.length]),nextAt:Date.now()+i*1800}));}
  status(){return {enabled:this.enabled,players:this.clients.map(c=>({id:c.persona.id,playerId:c.playerId,name:c.persona.name,phase:c.phase,route:c.routeName,routeId:c.routeId,progress:c.progress||0,completed:c.completed,total:c.plan?.length||0,error:c.error||null}))};}
  async request(client,path,body){
    const response=await fetch(`${this.baseUrl}/api${path}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(client.token?{Authorization:`Bearer ${client.token}`}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(8000)});
    const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error||`HTTP ${response.status}`),{status:response.status});return result;
  }
  async start(){
    if(this.pausing)throw new Error('机器人正在暂停，请稍后启动。');
    if(this.enabled)return this.status();
    if(this.clients.some(c=>c.activity))throw new Error('请先重试暂停，确认未完成活动已取消。');
    this.clients=this.makeClients(4);for(const c of this.clients)c.phase='等待出发';
    this.activate();return this.status();
  }
  async run(playerId,preset){
    if(this.pausing||this.enabled)throw new Error('请先暂停所有机器人，再指定单独路线。');
    await this.pending;
    if(this.pausing||this.enabled)throw new Error('请先暂停所有机器人，再指定单独路线。');
    const c=this.clients.find(c=>c.persona.id===playerId),route=(this.options.catalog||this.routes).find(r=>r.id===preset);
    if(!c||!route)throw new Error('请选择有效的机器人与路线。');
    if(c.activity)throw new Error('这位机器人正在跑步，请先暂停再选择路线。');
    Object.assign(c,{plan:[route],completed:0,nextAt:Date.now(),phase:'等待出发',error:null,progress:0});
    if(!this.enabled)this.activate();else this.changed();return this.status();
  }
  activate(){
    this.enabled=true;
    this.timer=setInterval(()=>{
      if(this.ticking)return;
      this.ticking=true;
      this.pending=this.tick().catch(error=>{this.enabled=false;clearInterval(this.timer);for(const c of this.clients)c.error=error.message;this.changed();}).finally(()=>{this.ticking=false;});
    },1000);
    this.timer.unref();this.changed();
  }
  async pause(){
    if(this.pausing)return this.pausing;
    this.enabled=false;clearInterval(this.timer);
    this.pausing=this.cancelPending();
    try{return await this.pausing;}finally{this.pausing=null;}
  }
  async cancelPending(){
    await this.pending;
    for(const c of this.clients){
      if(c.activity)try{await this.request(c,`/runs/${c.activity.id}/cancel`,{});c.activity=null;c.error=null;}catch(error){c.error=error.message;}
      c.phase=c.activity?'暂停失败，请重试':'已暂停';
    }
    this.changed();return this.status();
  }
  async tick(){
    if(!this.enabled)return;
    const before=JSON.stringify(this.status());
    for(const c of this.clients){
      if(!this.enabled)break;
      try{
        if(c.completed>=(c.plan?.length||0))continue;
        if(c.retryAt&&Date.now()<c.retryAt)continue;
        if(!c.token){const login=await this.request(c,this.options.login?'/auth/beta':'/auth/development',this.options.login?this.options.login(c.persona):{persona:c.persona.id});c.token=login.token;c.playerId=login.playerId;}
        if(!c.activity&&Date.now()>=c.nextAt){
          // A finite round avoids empty repeated runs after the daily cell allowance is used.
          const route=c.plan[c.completed];
          const state=await this.request(c,'/state');
          if(state.activeActivity){await this.request(c,`/runs/${state.activeActivity.id}/cancel`,{});}
          c.activity=await this.request(c,'/runs/start',{simulation:true,preset:route.id,shareLocation:true});
          c.routeName=route.name;c.routeId=route.id;c.wallStartedAt=Date.now();c.phase='跑步中';c.error=null;c.lastLiveAt=0;
        }
        if(c.activity){
          const route=c.activity.route,index=Math.min(route.length-1,Math.floor((Date.now()-c.wallStartedAt)/14000*route.length));
          const point=route[index];
          c.progress=Math.round((index+1)/route.length*100);
          if(!c.lastLiveAt||Date.now()-c.lastLiveAt>=5000){await this.request(c,'/live',{activityId:c.activity.id,lat:point.lat,lng:point.lng,share:true});c.lastLiveAt=Date.now();}
          if(Date.now()-c.wallStartedAt>=14000){
            if(this.options.login){
              const points=route.map((p,i)=>({...p,seq:i+1}));
              for(let offset=0;offset<points.length;offset+=200)await this.request(c,`/runs/${c.activity.id}/points`,{points:points.slice(offset,offset+200)});
              await this.request(c,`/runs/${c.activity.id}/finish`,{endedAt:points.at(-1).time,pointCount:points.length});
            }else await this.request(c,`/runs/${c.activity.id}/finish`,{});
            c.activity=null;c.completed++;c.nextAt=Date.now()+9000;c.phase=c.completed>=c.plan.length?'本轮完成':'等待下一圈';c.error=null;
          }
        }
      }catch(error){
        c.error=error.message;c.phase='请求失败，等待重试';c.retryAt=Date.now()+10000;
        // Expired sessions are renewed through normal login on the next tick.
        if(error.status===401)c.token=null;
      }
    }
    if(this.clients.every(c=>c.completed>=(c.plan?.length||0))){this.enabled=false;clearInterval(this.timer);}
    if(before!==JSON.stringify(this.status()))this.changed();
  }
}
