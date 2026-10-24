import {useEffect,useState} from 'react';
import {Pressable,ScrollView,Text,View} from 'react-native';
import {router} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Button,ErrorNotice,colors,km,styles} from '../components/ui';
import {useApp} from '../state/AppProvider';
export default function Developer(){
  const app=useApp(),[preset,setPreset]=useState('park');
  const selected=app.routes.find(r=>r.id===preset)||app.routes[0],bots=app.state?.developerBots;
  useEffect(()=>{if(!app.developerMode)router.replace('/settings');},[app.developerMode]);
  if(!app.developerMode)return null;
  return <SafeAreaView style={styles.screen}><View style={styles.header}><Pressable onPress={()=>router.replace('/')} style={styles.back}><Text style={styles.backText}>返回地图</Text></Pressable><Text style={styles.heading}>开发工具</Text></View><ScrollView contentContainerStyle={styles.page}>
    <View style={styles.inline}><Text style={styles.subheading}>独立测试环境 · 模拟轨迹</Text><Text style={styles.small}>使用正常登录、采样上传与结算规则，不改变真实用户数据。</Text></View><ErrorNotice message={app.error}/>
    {!app.connection.token||!app.state?<><Text style={styles.text}>请先连接开发测试服务器。</Text><Button title="连接开发测试服务" onPress={()=>router.push('/settings')}/></>:<>
      <Text style={styles.heading}>选择跑步路线</Text><Text style={styles.small}>选中的路线可用于自己模拟跑步，也可指定给下方机器人。</Text>
      <View accessibilityRole="radiogroup">{app.routes.map(route=><Pressable accessibilityRole="radio" accessibilityLabel={route.name} accessibilityState={{checked:route.id===selected?.id}} key={route.id} onPress={()=>setPreset(route.id)} style={[styles.listRow,{borderLeftWidth:3,borderLeftColor:route.id===selected?.id?colors.green:'transparent',paddingLeft:12}]}><Text style={styles.subheading}>{route.id===selected?.id?'● ':'○ '}{route.name} · {km(route.distance)} km</Text><Text style={styles.small}>{route.description}</Text></Pressable>)}</View>
      <Button title="在地图预览选中路线" secondary disabled={!selected} onPress={()=>{if(selected){app.previewRoute(selected);router.replace('/');}}}/>
      <Button title="模拟我跑这条路线" disabled={!selected||Boolean(app.snapshot.run||app.state.activeActivity)} busy={app.busy} onPress={()=>void app.perform(async()=>{await app.startSimulation(selected.id);router.replace('/');})}/>
      <Text style={styles.small}>约 14 秒播放完整路线；播放完成后在地图结束并结算。模拟跑步不会开启定位服务。</Text>
      <Text style={styles.heading}>机器人路线测试</Text><Text style={styles.small}>指定某位机器人的路线前，先暂停所有机器人。</Text><Button title="启动 5 位机器人" disabled={bots?.enabled} busy={app.busy} onPress={()=>void app.perform(()=>app.controlBots('start'))}/><Button title="暂停所有机器人" secondary busy={app.busy} onPress={()=>void app.perform(()=>app.controlBots('pause'))}/>
      {bots?.players.map(bot=><View key={bot.id} style={styles.card}><Text style={styles.heading}>{bot.name}</Text><Text style={styles.text}>{bot.phase} · {bot.completed}/{bot.total} 圈{bot.phase==='跑步中'?' · '+bot.progress+'%':''}</Text>{bot.route&&<Text style={styles.small}>当前路线：{bot.route}</Text>}<ErrorNotice message={bot.error||''}/><Button title="预览这位机器人的路线" secondary disabled={!bot.routeId} onPress={()=>{const route=app.routes.find(r=>r.id===bot.routeId);if(route){app.previewRoute(route);router.replace('/');}}}/><Button title="让这位机器人跑选中路线" disabled={!selected||bots.enabled} busy={app.busy} onPress={()=>void app.perform(()=>app.controlBots('run',bot.id,selected.id))}/></View>)}
      <Text style={styles.small}>机器人与普通用户相同，按路线重叠匹配并受每日同格额度约束；不强制同池，不预置领地。自动模式每人跑 4 圈后停止。</Text>
    </>}
  </ScrollView></SafeAreaView>;
}
