import {useEffect,useRef,useState} from 'react';
import {Alert,Linking,Pressable,StyleSheet,Switch,Text,View} from 'react-native';
import {router} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import TerritoryMap from '../components/TerritoryMap';
import {Button,ErrorNotice,Metric,area,colors,km,styles,time} from '../components/ui';
import {useApp} from '../state/AppProvider';
import {distance} from '../../../../shared/geo.mjs';

export default function Home(){
  const app=useApp(),run=app.snapshot.run,[share,setShare]=useState(false),active=useRef<string|null>(null),[clock,setClock]=useState(Date.now);
  useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(timer);},[]);
  useEffect(()=>{if(run)active.current=run.id;else if(app.snapshot.reportId&&active.current===app.snapshot.reportId){active.current=null;router.push({pathname:'/result',params:{id:app.snapshot.reportId}});}},[run,app.snapshot.reportId]);
  const last=run?.route.at(-1),closure=run&&run.route.length>1?distance(run.route[0],last!):null;
  const elapsed=run?(run.source==='simulation'?(last?.time||run.started)-run.started:(run.ended||clock+run.offset_ms)-run.started):0;
  const simulationReady=run?.source!=='simulation'||run.pointCount>=(app.state?.activeActivity?.source==='simulation'?app.state.activeActivity.route.length:Infinity);
  const connected=Boolean(app.connection?.token&&app.state);
  function discard(){Alert.alert('放弃本次跑步？','本次轨迹不结算，领地保持不变。',[{text:'继续保留',style:'cancel'},{text:'确认放弃',style:'destructive',onPress:()=>void app.perform(app.discard)}]);}
  return <SafeAreaView style={styles.screen} edges={['top','bottom']}>
    <View style={styles.header}><Text style={styles.title}>圈界</Text><View style={styles.row}>{app.developerMode&&<Pressable onPress={()=>router.push('/developer')}><Text style={styles.link}>开发工具</Text></Pressable>}<Pressable onPress={()=>router.push('/history')}><Text style={styles.link}>记录</Text></Pressable><Pressable onPress={()=>router.push('/settings')}><Text style={styles.link}>{connected?app.state?.player.name:'设置'}</Text></Pressable></View></View>
    {app.developerMode&&<View style={s.historyBanner}><Text style={styles.subheading}>开发者模式 · 独立测试环境</Text></View>}
    <View style={s.summary}><Metric value={app.state?area(app.state.player.area):'—'} label="我的领地 / km²"/><Metric value={app.state?String(app.state.player.ownedCells):'—'} label="占领格数"/><Metric value={app.state?String(app.state.player.fortifiedCells):'—'} label="加固已满"/></View>
    <View style={s.toolbar}><View style={s.modes}>{(['mine','pool'] as const).map(mode=><Pressable key={mode} accessibilityRole="button" accessibilityState={{selected:app.mode===mode}} onPress={()=>app.setMode(mode)} style={[s.mode,app.mode===mode&&s.modeSelected]}><Text style={[s.modeText,app.mode===mode&&{color:colors.green,fontWeight:'600'}]}>{mode==='mine'?'我的领地':'同池争夺'}</Text></Pressable>)}</View><Pressable accessibilityRole="button" accessibilityLabel="查看同池跑友" onPress={()=>router.push('/pool')}><Text style={styles.link}>{app.state?.pool?`${app.state.pool.name} · ${app.state.pool.members.length}/6 人`:'未入池'}</Text></Pressable></View>
    {app.privacy?<TerritoryMap/>:<View style={s.privacy}><Text style={styles.heading}>地图与跑步位置</Text><Text style={styles.text}>地图由北京高德图强科技有限公司的高德地图 SDK 提供，用于显示底图、跑步路线与领地；SDK 会处理设备及网络信息、地图视野等，详见高德隐私政策。开始跑步后使用精确定位，锁屏时继续保存在本机，并上传至你连接的服务器用于结算。原始轨迹仅本人可见，公开附近位置默认关闭。</Text><Pressable accessibilityRole="link" onPress={()=>void Linking.openURL('https://lbs.amap.com/pages/privacy/')}><Text style={styles.link}>高德地图 SDK 隐私政策</Text></Pressable><Button title="了解并查看地图" onPress={()=>void app.perform(app.acceptPrivacy)} busy={app.busy}/></View>}
    <View style={s.legend}><Text style={styles.small}>50 m / 格 · 深色加固更强</Text>{app.state?.map.limited&&<Text style={styles.small}>请放大查看完整格子</Text>}</View>
    {app.historyRoute&&!run&&<Pressable onPress={()=>app.setHistoryRoute(null)} style={s.historyBanner}><Text style={styles.small}>{app.previewLabel?'开发路线预览 · '+app.previewLabel:'私有历史轨迹'} · 点击收起</Text></Pressable>}
    <View style={styles.bottom}>
      <ErrorNotice message={app.error||run?.error}/>
      {run?<>
        <View style={s.panelHeading}><Text style={styles.heading}>{run.source==='simulation'&&run.status==='recording'?(simulationReady?'模拟路线已完成':'模拟跑步中'):({recording:'正在记录跑步',pending:'等待上传与结算',interrupted:'记录已中断',needs_action:'本次活动需要处理',cancel_pending:'等待取消活动'})[run.status]}</Text><Text style={styles.small}>已同步 {run.acked}/{run.pointCount}</Text></View>
        <View style={styles.row}><Metric value={km(run.distance)} label="距离 / km"/><Metric value={time(elapsed)} label="运动时间"/><Metric value={closure===null?'—':String(Math.round(closure))} label="距起点 / m"/></View>
        {run.max_gap>90000&&<Text style={s.warning}>轨迹有超过 90 秒的采样间断，可能无法作为连续闭环结算。</Text>}
        <Text style={styles.small}>{run.source==='simulation'?'仅开发测试：播放完成后按正常采样接口上传并结算，不记录真实定位。':run.status==='recording'?(run.pointCount?'轨迹先保存在本机；结束后检查闭环并结算。':'等待准确定位，请到开阔处并保持系统定位开启。'):'本机轨迹仍保留。上传失败时可重试，已结算活动不会重复计算。'}</Text>
        <View style={styles.row}><Button style={{flex:1}} disabled={run.status==='recording'&&!simulationReady} title={run.status==='recording'?'结束并结算':run.status==='interrupted'?'结束并尝试结算':run.status==='needs_action'?'放弃本次活动':'重试上传'} onPress={()=>{if(run.status==='needs_action'){discard();return;}void app.perform(run.status==='recording'||run.status==='interrupted'?app.stop:app.sync);}} busy={app.busy}/>{run.status!=='needs_action'&&<Pressable accessibilityRole="button" disabled={app.busy} onPress={discard} style={s.discard}><Text style={styles.small}>放弃本次</Text></Pressable>}</View>
      </>:<>
        <View style={s.panelHeading}><Text style={styles.heading}>开始跑步</Text>{connected&&<Text style={styles.small}>下一圈对手伤害 {app.state?.player.damage} 点</Text>}</View>
        {app.state?.player.removedReason&&<Text style={styles.small}>你已离开旧池，下一次有效闭环将重新匹配。</Text>}
        {connected?(app.developerMode?<><Button title="选择模拟跑步路线" disabled={!app.privacy} onPress={()=>router.push('/developer')}/><Text style={styles.small}>模拟跑步与机器人控制仅作用于独立测试环境。</Text></>:<><View style={s.share}><View><Text style={styles.subheading}>公开本次大致位置</Text><Text style={styles.small}>附近跑者可见约 80 米区域</Text></View><Switch value={share} onValueChange={setShare} trackColor={{true:'#438366',false:'#d9e1dc'}}/></View><Button title="开始跑步" disabled={!app.privacy} busy={app.busy} onPress={()=>void app.perform(async()=>{await app.start(share);setShare(false);})}/><Text style={styles.small}>至少 600 米 · 3 分钟 · 回到起点 80 米内形成闭环</Text></>):<><Text style={styles.text}>{app.developerMode?'先连接开发测试服务器，再使用模拟跑步与机器人。':'先连接内测服务器，再开始实际跑步与领地结算。'}</Text><Button title={app.developerMode?'连接开发测试服务器':'连接内测服务器'} onPress={()=>router.push('/settings')}/></>}
      </>}
    </View>
  </SafeAreaView>;
}
const s=StyleSheet.create({summary:{flexDirection:'row',paddingHorizontal:18,paddingVertical:12,backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:colors.line},toolbar:{paddingHorizontal:14,paddingVertical:8,backgroundColor:'#fff',flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:7},modes:{flexDirection:'row',backgroundColor:'#f0f4f1',padding:3,borderRadius:8},mode:{paddingVertical:8,paddingHorizontal:11,borderRadius:6},modeSelected:{backgroundColor:'#fff',elevation:1},modeText:{color:colors.muted,fontSize:12},legend:{backgroundColor:'#fff',paddingHorizontal:15,paddingVertical:5,flexDirection:'row',justifyContent:'space-between'},panelHeading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},share:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},discard:{paddingHorizontal:10,paddingVertical:15},warning:{fontSize:12,lineHeight:18,color:'#967532'},privacy:{flex:1,justifyContent:'center',padding:22,gap:16},historyBanner:{paddingHorizontal:16,paddingVertical:7,backgroundColor:'#edf5ec'}});
