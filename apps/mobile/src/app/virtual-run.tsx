import {useEffect,useState} from 'react';
import {Pressable,ScrollView,Text,View} from 'react-native';
import {router} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Button,ErrorNotice,styles} from '../components/ui';
import {RoutePicker} from '../components/RoutePicker';
import {useApp} from '../state/AppProvider';

export default function VirtualRun(){
  const app=useApp(),[preset,setPreset]=useState('park'),selected=app.routes.find(r=>r.id===preset)||app.routes[0];
  useEffect(()=>{if(!app.developerMode)router.dismissTo('/');},[app.developerMode]);
  if(!app.developerMode)return null;
  return <SafeAreaView style={styles.screen}><View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="返回地图" onPress={()=>router.dismissTo('/')} style={styles.back}><Text style={styles.backText}>返回地图</Text></Pressable><Text style={styles.heading}>虚拟跑步</Text></View><ScrollView contentContainerStyle={styles.page}><ErrorNotice message={app.error}/><Text style={styles.text}>假装自己完成所选闭环。约 14 秒播放后，通过正常采样上传与结算接口提交，记录标记为开发模拟，不开启 GPS。</Text>{!app.connection.token?<Button title="连接测试账户" onPress={()=>router.push('/settings')}/>:<><RoutePicker routes={app.routes} value={preset} onChange={setPreset}/><Button title="预览这条路线" secondary disabled={!selected} onPress={()=>{app.previewRoute(selected);router.dismissTo('/');}}/><Button title="虚拟跑完这一圈" disabled={!selected||Boolean(app.snapshot.run||app.state?.activeActivity)} busy={app.busy} onPress={()=>void app.perform(async()=>{await app.startSimulation(selected.id);router.dismissTo('/');})}/></>}</ScrollView></SafeAreaView>;
}
