const geo = require('./geo');
const tracker = {
  activity: null, points: [], lastLiveAt: 0, listening: false,
  restore() {
    if (this.activity) return;
    const cached = wx.getStorageSync('looprun_activity');
    if (cached && cached.id) { this.activity = { ...cached, recovered: true }; this.points = cached.points || []; }
  },
  save() {
    if (this.activity) wx.setStorageSync('looprun_activity', { ...this.activity, points: this.points });
  },
  async start(shareLocation, invite) {
    const app = getApp();
    if (wx.requirePrivacyAuthorize) await new Promise((resolve, reject) => wx.requirePrivacyAuthorize({ success: resolve, fail: reject }));
    if (this.activity) throw new Error('请先结算或放弃尚未结束的跑步。');
    // 获取定位权限与后台能力后才建立服务端活动，避免拒绝授权留下幽灵活动。
    const first = await new Promise((resolve, reject) => wx.getLocation({ type: 'wgs84', isHighAccuracy: true, success: resolve, fail: reject }));
    await new Promise((resolve, reject) => wx.startLocationUpdateBackground({ type: 'wgs84', success: resolve, fail: reject }));
    try { this.activity = await app.api('/runs/start', { shareLocation, invite }); }
    catch (error) { wx.stopLocationUpdate({}); throw error; }
    this.activity.shareLocation = shareLocation;
    this.points = [];
    this.receive({ ...first, timestamp: Date.now() });
    this.callback = position => this.receive(position);
    wx.onLocationChange(this.callback);
    this.listening = true;
    this.save();
    return this.activity;
  },
  receive(position) {
    if (!this.activity || !Number.isFinite(position.accuracy) || position.accuracy > 80) return;
    const point = { lat: position.latitude, lng: position.longitude, accuracy: position.accuracy, time: Date.now() };
    if (this.points.length && point.time - this.points[this.points.length-1].time < 1500) return;
    if (this.points.length >= 6000) return;
    this.points.push(point); this.save();
    if (Date.now() - this.lastLiveAt > 4500) {
      this.lastLiveAt = Date.now();
      getApp().api('/live', { activityId: this.activity.id, ...point, share: this.activity.shareLocation }).catch(() => {});
    }
  },
  stats() {
    let length = 0;
    for (let i=1;i<this.points.length;i++) length += geo.distance(this.points[i-1],this.points[i]);
    return { distance: length, elapsed: this.activity ? Date.now()-this.activity.startedAt : 0, closure: this.points.length>1 ? geo.distance(this.points[0],this.points[this.points.length-1]) : 0 };
  },
  stop() {
    if (this.callback) wx.offLocationChange(this.callback);
    wx.stopLocationUpdate({}); this.callback = null; this.listening = false;
  },
  async finish(acceptFallback) {
    const report = await getApp().api(`/runs/${this.activity.id}/finish`, { points: this.points, acceptFallback: Boolean(acceptFallback) });
    this.clear(); return report;
  },
  async cancel() {
    await getApp().api(`/runs/${this.activity.id}/cancel`, {}); this.clear();
  },
  clear() { this.stop(); this.activity=null;this.points=[];wx.removeStorageSync('looprun_activity'); },
};
module.exports = tracker;
