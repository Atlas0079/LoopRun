const tracker=require('../../lib/tracker');
const geo=require('../../lib/geo');
const time=ms=>`${String(Math.floor(ms/60000)).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}`;
Page({
  data:{running:false,busy:false,share:false,error:'',distance:'0.00',elapsed:'00:00',closure:0,pointCount:0,polyline:[],center:{latitude:31.2353,longitude:121.4747},report:null,privacyRequired:false,recovered:false},
  onLoad(query){this.invite=query.invite||null;tracker.restore();},
  async onShow(){
    try{const state=await getApp().api('/state');
      if(!state.activeActivity&&tracker.activity)tracker.clear();
      if(state.activeActivity&&!tracker.activity){tracker.activity={...state.activeActivity,recovered:true};tracker.points=[];tracker.save();}
    }catch(error){this.setData({error:error.message});}
    this.update();this.timer=setInterval(()=>this.update(),1000);
  },
  onHide(){clearInterval(this.timer);tracker.save();},onUnload(){clearInterval(this.timer);tracker.save();},
  update(){
    const stats=tracker.stats(),points=tracker.points;
    const patch={running:Boolean(tracker.activity),recovered:Boolean(tracker.activity&&tracker.activity.recovered),distance:(stats.distance/1000).toFixed(2),elapsed:time(stats.elapsed),closure:Math.round(stats.closure),pointCount:points.length};
    if(points.length){const last=geo.wgsToGcj(points[points.length-1]);patch.center={latitude:last.lat,longitude:last.lng};patch.polyline=[{points:points.map(p=>{const gcj=geo.wgsToGcj(p);return{latitude:gcj.lat,longitude:gcj.lng};}),color:'#6c8f38',width:5,dottedLine:false}];}
    this.setData(patch);
  },
  shareChange(event){this.setData({share:event.detail.value});},
  async start(){this.setData({busy:true,error:''});try{await tracker.start(this.data.share,this.invite);this.update();}catch(error){this.setData({error:error.message||error.errMsg||'定位未获授权或后台定位未开通，请检查微信权限。'});}finally{this.setData({busy:false});}},
  async finish(acceptFallback){this.setData({busy:true,error:''});try{const report=await tracker.finish(acceptFallback===true);delete report.changes;report.displayDistance=(report.distance/1000).toFixed(2);report.displayDuration=time(report.duration);this.setData({report,running:false});}catch(error){
    if(error.code==='INVITE_UNAVAILABLE')wx.showModal({title:'暂时无法与朋友同池',content:error.message,confirmText:'普通匹配',success:result=>{if(result.confirm)this.finish(true);}});
    else this.setData({error:error.message});
  }finally{this.setData({busy:false});}},
  cancel(){
    wx.showModal({
      title:'放弃这一圈？',content:'本次未结算轨迹将被丢弃，领地不会改变。',
      success:async result=>{
        if(!result.confirm)return;
        this.setData({busy:true});
        try{await tracker.cancel();this.update();this.setData({polyline:[],error:''});}
        catch(error){this.setData({error:error.message});}
        finally{this.setData({busy:false});}
      },
    });
  },
  goHome(){wx.navigateBack({delta:1});},
  agreePrivacy(event){getApp().agreePrivacy(event);this.setData({privacyRequired:false});},
  rejectPrivacy(){const resolve=getApp().globalData.privacyResolve;if(resolve)resolve({event:'disagree'});getApp().globalData.privacyResolve=null;this.setData({privacyRequired:false});},
});
