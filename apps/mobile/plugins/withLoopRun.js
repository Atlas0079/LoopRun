const {withAndroidManifest,withAppBuildGradle,withDangerousMod,withAndroidStyles} = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');
module.exports = config => {
  config = withAndroidManifest(config,config=>{
    const app=config.modResults.manifest.application[0];
    app.$['android:allowBackup']='false';
    app.$['android:usesCleartextTraffic']='true';
    app.$['android:icon']='@drawable/looprun_icon';
    app.$['android:roundIcon']='@drawable/looprun_icon';
    return config;
  });
  config = withAndroidStyles(config,config=>{
    for(const style of config.modResults.resources.style||[]){
      if(style.$.name==='Theme.App.SplashScreen'){
        style.item=(style.item||[]).filter(item=>!item.$.name.includes('AnimatedIcon'));
        const background=style.item.find(item=>item.$.name==='android:windowBackground');
        if(background)background._='@android:color/white';
      }
    }
    return config;
  });
  config=withDangerousMod(config,['android',async config=>{
    const dir=path.join(config.modRequest.platformProjectRoot,'app/src/main/res/drawable');fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,'looprun_icon.xml'),'<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108"><path android:fillColor="#1E5545" android:pathData="M0,0H108V108H0Z"/><path android:fillColor="#D8F16B" android:pathData="M26,24H82V84H48V50H59V73H71V35H37V84H26Z"/></vector>');
    const res=path.dirname(dir),v31=path.join(res,'values-v31');fs.mkdirSync(v31,{recursive:true});
    fs.writeFileSync(path.join(v31,'styles.xml'),'<resources><style name="Theme.App.SplashScreen" parent="AppTheme"><item name="android:windowBackground">@android:color/white</item><item name="android:windowSplashScreenBackground">@android:color/white</item><item name="android:windowSplashScreenAnimatedIcon">@drawable/looprun_icon</item></style></resources>');
    for(const folder of fs.readdirSync(res))if(/^(mipmap|drawable)/.test(folder)){
      for(const file of fs.readdirSync(path.join(res,folder)))if(/^(ic_launcher.*|splashscreen_logo)\.(png|webp|xml)$/.test(file))fs.rmSync(path.join(res,folder,file));
    }
    return config;
  }]);
  config=withAppBuildGradle(config,config=>{
    config.modResults.contents+='\n// LoopRun internal signing; credentials are supplied only by the local build script.\n'+
      'if (System.getenv("LOOPRUN_KEYSTORE")) {\n'+
      ' android.signingConfigs.create("looprunBeta") { storeFile file(System.getenv("LOOPRUN_KEYSTORE")); storePassword System.getenv("LOOPRUN_STORE_PASSWORD"); keyAlias "looprun-beta"; keyPassword System.getenv("LOOPRUN_STORE_PASSWORD") }\n'+
      ' android.buildTypes.release.signingConfig = android.signingConfigs.looprunBeta\n'+
      '} else if (gradle.startParameter.taskNames.any { it.toLowerCase().contains("release") }) { throw new GradleException("Build the beta APK through scripts/build-android.mjs to supply the private signing key") }\n';
    return config;
  });
  return config;
};
