import {Pressable,ScrollView,Text,View} from 'react-native';
import {router} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {area,styles} from '../components/ui';
import {useApp} from '../state/AppProvider';
export default function Pool(){
  const app=useApp(),pool=app.state?.pool;
  return <SafeAreaView style={styles.screen}><View style={styles.header}><Pressable onPress={()=>router.back()} style={styles.back}><Text style={styles.backText}>返回地图</Text></Pressable><Text style={styles.heading}>同池跑友</Text></View><ScrollView contentContainerStyle={styles.page}>
    {app.developerMode&&<Text style={styles.small}>{app.demoMode?'本地演示 · 独立数据':'开发者模式 · 独立测试环境'}</Text>}
    <Text style={styles.heading}>{pool?pool.name+' · '+pool.members.length+'/6 人':'尚未加入匹配池'}</Text><Text style={styles.text}>{pool?'同池跑友可以争夺领地。颜色与地图上的领地对应。':'完成首次有效闭环后，按路线重叠匹配跑友。'}</Text>
    {[...(pool?.members||[])].sort((a,b)=>b.area-a.area).map((member,index)=><View key={member.id} style={[styles.card,styles.row]}><View style={{width:34,height:34,borderRadius:17,backgroundColor:member.color,alignItems:'center',justifyContent:'center'}}><Text>{index+1}</Text></View><View style={{flex:1}}><Text style={styles.subheading}>{member.name}{member.id===app.state?.player.id?' · 我':''}</Text><Text style={styles.small}>{member.ownedCells} 格</Text></View><Text style={styles.heading}>{area(member.area)} km²</Text></View>)}
  </ScrollView></SafeAreaView>;
}
