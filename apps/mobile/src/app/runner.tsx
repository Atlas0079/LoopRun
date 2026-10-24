import {Pressable,ScrollView,Text,View} from 'react-native';
import {router,useLocalSearchParams} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Metric,area,styles} from '../components/ui';
import {useApp} from '../state/AppProvider';
export default function Runner(){
  const {id,profile}=useLocalSearchParams<{id:string;profile:string}>(),app=useApp();
  const sameEnvironment=profile===app.connection.server,member=sameEnvironment?app.state?.pool?.members.find(m=>m.id===id):undefined;
  const displayName=member?.name||'附近跑者',displayColor=member?.color||'#a6adb1';
  return <SafeAreaView style={styles.screen}><View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="返回地图" onPress={()=>router.back()} style={styles.back}><Text style={styles.backText}>返回地图</Text></Pressable><Text style={styles.heading}>跑者详情</Text></View><ScrollView contentContainerStyle={styles.page}>
    <View style={styles.card}><View style={[styles.row,{gap:16}]}><View style={{width:52,height:52,borderRadius:26,backgroundColor:displayColor,alignItems:'center',justifyContent:'center'}}><Text style={{color:'#fff',fontSize:23}}>人</Text></View><View><Text style={styles.heading}>{displayName}</Text><Text style={styles.small}>{member?'同池跑友':'非同池跑者'}</Text></View></View></View>
    {member?<><Text style={styles.heading}>公开领地</Text><View style={[styles.card,styles.row]}><Metric value={area(member.area)} label="领地 / km²"/><Metric value={String(member.ownedCells)} label="占领格数"/></View><Text style={styles.text}>与这位跑者处于同一个匹配池，可以争夺领地。</Text></>:<Text style={styles.text}>仅展示这位跑者主动分享的大致位置。同池后可查看名字和公开领地。</Text>}
    <Text style={styles.small}>地图位置约模糊至 80 米，个人跑步轨迹不公开。</Text>
  </ScrollView></SafeAreaView>;
}
