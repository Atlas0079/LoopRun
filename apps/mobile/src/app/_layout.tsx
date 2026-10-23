import {Stack} from 'expo-router';
import {StatusBar} from 'expo-status-bar';
import {AppProvider} from '../state/AppProvider';
export default function Layout(){return <AppProvider><StatusBar style="dark"/><Stack screenOptions={{headerShown:false}}/></AppProvider>;}
