import {useMemo} from 'react';
import {PanResponder,Pressable,StyleSheet,Text,View} from 'react-native';
import {colors} from './ui';
export function DrawerHandle({edge,open,label,onChange}:{edge:'top'|'bottom';open:boolean;label:string;onChange:(open:boolean)=>void}){
  const pan=useMemo(()=>PanResponder.create({onMoveShouldSetPanResponder:(_,g)=>Math.abs(g.dy)>8&&Math.abs(g.dy)>Math.abs(g.dx),onPanResponderRelease:(_,g)=>{if(Math.abs(g.dy)>20)onChange(edge==='top'?g.dy>0:g.dy<0);}}),[edge,onChange]);
  return <View {...pan.panHandlers}><Pressable accessibilityRole="button" accessibilityLabel={(open?'收起':'展开')+label} accessibilityState={{expanded:open}} onPress={()=>onChange(!open)} style={s.touch}><View style={s.bar}/><Text style={s.label}>{label} {open?'收起':'展开'}</Text></Pressable></View>;
}
const s=StyleSheet.create({touch:{minHeight:40,alignItems:'center',justifyContent:'center',gap:3},bar:{width:32,height:3,borderRadius:3,backgroundColor:'#c1cfc6'},label:{fontSize:11,color:colors.muted}});
