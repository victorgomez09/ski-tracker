import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import BottomTabs from 'components/navigation/bottom-tabs';
import { useAuth } from 'context/auth.context';

export default function RootLayout() {
  const { token, isLoading } = useAuth();

  if (isLoading) {
    return (
      <span className="loading loading-spinner loading-md"></span>
    );
  }

  if (!token) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs tabBar={(props) => <BottomTabs {...props} />} screenOptions={{headerShown: false}}>
      <Tabs.Screen 
        name="map" 
        options={{ 
          title: 'Map', 
          tabBarIcon: ({ color }) => <Ionicons name="map" size={16} color={color} /> 
        }} 
      />
      <Tabs.Screen 
        name="tracking" 
        options={{ 
          title: 'Tracking', 
          tabBarIcon: ({ color }) => <Ionicons name="navigate-outline" size={16} color={color} />
        }} 
      />
      <Tabs.Screen 
        name="resorts" 
        options={{ 
          title: 'Resorts', 
          tabBarIcon: ({ color }) => <Ionicons name="snow-outline" size={16} color={color} />
        }} 
      />
      <Tabs.Screen 
        name="profile" 
        options={{ 
          title: 'Profile', 
          tabBarIcon: ({ color }) => <Ionicons name="person-outline" size={16} color={color} />
        }} 
      />
    </Tabs>
  );
}