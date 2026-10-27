import {useState} from 'react';
import {Alert,KeyboardAvoidingView,Linking,Pressable,ScrollView,Switch,Text,TextInput,View} from 'react-native';
import {router} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Button,ErrorNotice,styles} from '../components/ui';
import {useApp} from '../state/AppProvider';
export default function Settings(){const app=useApp();return <SettingsForm key={app.demoMode?'local-demo':app.developerMode?'development':'gps'}/>;}
function SettingsForm(){
  const app=useApp(),[base,setBase]=useState(app.connection.server||(app.developerMode?'http://127.0.0.1:4182':'http://127.0.0.1:4180')),[code,setCode]=useState(''),[name,setName]=useState(app.state?.player.name||'跑者');
  function resetDemo(){Alert.alert('重新开始本地演示？','清空本机演示跑步、领地和机器人进度。联机账户与记录保留。',[{text:'取消',style:'cancel'},{text:'重置演示',style:'destructive',onPress:()=>void app.perform(async()=>{await app.resetDemo();router.dismissTo('/');})}]);}
  return <SafeAreaView style={styles.screen}><View style={styles.header}><Pressable onPress={()=>router.back()} style={styles.back}><Text style={styles.backText}>返回地图</Text></Pressable><Text style={styles.heading}>设置</Text></View><KeyboardAvoidingView style={{flex:1}}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <ErrorNotice message={app.error}/>
    <View style={styles.card}><Text style={styles.heading}>本地演示</Text><Text style={styles.text}>{app.demoMode?'已开启。跑步、机器人和结算在这台手机中运行，记录保存在本机。':'无需服务器或邀请码，即可体验预设跑步、机器人和领地结算。'}</Text><Text style={styles.small}>高德底图需要网络。演示使用预设路线，真实 GPS 跑步使用联机模式。</Text>
      {app.demoMode?<><Button title="机器人设置" secondary onPress={()=>router.push('/developer')}/><Button title="重置本地演示" secondary busy={app.busy} onPress={resetDemo}/><Button title="退出本地演示" busy={app.busy} onPress={()=>void app.perform(async()=>{await app.setDemoMode(false);router.dismissTo('/');})}/></>:<Button title="进入本地演示" busy={app.busy} onPress={()=>void app.perform(async()=>{await app.setDemoMode(true);router.dismissTo('/');})}/>}
    </View>
    {!app.demoMode&&<>
    {app.developerMode&&<View style={styles.inline}><Text style={styles.subheading}>开发者模式 · 独立测试环境</Text><Text style={styles.small}>测试账户、领地和模拟记录与普通用户环境分开保存。</Text></View>}
    <Text style={styles.heading}>{app.developerMode?'开发测试账户':'账户连接'}</Text>
    <Text style={styles.text}>连接跑步服务后，使用真实定位记录跑步、结算领地。{app.developerMode?'当前使用独立测试环境，并额外提供模拟跑步与机器人工具。':''}</Text>
    <Text style={styles.subheading}>服务器地址</Text><TextInput accessibilityLabel="服务器地址" autoCapitalize="none" autoCorrect={false} keyboardType="url" style={styles.input} value={base} onChangeText={setBase}/>
    <Text style={styles.small}>远程地址使用 HTTPS。本机地址仅适用于已配置手机连接的内测环境。</Text>
    <Text style={styles.subheading}>昵称</Text><TextInput accessibilityLabel="昵称" style={styles.input} maxLength={12} value={name} onChangeText={setName}/>
    <Text style={styles.subheading}>内测邀请口令</Text><TextInput accessibilityLabel="内测邀请口令" autoCapitalize="none" autoCorrect={false} secureTextEntry style={styles.input} value={code} onChangeText={setCode}/>
    <Text style={styles.small}>首次创建账户时填写，之后使用本机凭据重新连接。清除 App 数据会失去本机账户凭据。</Text>
    <Button title={app.connection.token?'重新连接账户':'连接账户'} busy={app.busy} onPress={()=>void app.perform(async()=>{await app.connect(base,code,name);setCode('');router.dismissTo('/');})}/>
    <View style={styles.card}><View style={[styles.row,{justifyContent:'space-between'}]}><View style={{flex:1}}><Text style={styles.heading}>开发者模式</Text><Text style={styles.small}>{app.developerMode?'已开启，使用独立测试环境':'关闭，使用完整普通用户视角'}</Text></View><Switch accessibilityLabel="开发者模式" value={app.developerMode} disabled={app.busy} onValueChange={enabled=>void app.perform(async()=>{await app.setDeveloperMode(enabled);})}/></View>
      <Text style={styles.small}>切换前需结束或放弃当前活动，并处理本机待上传记录。</Text>
      {app.developerMode&&<Button title="机器人设置" secondary onPress={()=>router.push('/developer')}/>}
    </View>
    </>}
    <View style={styles.card}><Text style={styles.heading}>定位与数据</Text><Text style={styles.text}>{app.demoMode?'本地演示使用预设路线，不启动真实定位。演示数据保存在手机，重置时清除。':'只有开始真实跑步后才记录精确位置，并通过持续通知提示。断网时轨迹先存本机，联网后补传。停止记录后，不再采集位置。'}</Text><Text style={styles.text}>“公开大致位置”默认关闭。原始跑步轨迹仅本人可见。</Text></View>
    <View style={styles.card}><Text style={styles.heading}>地图服务</Text><Text style={styles.text}>高德地图 SDK · 北京高德图强科技有限公司。用于显示底图、轨迹和领地；SDK 处理设备及网络信息、地图视野等。实际跑步仍由本机 GPS 记录。</Text><Pressable accessibilityRole="link" onPress={()=>void Linking.openURL('https://lbs.amap.com/pages/privacy/')}><Text style={styles.link}>查看高德地图隐私政策</Text></Pressable></View><Text style={styles.small}>Android 内测版 0.6.0 · 高德地图</Text>
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
