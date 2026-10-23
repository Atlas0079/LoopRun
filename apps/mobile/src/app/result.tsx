import {useEffect,useState} from 'react';
import {ScrollView,Text,View} from 'react-native';
import {router,useLocalSearchParams} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Button,ErrorNotice,km,Metric,styles,time} from '../components/ui';
import {useApp,type GeoPoint} from '../state/AppProvider';
import type {Report} from '../../modules/looprun-native';
export default function Result(){
  const {id}=useLocalSearchParams<{id:string}>(),app=useApp(),[report,setReport]=useState<Report|null>(app.snapshot.reportId===id?app.snapshot.report||null:null),[route,setRoute]=useState<GeoPoint[]|null>(null),[error,setError]=useState('');
  const request=app.request;
  useEffect(()=>{let active=true;request<Report&{route:GeoPoint[]}>(`/runs/${id}`).then(r=>{if(active){setReport(r);setRoute(r.route);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[id,request]);
  const changed=report&&(report.claimed+report.fortified+report.weakened)>0;
  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.page}><Text style={styles.title}>{report?(changed?'跑步已结算':'本次领地未变化'):'正在读取结果'}</Text><ErrorNotice message={error}/>{report&&<><Text style={styles.small}>{new Date(report.finishedAt).toLocaleString('zh-CN')} · 实际 GPS</Text><View style={[styles.card,styles.row]}><Metric value={km(report.distance)} label="距离 / km"/><Metric value={time(report.duration)} label="运动时间"/></View><Text style={styles.heading}>领地变化</Text><View style={[styles.card,styles.row]}><Metric value={String(report.claimed)} label="新占 / 格"/><Metric value={String(report.fortified)} label="加固 / 格"/><Metric value={String(report.weakened)} label="削弱 / 格"/></View>{report.neutralized>0&&<Text style={styles.text}>削弱的格子中，{report.neutralized} 格已变为中立，需另一次有效闭环占领。</Text>}{report.alreadyCounted>0&&<Text style={styles.text}>{report.alreadyCounted} 格今天已生效，本次没有重复计算。</Text>}{report.capped>0&&<Text style={styles.text}>{report.capped} 格已经达到加固上限 3。</Text>}<Text style={styles.small}>本次对手伤害 {report.damage} 点。</Text></>}<Button title="返回地图查看" onPress={()=>{app.setHistoryRoute(route);router.replace('/');}}/></ScrollView></SafeAreaView>;
}
