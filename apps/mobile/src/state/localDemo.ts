import {LocalDemo} from '../../../../shared/local-demo.mjs';
import catalog from '../../../../server/road-routes.json';
import Native from '../../modules/looprun-native';
let client:LocalDemo|undefined;
export function getLocalDemo(){
  if(!client)client=new LocalDemo({routes:catalog.routes,read:()=>Native.readDemoState(),write:(value:string)=>Native.writeDemoState(value),id:()=>Native.uniqueId()});
  return client;
}
export function configuration(){
  const value=Native.configuration();
  return value.demoMode?{...value,server:'local://demo',token:'local-demo',developerMode:true}:value;
}
