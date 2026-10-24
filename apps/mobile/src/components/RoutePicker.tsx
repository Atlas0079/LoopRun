import {useState} from 'react';
import {Pressable,Text,View} from 'react-native';
import type {DeveloperRoute} from '../state/AppProvider';
import {Button,km,styles} from './ui';

export function RoutePicker({routes,value,onChange}:{routes:DeveloperRoute[];value:string;onChange:(id:string)=>void}){
  const [expanded,setExpanded]=useState(false),selected=routes.find(r=>r.id===value)||routes[0];
  return <View style={styles.card}><Text style={styles.heading}>{selected?.name||'正在读取路线'}{selected?' · '+km(selected.distance)+' km':''}</Text><Text style={styles.small}>{selected?.description}</Text><Button title={expanded?'收起路线':'更换路线'} secondary onPress={()=>setExpanded(!expanded)}/>{expanded&&<View accessibilityRole="radiogroup">{routes.map(route=><Pressable key={route.id} accessibilityRole="radio" accessibilityLabel={route.name} accessibilityState={{checked:route.id===selected?.id}} onPress={()=>{onChange(route.id);setExpanded(false);}} style={styles.listRow}><Text style={styles.subheading}>{route.id===selected?.id?'● ':'○ '}{route.name} · {km(route.distance)} km</Text></Pressable>)}</View>}</View>;
}
