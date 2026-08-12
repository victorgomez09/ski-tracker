import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import BottomTabs from 'components/navigation/bottom-tabs';
import { useAuth } from 'context/auth.context';
import { View, ActivityIndicator } from 'react-native';

export default function RootLayout() {
  const { token, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-900">
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
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
        name="community" 
        options={{ 
          title: 'Community', 
          tabBarIcon: ({ color }) => <Ionicons name="people-outline" size={16} color={color} />
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