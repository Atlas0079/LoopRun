import {spawnSync} from 'node:child_process';
import {mkdirSync,existsSync,readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),mobile=join(root,'apps/mobile');
const credentialsDir=join(root,'.local-credentials');mkdirSync(credentialsDir,{recursive:true,mode:0o700});
const credentialsPath=join(credentialsDir,'android-beta.json'),keystore=join(credentialsDir,'android-beta.jks');
const java=process.env.JAVA_HOME||'/Applications/Android Studio.app/Contents/jbr/Contents/Home';
const sdk=process.env.ANDROID_HOME||join(process.env.HOME,'Library/Android/sdk');
if(!existsSync(join(java,'bin/java'))||!existsSync(sdk))throw new Error('请先配置 JAVA_HOME 和 ANDROID_HOME。');
if(!existsSync(credentialsPath))writeFileSync(credentialsPath,JSON.stringify({password:randomBytes(30).toString('base64url')}),{mode:0o600});
const {password}=JSON.parse(readFileSync(credentialsPath,'utf8'));
const env={...process.env,JAVA_HOME:java,ANDROID_HOME:sdk,ANDROID_SDK_ROOT:sdk,LOOPRUN_KEYSTORE:keystore,LOOPRUN_STORE_PASSWORD:password,PATH:join(java,'bin')+':'+process.env.PATH};
function run(command,args,cwd=mobile){const result=spawnSync(command,args,{cwd,env,stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
if(!existsSync(keystore))run(join(java,'bin/keytool'),['-genkeypair','-keystore',keystore,'-storetype','PKCS12','-alias','looprun-beta','-keyalg','RSA','-keysize','3072','-validity','3650','-storepass:env','LOOPRUN_STORE_PASSWORD','-keypass:env','LOOPRUN_STORE_PASSWORD','-dname','CN=LoopRun Android Beta'],root);
const prebuildInputs=['app.config.js','plugins/withLoopRun.js','package-lock.json','modules/looprun-native/expo-module.config.json'];
const fingerprint=createHash('sha256');for(const file of prebuildInputs)fingerprint.update(readFileSync(join(mobile,file)));
const expected=fingerprint.digest('hex'),stamp=join(root,'.local-runtime/android-prebuild.hash');mkdirSync(dirname(stamp),{recursive:true});
if(!existsSync(join(mobile,'android/gradlew'))||!existsSync(stamp)||readFileSync(stamp,'utf8')!==expected){
  run('npx',['expo','prebuild','--platform','android','--no-install']);writeFileSync(stamp,expected);
}
writeFileSync(join(mobile,'android/local.properties'),`sdk.dir=${sdk}\n`);
run('./gradlew',[':app:assembleRelease','--no-daemon','--max-workers=4','-PreactNativeArchitectures=arm64-v8a'],join(mobile,'android'));
const artifacts=join(root,'artifacts');mkdirSync(artifacts,{recursive:true});
const output=join(artifacts,'LoopRun-0.3.0-android-arm64.apk');copyFileSync(join(mobile,'android/app/build/outputs/apk/release/app-release.apk'),output);
const sha256=createHash('sha256').update(readFileSync(output)).digest('hex');writeFileSync(output+'.sha256',sha256+'\n');
console.log(`Android beta APK: ${output}\nSHA-256: ${sha256}`);
