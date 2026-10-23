const config = require('./config');
App({
  globalData: { token: '', config: null, privacyResolve: null },
  onLaunch() {
    this.globalData.token = wx.getStorageSync('looprun_token') || '';
    if (wx.onNeedPrivacyAuthorization) wx.onNeedPrivacyAuthorization(resolve => {
      this.globalData.privacyResolve = resolve;
      const pages = getCurrentPages();
      const page = pages[pages.length - 1];
      if (page) page.setData({ privacyRequired: true });
    });
  },
  api(path, data) {
    return new Promise((resolve, reject) => wx.request({
      url: `${config.apiBase}/api${path}`,
      method: data === undefined ? 'GET' : 'POST',
      header: { 'Content-Type': 'application/json', Authorization: this.globalData.token ? `Bearer ${this.globalData.token}` : '' },
      data,
      timeout: 15000,
      success: response => {
        if (response.statusCode >= 200 && response.statusCode < 300) return resolve(response.data);
        if (response.statusCode === 401) { this.globalData.token = ''; wx.removeStorageSync('looprun_token'); }
        const error = new Error(response.data.error || '服务暂不可用');
        error.code = response.data.code;
        error.status = response.statusCode;
        reject(error);
      },
      fail: () => reject(new Error('无法连接服务，请检查 HTTPS 域名与网络。')),
    }));
  },
  async login() {
    const credentials = await new Promise((resolve, reject) => wx.login({ success: resolve, fail: reject }));
    const result = await this.api('/auth/wechat', { code: credentials.code });
    this.globalData.token = result.token;
    wx.setStorageSync('looprun_token', result.token);
  },
  agreePrivacy(event) {
    const resolve = this.globalData.privacyResolve;
    if (resolve) { resolve({ event: 'agree', buttonId: 'privacyAgree' }); this.globalData.privacyResolve = null; }
  },
});
