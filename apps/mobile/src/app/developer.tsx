import {useEffect,useState} from 'react';
import {Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import {router} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {roadPlayback} from '../../../../shared/road-playback.mjs';
import {Button,ErrorNotice,styles} from '../components/ui';
import {RoutePicker} from '../components/RoutePicker';
import {useApp} from '../state/AppProvider';

export default function Developer(){
  const app=useApp(),[preset,setPreset]=useState('park'),[percent,setPercent]=useState('0');
  const selected=app.routes.find(r=>r.id===preset)||app.routes[0],bots=app.state?.developerBots;
  const startPercent=Number(percent),valid=/^\d{1,2}$/.test(percent)&&startPercent<=99;
  const preview=selected&&valid?{...selected,points:roadPlayback(selected,startPercent).points}:null,start=preview?.points[0];
  useEffect(()=>{if(!app.developerMode)router.dismissTo('/');},[app.developerMode]);
  if(!app.developerMode)return null;
  return <SafeAreaView style={styles.screen}><View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="返回地图" onPress={()=>router.dismissTo('/')} style={styles.back}><Text style={styles.backText}>返回地图</Text></Pressable><Text style={styles.heading}>机器人设置</Text></View><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <ErrorNotice message={app.error}/><Text style={styles.text}>{app.demoMode?'本机机器人按真实时间沿道路跑步，使用相同规则结算。离开应用或重启后暂停，可再次启动。':'机器人作为普通用户登录，按真实时间沿道路跑步，逐步上传采样并公开大致位置。只调用普通用户接口，不直接设置领地或匹配池。'}</Text>
    {!app.connection.token||!app.state?<Button title="连接测试账户" onPress={()=>router.push('/settings')}/>:<>
      <RoutePicker routes={app.routes} value={preset} onChange={setPreset}/>
      <Text style={styles.heading}>起跑位置</Text><View style={[styles.row,{flexWrap:'wrap'}]}>{[0,25,50,75].map(p=><Pressable key={p} accessibilityRole="radio" accessibilityLabel={'路线 '+p+'% 位置'} accessibilityState={{checked:startPercent===p}} onPress={()=>setPercent(String(p))} style={styles.link}><Text style={styles.subheading}>{startPercent===p?'● ':'○ '}{p===0?'路线起点':p+'% 位置'}</Text></Pressable>)}</View>
      <TextInput accessibilityLabel="起跑位置百分比" keyboardType="number-pad" maxLength={2} value={percent} onChangeText={setPercent} style={styles.input}/><Text style={styles.small}>可输入 0–99%，选择沿路线的起跑点。不会平移道路或把位置放进建筑。</Text>{start&&<Text style={styles.small}>起跑坐标 {start.lat.toFixed(5)}, {start.lng.toFixed(5)} · 约 {Math.ceil(selected!.distance/2.8/60)} 分钟一圈</Text>}
      <Button title="在地图查看起跑位置与路线" secondary disabled={!preview} onPress={()=>{if(preview){app.previewRoute(preview);router.dismissTo('/');}}}/>
      <Button title="启动 5 位预设跑者" busy={app.busy} disabled={bots?.enabled} onPress={()=>void app.perform(()=>app.controlBots('start'))}/><Button title="暂停所有机器人" secondary busy={app.busy} onPress={()=>void app.perform(()=>app.controlBots('pause'))}/>
      {bots?.players.map(bot=><View key={bot.id} style={styles.card}><Text style={styles.heading}>{bot.name}</Text><Text style={styles.text}>{bot.phase} · {bot.progress}% · {bot.completed}/{bot.total} 圈</Text>{bot.route&&<Text style={styles.small}>{bot.route} · 从 {bot.startPercent}% 位置起跑</Text>}<ErrorNotice message={bot.error||''}/><Button title="查看这位机器人的路线" secondary disabled={!bot.routeId} onPress={()=>{const route=app.routes.find(r=>r.id===bot.routeId);if(route){app.previewRoute({...route,points:roadPlayback(route,bot.startPercent).points});router.dismissTo('/');}}}/><Button title="按选中位置和路线启动" disabled={!valid||!selected||bots.enabled} busy={app.busy} onPress={()=>void app.perform(()=>app.controlBots('run',bot.id,selected.id,startPercent))}/></View>)}
      <Text style={styles.small}>指定路线前先暂停机器人。地图只显示 3 km 内正在分享位置的跑者，位置约模糊至 80 米；非同池显示为“附近跑者”。自动预设每人最多 4 圈。</Text>
    </>}
  </ScrollView></SafeAreaView>;
}
