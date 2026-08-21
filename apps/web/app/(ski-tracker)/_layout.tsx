import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';

import BottomTabs from 'components/navigation/bottom-tabs';
import { API_BASE_URL } from 'constants/constants';
import { useAuth } from 'context/auth.context';
import { useVersionCheck } from 'hooks/use-version.hook';
import { UpdateModal } from 'components/updates/update-modal';

export default function RootLayout() {
  const { token, isLoading } = useAuth();
  const { t } = useTranslation();
  // const { downloadingOta, updateInfo, modalVisible, dismissModal, applyUpdate } = useVersionCheck(API_BASE_URL);

  // if (downloadingOta) {
  //   return (
  //     <View className="flex-1 justify-center items-center bg-slate-900">
  //       <ActivityIndicator size="large" color="#3b82f6" />
  //       <Text className="mt-3 text-slate-300">{t("downloading_update")}</Text>
  //     </View>
  //   );
  // }

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

  // if (updateInfo?.forceUpdate) {
  //   return (
  //     <UpdateModal
  //       forceUpdate
  //       latestVersion={updateInfo.latestVersion}
  //       changelog={updateInfo.changelog}
  //       onUpdate={applyUpdate}
  //       onDismiss={() => {}}
  //     />
  //   );
  // }

  return (
    <>
      <Tabs tabBar={(props) => <BottomTabs {...props} />} screenOptions={{ headerShown: false }}>
        <Tabs.Screen
          name="map"
          options={{
            title: t('map'),
            tabBarIcon: ({ color }) => <Ionicons name="map" size={16} color={color} />
          }}
        />
        <Tabs.Screen
          name="tracking"
          options={{
            title: t('tracking'),
            tabBarIcon: ({ color }) => <Ionicons name="navigate-outline" size={16} color={color} />
          }}
        />
        <Tabs.Screen
          name="resorts"
          options={{
            title: t('resorts'),
            tabBarIcon: ({ color }) => <Ionicons name="snow-outline" size={16} color={color} />
          }}
        />
        <Tabs.Screen
          name="community"
          options={{
            title: t('community'),
            tabBarIcon: ({ color }) => <Ionicons name="people-outline" size={16} color={color} />
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: t('profile'),
            tabBarIcon: ({ color }) => <Ionicons name="person-outline" size={16} color={color} />
          }}
        />
      </Tabs>

      {/* {(updateInfo && modalVisible) && (
        <UpdateModal
          forceUpdate={updateInfo.forceUpdate}
          latestVersion={updateInfo.latestVersion}
          changelog={updateInfo.changelog}
          onUpdate={applyUpdate}
          onDismiss={dismissModal}
        />
      )} */}
    </>
  );
}