const geo=require('../../lib/geo');
Page({
  data:{loading:true,loggedIn:false,error:'',state:null,polygons:[],markers:[],center:{latitude:31.2353,longitude:121.4747},nearbyCount:0,invite:null,incomingInvite:'',privacyRequired:false,showRules:false,sandbox:false,limitedCells:false},
  onLoad(query){this.setData({incomingInvite:query.invite||''});this.load();},
  onShow(){if(getApp().globalData.token)this.load();this.timer=setInterval(()=>this.load(true),5000);},
  onHide(){clearInterval(this.timer);},onUnload(){clearInterval(this.timer);},
  onPullDownRefresh(){this.load().finally(()=>wx.stopPullDownRefresh());},
  async load(quiet){
    const app=getApp();
    try{
      if(!app.globalData.config)app.globalData.config=await app.api('/config');
      this.setData({sandbox:app.globalData.config.sandbox});
      if(!app.globalData.token){this.setData({loading:false,loggedIn:false});return;}
      const state=await app.api('/state'),player=state.player;
      const members=state.pool?state.pool.members:[];
      const ownerMap={};members.forEach(p=>{ownerMap[p.id]=p;});
      state.displayArea=(player.area/1000000).toFixed(2);state.displayDistance=(player.totalDistance/1000).toFixed(2);
      this.rawCells=state.pool?state.pool.cells:[];
      this.ownerMap=ownerMap;
      const signature=JSON.stringify(this.rawCells);
      const center=player.center||{lat:31.2353,lng:121.4747},gcj=geo.wgsToGcj(center);
      if(!this.data.state||this.data.state.player.poolId!==player.poolId){this.mapCenterWgs=center;}
      if(state.pool){const {cells,...poolView}=state.pool;state.pool=poolView;}
      const patch={state,loggedIn:true,loading:false,error:''};
      if(!this.data.state||this.data.state.player.poolId!==player.poolId)patch.center={latitude:gcj.lat,longitude:gcj.lng};
      this.setData(patch);
      if(signature!==this.cellSignature){this.cellSignature=signature;this.renderCells();}
      const result=await app.api(`/nearby?lat=${center.lat}&lng=${center.lng}`);
      this.setData({nearbyCount:result.runners.length});
      if(result.runners.length)await this.makeMarkers(result.runners);else this.setData({markers:[]});
    }catch(error){if(error.status===401)this.setData({loggedIn:false});if(!quiet)this.setData({error:error.message,loading:false});}
  },
  renderCells(){
    const center=geo.project(this.mapCenterWgs||{lat:31.2353,lng:121.4747});
    const cells=(this.rawCells||[]).map(cell=>{const p=geo.project(geo.cellCenter(cell.key));return{cell,d:(p.x-center.x)**2+(p.y-center.y)**2};}).sort((a,b)=>a.d-b.d).slice(0,900).map(item=>item.cell);
    const ownerMap=this.ownerMap||{};
    const polygons=cells.map(cell=>({points:geo.cellCorners(cell.key).map(p=>{const gcj=geo.wgsToGcj(p);return{latitude:gcj.lat,longitude:gcj.lng};}),strokeWidth:1,strokeColor:ownerMap[cell.owner]?ownerMap[cell.owner].color:'#a6b198',fillColor:ownerMap[cell.owner]?`${ownerMap[cell.owner].color}${cell.fortification===3?'a0':cell.fortification===2?'75':'50'}`:'#a6b19825'}));
    this.setData({polygons,limitedCells:(this.rawCells||[]).length>900});
  },
  regionChange(event){
    if(event.type!=='end')return;
    wx.createMapContext('territoryMap',this).getCenterLocation({success:position=>{this.mapCenterWgs=geo.gcjToWgs({lat:position.latitude,lng:position.longitude});this.renderCells();}});
  },
  async makeMarkers(runners){
    if(!this.markerPath){
      await new Promise(resolve=>wx.createSelectorQuery().in(this).select('#markerCanvas').fields({node:true,size:true}).exec(result=>{
        const canvas=result[0]&&result[0].node;if(!canvas){resolve();return;}
        canvas.width=64;canvas.height=64;const ctx=canvas.getContext('2d');ctx.fillStyle='#d8f16b';ctx.beginPath();ctx.arc(32,32,23,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=7;ctx.stroke();
        wx.canvasToTempFilePath({canvas,destWidth:64,destHeight:64,success:r=>{this.markerPath=r.tempFilePath;resolve();},fail:resolve},this);
      }));
    }
    if(!this.markerPath)return;
    this.setData({markers:runners.map((p,index)=>{const gcj=geo.wgsToGcj(p);return{id:index+1,latitude:gcj.lat,longitude:gcj.lng,width:22,height:22,iconPath:this.markerPath,callout:{content:`${p.name} · ${p.source==='simulation'?'道路回放':'大致位置'}${p.samePool?' · 同池':''}`,color:'#60754b',bgColor:'#fcfff5',fontSize:10,padding:5,borderRadius:5,display:'ALWAYS'}};})});
  },
  async login(event){this.setData({loading:true,error:''});try{await getApp().login();await this.load();}catch(error){this.setData({error:error.message,loading:false});}},
  goRun(){wx.navigateTo({url:`/pages/run/index${this.data.incomingInvite?`?invite=${this.data.incomingInvite}`:''}`});},
  goHistory(){wx.navigateTo({url:'/pages/history/index'});},
  async prepareInvite(){try{const invite=await getApp().api('/invites',{});this.setData({invite});}catch(error){wx.showModal({title:'暂时无法邀请',content:error.message,showCancel:false});}},
  closeInvite(){this.setData({invite:null});},
  onShareAppMessage(){const invite=this.data.invite;return{title:`${this.data.state?this.data.state.player.name:'跑友'}邀请你：来跑同一片主场`,path:invite?invite.path:'pages/home/index'};},
  copyInvite(){wx.setClipboardData({data:this.data.invite.url});},
  toggleRules(){this.setData({showRules:!this.data.showRules});},
  agreePrivacy(event){getApp().agreePrivacy(event);this.setData({privacyRequired:false});},
  rejectPrivacy(){const resolve=getApp().globalData.privacyResolve;if(resolve)resolve({event:'disagree'});getApp().globalData.privacyResolve=null;this.setData({privacyRequired:false});},
});
