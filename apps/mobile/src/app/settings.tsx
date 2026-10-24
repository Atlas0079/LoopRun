import {useState} from 'react';
import {KeyboardAvoidingView,Pressable,ScrollView,Switch,Text,TextInput,View} from 'react-native';
import {router} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Button,ErrorNotice,styles} from '../components/ui';
import {useApp} from '../state/AppProvider';
export default function Settings(){const app=useApp();return <SettingsForm key={app.developerMode?'development':'gps'}/>;}
function SettingsForm(){
  const app=useApp(),[base,setBase]=useState(app.connection.server||(app.developerMode?'http://127.0.0.1:4182':'http://127.0.0.1:4180')),[code,setCode]=useState(''),[name,setName]=useState(app.state?.player.name||'跑者');
  return <SafeAreaView style={styles.screen}><View style={styles.header}><Pressable onPress={()=>router.back()} style={styles.back}><Text style={styles.backText}>返回地图</Text></Pressable><Text style={styles.heading}>设置</Text></View><KeyboardAvoidingView style={{flex:1}}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <ErrorNotice message={app.error}/>
    {app.developerMode&&<View style={styles.inline}><Text style={styles.subheading}>开发者模式 · 独立测试环境</Text><Text style={styles.small}>测试账户、领地和模拟记录与普通用户环境分开保存。</Text></View>}
    <Text style={styles.heading}>{app.developerMode?'开发测试账户':'账户连接'}</Text>
    <Text style={styles.text}>{app.developerMode?'连接专用测试服务后，可模拟跑步并控制机器人路线。':'连接跑步服务后，使用真实定位记录跑步、结算领地。'}</Text>
    <Text style={styles.subheading}>服务器地址</Text><TextInput accessibilityLabel="服务器地址" autoCapitalize="none" autoCorrect={false} keyboardType="url" style={styles.input} value={base} onChangeText={setBase}/>
    <Text style={styles.small}>远程地址使用 HTTPS。本机地址仅适用于已配置手机连接的内测环境。</Text>
    <Text style={styles.subheading}>昵称</Text><TextInput accessibilityLabel="昵称" style={styles.input} maxLength={12} value={name} onChangeText={setName}/>
    <Text style={styles.subheading}>内测邀请口令</Text><TextInput accessibilityLabel="内测邀请口令" autoCapitalize="none" autoCorrect={false} secureTextEntry style={styles.input} value={code} onChangeText={setCode}/>
    <Text style={styles.small}>首次创建账户时填写，之后使用本机凭据重新连接。清除 App 数据会失去本机账户凭据。</Text>
    <Button title={app.connection.token?'重新连接账户':'连接账户'} busy={app.busy} onPress={()=>void app.perform(async()=>{await app.connect(base,code,name);setCode('');router.replace('/');})}/>
    <View style={styles.card}><View style={[styles.row,{justifyContent:'space-between'}]}><View style={{flex:1}}><Text style={styles.heading}>开发者模式</Text><Text style={styles.small}>{app.developerMode?'已开启，使用独立测试环境':'关闭，使用完整普通用户视角'}</Text></View><Switch accessibilityLabel="开发者模式" value={app.developerMode} disabled={app.busy} onValueChange={enabled=>void app.perform(async()=>{await app.setDeveloperMode(enabled);})}/></View>
      <Text style={styles.small}>切换前需结束或放弃当前活动，并处理本机待上传记录。</Text>
      {app.developerMode&&<Button title="打开开发工具" secondary onPress={()=>router.push('/developer')}/>}
    </View>
    <View style={styles.card}><Text style={styles.heading}>定位与数据</Text><Text style={styles.text}>只有开始真实跑步后才记录精确位置，并通过持续通知提示。断网时轨迹先存本机，联网后补传。停止记录后，不再采集位置。</Text><Text style={styles.text}>“公开大致位置”默认关闭。原始跑步轨迹仅本人可见。</Text></View>
    <Text style={styles.small}>Android 内测版 0.4.0 · MapLibre / OpenStreetMap</Text>
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
