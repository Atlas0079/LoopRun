module.exports = {
  expo: {
    name: '圈界内测', slug: 'looprun', scheme: 'looprun', version: '0.5.0',
    platforms: ['android'], orientation: 'portrait',
    android: { package: 'com.looprun.android', versionCode: 5, allowBackup: false,
      blockedPermissions:['android.permission.READ_EXTERNAL_STORAGE','android.permission.WRITE_EXTERNAL_STORAGE','android.permission.SYSTEM_ALERT_WINDOW','android.permission.RECORD_AUDIO','android.permission.READ_MEDIA_IMAGES','android.permission.READ_MEDIA_VIDEO','android.permission.ACCESS_BACKGROUND_LOCATION'],
    },
    plugins: ['expo-router', './plugins/withLoopRun'],
    experiments: { typedRoutes: true },
  },
};
