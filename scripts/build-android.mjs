import {spawnSync} from 'node:child_process';
import {mkdirSync,existsSync,readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {resolve,dirname,join,delimiter} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {randomBytes,createHash} from 'node:crypto';
const windows=process.platform==='win32',exe=windows?'.exe':'';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const mobile=join(root,'apps/mobile');
const version=JSON.parse(readFileSync(join(mobile,'package.json'),'utf8')).version;
const architectures=process.argv.find(a=>a.startsWith('--architectures='))?.split('=')[1]||'arm64-v8a';
if(architectures!=='arm64-v8a')throw new Error('高德 3D 地图构建仅支持 arm64-v8a 真机。');
const credentialsDir=join(root,'.local-credentials');mkdirSync(credentialsDir,{recursive:true,mode:0o700});
const mapKeyFile=join(credentialsDir,'amap.json');
const mapKey=process.env.LOOPRUN_AMAP_KEY||(existsSync(mapKeyFile)?JSON.parse(readFileSync(mapKeyFile,'utf8')).androidKey:'');
if(!/^[a-f0-9]{32}$/i.test(mapKey))throw new Error('请配置本地 .local-credentials/amap.json 的 androidKey。');
const credentialsPath=join(credentialsDir,'android-beta.json'),keystore=join(credentialsDir,'android-beta.jks');
const java=process.env.JAVA_HOME||(windows?join(process.env.ProgramFiles||'C:/Program Files','Android/Android Studio/jbr'):process.platform==='darwin'?'/Applications/Android Studio.app/Contents/jbr/Contents/Home':'/usr/lib/jvm/default-java');
const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT||(windows?join(process.env.LOCALAPPDATA||join(homedir(),'AppData/Local'),'Android/Sdk'):join(homedir(),process.platform==='darwin'?'Library/Android/sdk':'Android/Sdk'));
if(!existsSync(join(java,`bin/java${exe}`))||!existsSync(sdk))throw new Error('请先配置 JAVA_HOME 和 ANDROID_HOME。');
if(!existsSync(credentialsPath))writeFileSync(credentialsPath,JSON.stringify({password:randomBytes(30).toString('base64url')}),{mode:0o600});
const {password}=JSON.parse(readFileSync(credentialsPath,'utf8'));
const env={...process.env,JAVA_HOME:java,ANDROID_HOME:sdk,ANDROID_SDK_ROOT:sdk,LOOPRUN_AMAP_KEY:mapKey,LOOPRUN_KEYSTORE:keystore,LOOPRUN_STORE_PASSWORD:password,PATH:join(java,'bin')+delimiter+process.env.PATH};
function run(command,args,cwd=mobile){
  const result=spawnSync(command,args,{cwd,env,stdio:'inherit'});
  if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);
}
if(!existsSync(keystore))run(join(java,`bin/keytool${exe}`),['-genkeypair','-keystore',keystore,'-storetype','PKCS12','-alias','looprun-beta','-keyalg','RSA','-keysize','3072','-validity','3650','-storepass:env','LOOPRUN_STORE_PASSWORD','-keypass:env','LOOPRUN_STORE_PASSWORD','-dname','CN=LoopRun Android Beta'],root);
const prebuildInputs=['app.config.js','plugins/withLoopRun.js','package-lock.json','modules/looprun-native/expo-module.config.json'];
const fingerprint=createHash('sha256');fingerprint.update(root);fingerprint.update(mapKey);for(const file of prebuildInputs)fingerprint.update(readFileSync(join(mobile,file)));
const expected=fingerprint.digest('hex'),stamp=join(root,'.local-runtime/android-prebuild.hash');mkdirSync(dirname(stamp),{recursive:true});
if(!existsSync(join(mobile,'android/gradlew'))||!existsSync(stamp)||readFileSync(stamp,'utf8')!==expected){
  run(process.execPath,[join(mobile,'node_modules/expo/bin/cli'),'prebuild','--platform','android','--no-install']);writeFileSync(stamp,expected);
}
writeFileSync(join(mobile,'android/local.properties'),`sdk.dir=${sdk.replaceAll('\\','/').replaceAll(':','\\:')}\n`);
const gradleArgs=[':app:assembleRelease','--no-daemon','--max-workers=4','-PreactNativeArchitectures='+architectures];
if(windows)run(process.env.ComSpec||'cmd.exe',['/d','/s','/c',`gradlew.bat ${gradleArgs.join(' ')}`],join(mobile,'android'));
else run('./gradlew',gradleArgs,join(mobile,'android'));
const artifacts=join(root,'artifacts');mkdirSync(artifacts,{recursive:true});
const output=join(artifacts,`LoopRun-${version}-android-${architectures==='arm64-v8a'?'arm64':architectures.replaceAll(',','-')}.apk`);copyFileSync(join(mobile,'android/app/build/outputs/apk/release/app-release.apk'),output);
const sha256=createHash('sha256').update(readFileSync(output)).digest('hex');writeFileSync(output+'.sha256',sha256+'\n');
console.log(`Android beta APK: ${output}\nSHA-256: ${sha256}`);
