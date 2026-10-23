import {requireNativeModule} from 'expo-modules-core';
export type Point={seq:number;lat:number;lng:number;time:number;accuracy:number};
export type Report={activityId:string;distance:number;duration:number;claimed:number;fortified:number;weakened:number;neutralized:number;alreadyCounted:number;capped:number;damage:number;finishedAt:number};
export type LocalRun={id:string;started:number;offset_ms:number;status:'recording'|'pending'|'interrupted'|'needs_action'|'cancel_pending';ended?:number;acked:number;distance:number;max_gap:number;error:string;pointCount:number;route:Point[]};
export type Snapshot={run?:LocalRun;report?:Report;reportId?:string};
export type Configuration={server:string;token:string;installSecret:string;privacy:string};
interface NativeApi {
  validateServer(base:string):string;
  configuration():Configuration;acceptPrivacy():Promise<void>;
  configure(base:string,token:string):Promise<void>;
  begin(id:string,started:number,offset:number,share:boolean):Promise<void>;
  stop():Promise<void>;discard():Promise<void>;snapshot():Promise<string>;sync():Promise<string>;
}
export default requireNativeModule<NativeApi>('LoopRunNative');
