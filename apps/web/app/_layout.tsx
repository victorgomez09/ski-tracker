import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import BottomTabs from 'components/navigation/bottom-tabs';

export default function RootLayout() {
  return (
    <Tabs tabBar={(props) => <BottomTabs {...props} />}>
      <Tabs.Screen 
        name="index" 
        options={{ 
          title: 'Mapa', 
          tabBarIcon: ({ color }) => <Ionicons name="map" size={16} color={color} /> 
        }} 
      />
      <Tabs.Screen 
        name="resorts" 
        options={{ 
          title: 'Estaciones', 
          tabBarIcon: ({ color }) => <Ionicons name="snow" size={16} color={color} /> 
        }} 
      />
    </Tabs>
  );
}