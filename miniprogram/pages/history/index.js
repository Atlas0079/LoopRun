const geo=require('../../lib/geo');
Page({
  data:{activities:[],error:'',selected:null,polyline:[],center:{latitude:31.2353,longitude:121.4747}},
  onShow(){this.load();},onPullDownRefresh(){this.load().finally(()=>wx.stopPullDownRefresh());},
  async load(){try{const state=await getApp().api('/state');const activities=state.activities.map(a=>({...a,displayDistance:(a.distance/1000).toFixed(2),displayDate:new Date(a.finishedAt+8*3600000).toISOString().slice(0,10)}));this.setData({activities,error:''});}catch(error){this.setData({error:error.message});}},
  async select(event){try{const selected=this.data.activities.find(a=>a.id===event.currentTarget.dataset.id);if(!selected)return;const detail=await getApp().api(`/runs/${selected.id}`);const route=detail.route.map(p=>{const gcj=geo.wgsToGcj(p);return{latitude:gcj.lat,longitude:gcj.lng};});this.setData({selected,center:route[0]||this.data.center,polyline:[{points:route,color:'#8da94f',width:5}]});}catch(error){this.setData({error:error.message});}},
  close(){this.setData({selected:null});},
});
