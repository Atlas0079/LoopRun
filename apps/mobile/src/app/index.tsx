import {useCallback,useEffect,useRef,useState} from 'react';
import {Alert,BackHandler,Linking,Pressable,ScrollView,StyleSheet,Switch,Text,View} from 'react-native';
import {router,useFocusEffect} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {DrawerHandle} from '../components/DrawerHandle';
import TerritoryMap from '../components/TerritoryMap';
import {Button,ErrorNotice,Metric,area,colors,km,styles,time} from '../components/ui';
import {useApp} from '../state/AppProvider';
import {distance} from '../../../../shared/geo.mjs';

export default function Home(){
  const [drawer,setDrawer]=useState<'top'|'bottom'|null>(null);
  const topOpen=drawer==='top',bottomOpen=drawer==='bottom';
  useFocusEffect(useCallback(()=>{const listener=BackHandler.addEventListener('hardwareBackPress',()=>{if(!drawer)return false;setDrawer(null);return true;});return()=>listener.remove();},[drawer]));
  const app=useApp(),run=app.snapshot.run,[share,setShare]=useState(false),active=useRef<string|null>(null),[clock,setClock]=useState(Date.now);
  useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(timer);},[]);
  useEffect(()=>{if(run)active.current=run.id;else if(app.snapshot.reportId&&active.current===app.snapshot.reportId){active.current=null;router.push({pathname:'/result',params:{id:app.snapshot.reportId}});}},[run,app.snapshot.reportId]);
  const last=run?.route.at(-1),closure=run&&run.route.length>1?distance(run.route[0],last!):null;
  const elapsed=run?(run.source==='simulation'?(last?.time||run.started)-run.started:(run.ended||clock+run.offset_ms)-run.started):0;
  const simulationReady=run?.source!=='simulation'||run.pointCount>=(app.state?.activeActivity?.source==='simulation'?app.state.activeActivity.route.length:Infinity);
  const connected=Boolean(app.connection?.token&&app.state);
  function discard(){Alert.alert('放弃本次跑步？','本次轨迹不结算，领地保持不变。',[{text:'继续保留',style:'cancel'},{text:'确认放弃',style:'destructive',onPress:()=>void app.perform(app.discard)}]);}
  return <SafeAreaView style={styles.screen} edges={['top','bottom']}>
    <View style={s.topDrawer}>
      <Pressable accessibilityRole="button" accessibilityLabel={topOpen?'收起顶部抽屉':'展开顶部抽屉'} accessibilityState={{expanded:topOpen}} onPress={()=>setDrawer(topOpen?null:'top')} style={s.compactHeader}><Text style={styles.title}>圈界</Text><Text style={styles.small}>{app.mode==='mine'?'我的领地':'同池争夺'}{app.demoMode?' · 本地演示':app.developerMode?' · 开发模式':''}　{topOpen?'⌃':'⌄'}</Text></Pressable>
      {topOpen&&<ScrollView style={s.topContent}>
    <View style={styles.header}><Text style={styles.title}>领地与跑友</Text><View style={styles.row}><Pressable onPress={()=>router.push('/history')}><Text style={styles.link}>记录</Text></Pressable><Pressable onPress={()=>router.push('/settings')}><Text style={styles.link}>{connected?app.state?.player.name:'设置'}</Text></Pressable></View></View>
    {!app.demoMode&&<View style={s.developerSwitch}><Text style={styles.small}>开发者开关</Text><Switch accessibilityLabel="开发者开关" value={app.developerMode} disabled={app.busy} onValueChange={enabled=>void app.perform(async()=>{await app.setDeveloperMode(enabled);})}/></View>}
    {!app.demoMode&&<Pressable accessibilityRole="button" accessibilityLabel="进入本地演示" onPress={()=>void app.perform(()=>app.setDemoMode(true))}><Text style={styles.link}>进入本地演示</Text></Pressable>}
    {app.developerMode&&<View style={s.historyBanner}><Text style={styles.small}>{app.demoMode?'数据保存在手机':'独立测试环境'}</Text><Pressable accessibilityRole="button" accessibilityLabel="机器人设置" onPress={()=>router.push('/developer')}><Text style={styles.link}>机器人设置</Text></Pressable>{app.demoMode&&<Pressable accessibilityRole="button" accessibilityLabel="演示设置" onPress={()=>router.push('/settings')}><Text style={styles.link}>演示设置</Text></Pressable>}</View>}
    <View style={s.summary}><Metric value={app.state?area(app.state.player.area):'—'} label="我的领地 / km²"/><Metric value={app.state?String(app.state.player.ownedCells):'—'} label="占领格数"/><Metric value={app.state?String(app.state.player.fortifiedCells):'—'} label="加固已满"/></View>
    <View style={s.toolbar}><View style={s.modes}>{(['mine','pool'] as const).map(mode=><Pressable key={mode} accessibilityRole="button" accessibilityState={{selected:app.mode===mode}} onPress={()=>app.setMode(mode)} style={[s.mode,app.mode===mode&&s.modeSelected]}><Text style={[s.modeText,app.mode===mode&&{color:colors.green,fontWeight:'600'}]}>{mode==='mine'?'我的领地':'同池争夺'}</Text></Pressable>)}</View><Pressable accessibilityRole="button" accessibilityLabel="查看同池跑友" onPress={()=>router.push('/pool')}><Text style={styles.link}>{app.state?.pool?`${app.state.pool.name} · ${app.state.pool.members.length}/6 人`:'未入池'}</Text></Pressable></View>
      </ScrollView>}
      <DrawerHandle edge="top" open={topOpen} label="领地与设置" onChange={open=>setDrawer(open?'top':null)}/>
    </View>
    {app.privacy?<TerritoryMap/>:<View style={s.privacy}><Text style={styles.heading}>地图与跑步位置</Text><Text style={styles.text}>地图由北京高德图强科技有限公司的高德地图 SDK 提供，用于显示底图、跑步路线与领地；SDK 会处理设备及网络信息、地图视野等，详见高德隐私政策。{app.demoMode?'本地演示使用预设路线，领地和记录只保存在这台手机，不采集真实跑步位置。':'开始跑步后使用精确定位，锁屏时继续保存在本机，并上传至你连接的服务器用于结算。原始轨迹仅本人可见，公开附近位置默认关闭。'}</Text><Pressable accessibilityRole="link" onPress={()=>void Linking.openURL('https://lbs.amap.com/pages/privacy/')}><Text style={styles.link}>高德地图 SDK 隐私政策</Text></Pressable><Button title="了解并查看地图" onPress={()=>void app.perform(app.acceptPrivacy)} busy={app.busy}/></View>}
    {bottomOpen&&<View style={s.legend}><Text style={styles.small}>50 m / 格 · 深色加固更强</Text>{app.state?.map.limited&&<Text style={styles.small}>请放大查看完整格子</Text>}</View>}
    {app.historyRoute&&!run&&<Pressable onPress={()=>app.setHistoryRoute(null)} style={s.historyBanner}><Text style={styles.small}>{app.previewLabel?(app.demoMode?'演示路线预览 · ':'开发路线预览 · ')+app.previewLabel:'私有历史轨迹'} · 点击收起</Text></Pressable>}
    <View style={s.bottomDrawer}>
      <DrawerHandle edge="bottom" open={bottomOpen} label="跑步面板" onChange={open=>setDrawer(open?'bottom':null)}/>
      <ScrollView style={s.bottomContent} contentContainerStyle={s.panel}>
      <ErrorNotice message={app.error||run?.error}/>
      {run?<>
        {bottomOpen&&<View style={s.panelHeading}><Text style={styles.heading}>{run.source==='simulation'&&run.status==='recording'?(simulationReady?'模拟路线已完成':'模拟跑步中'):({recording:'正在记录跑步',pending:'等待上传与结算',interrupted:'记录已中断',needs_action:'本次活动需要处理',cancel_pending:'等待取消活动'})[run.status]}</Text><Text style={styles.small}>已同步 {run.acked}/{run.pointCount}</Text></View>}
        <View style={styles.row}><Metric value={km(run.distance)} label="距离 / km"/><Metric value={time(elapsed)} label="运动时间"/>{bottomOpen&&<Metric value={closure===null?'—':String(Math.round(closure))} label="距起点 / m"/>}</View>
        {bottomOpen&&run.max_gap>90000&&<Text style={s.warning}>轨迹有超过 90 秒的采样间断，可能无法作为连续闭环结算。</Text>}
        {bottomOpen&&<Text style={styles.small}>{run.source==='simulation'?(app.demoMode?'播放完成后在本机计算领地并保存记录。':'仅开发测试：播放完成后按正常采样接口上传并结算，不记录真实定位。'):run.status==='recording'?(run.pointCount?'轨迹先保存在本机；结束后检查闭环并结算。':'等待准确定位，请到开阔处并保持系统定位开启。'):'本机轨迹仍保留。上传失败时可重试，已结算活动不会重复计算。'}</Text>}
        <View style={styles.row}><Button style={{flex:1}} disabled={run.status==='recording'&&!simulationReady} title={run.status==='recording'?'结束并结算':run.status==='interrupted'?'结束并尝试结算':run.status==='needs_action'?'放弃本次活动':'重试上传'} onPress={()=>{if(run.status==='needs_action'){discard();return;}void app.perform(run.status==='recording'||run.status==='interrupted'?app.stop:app.sync);}} busy={app.busy}/>{bottomOpen&&run.status!=='needs_action'&&<Pressable accessibilityRole="button" disabled={app.busy} onPress={discard} style={s.discard}><Text style={styles.small}>放弃本次</Text></Pressable>}</View>
      </>:<>
        {bottomOpen&&<View style={s.panelHeading}><Text style={styles.heading}>{app.demoMode?'演示跑步':'开始跑步'}</Text>{connected&&<Text style={styles.small}>下一圈对手伤害 {app.state?.player.damage} 点</Text>}</View>}
        {bottomOpen&&app.state?.player.removedReason&&<Text style={styles.small}>你已离开旧池，下一次有效闭环将重新匹配。</Text>}
        {connected?<>{bottomOpen&&!app.demoMode&&<View style={s.share}><View><Text style={styles.subheading}>公开本次大致位置</Text><Text style={styles.small}>附近跑者可见约 80 米区域</Text></View><Switch value={share} onValueChange={setShare} trackColor={{true:'#438366',false:'#d9e1dc'}}/></View>}{app.demoMode?<Button title="演示跑步" disabled={!app.privacy||app.busy} onPress={()=>router.push('/virtual-run')}/>:<View style={styles.row}><Button style={{flex:1}} title="开始跑步" disabled={!app.privacy} busy={app.busy} onPress={()=>void app.perform(async()=>{await app.start(share);setShare(false);})}/>{app.developerMode&&<Button style={{flex:1}} title="虚拟跑步" secondary disabled={!app.privacy||app.busy} onPress={()=>router.push('/virtual-run')}/>}</View>}{bottomOpen&&<Text style={styles.small}>至少 600 米 · 3 分钟 · 回到起点 80 米内形成闭环</Text>}</>:<><Text style={styles.text}>先连接当前环境的账户，再开始跑步与领地结算。</Text><Button title="连接账户" onPress={()=>router.push('/settings')}/><Button title="进入本地演示" secondary busy={app.busy} onPress={()=>void app.perform(()=>app.setDemoMode(true))}/></>}
      </>}
      </ScrollView>
    </View>
  </SafeAreaView>;
}
const s=StyleSheet.create({topDrawer:{backgroundColor:'#fff'},compactHeader:{paddingHorizontal:18,paddingTop:8,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},topContent:{maxHeight:300,flexGrow:0},bottomDrawer:{backgroundColor:'#fff',borderTopLeftRadius:18,borderTopRightRadius:18,borderTopWidth:1,borderColor:colors.line},bottomContent:{maxHeight:350,flexGrow:0},panel:{paddingHorizontal:16,paddingBottom:12,gap:10},developerSwitch:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:18,backgroundColor:'#fff'},summary:{flexDirection:'row',paddingHorizontal:18,paddingVertical:12,backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:colors.line},toolbar:{paddingHorizontal:14,paddingVertical:8,backgroundColor:'#fff',flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:7},modes:{flexDirection:'row',backgroundColor:'#f0f4f1',padding:3,borderRadius:8},mode:{paddingVertical:8,paddingHorizontal:11,borderRadius:6},modeSelected:{backgroundColor:'#fff',elevation:1},modeText:{color:colors.muted,fontSize:12},legend:{backgroundColor:'#fff',paddingHorizontal:15,paddingVertical:5,flexDirection:'row',justifyContent:'space-between'},panelHeading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},share:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},discard:{paddingHorizontal:10,paddingVertical:15},warning:{fontSize:12,lineHeight:18,color:'#967532'},privacy:{flex:1,justifyContent:'center',padding:22,gap:16},historyBanner:{paddingHorizontal:16,paddingVertical:4,backgroundColor:'#edf5ec',flexDirection:'row',justifyContent:'space-between',alignItems:'center'}});
