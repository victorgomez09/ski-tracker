import Constants from 'expo-constants';
import * as Localization from 'expo-localization';
import * as Updates from 'expo-updates';
import api from 'interceptor/api';
import { useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';

interface VersionInfo {
    latestVersion: string;
    minVersion: string;
    changelog: string[];
    forceUpdate: boolean;
    otaAvailable: boolean;
    storeUrl: string;
}

export const useVersionCheck = (apiBaseUrl: string) => {
    const [loading, setLoading] = useState(true);
    const [updateInfo, setUpdateInfo] = useState<VersionInfo | null>(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [downloadingOta, setDownloadingOta] = useState(false);

    // Get current app version and platform
    const currentVersion = Constants.expoConfig?.version ?? '1.0.0';
    const platform = Platform.OS; // "ios" or "android"

    // Determine the primary locale and set the language for the version check
    const primaryLocale = Localization.getLocales()[0]?.languageCode ?? 'es';
    const lang = primaryLocale === 'en' ? 'en' : 'es';

    const checkVersion = async () => {
        try {
            setLoading(true);

            const url = `${apiBaseUrl}/manifest/check-version?version=${currentVersion}&platform=${platform}&lang=${lang}`;
            const response = await api.get(url);

            if (response.status !== 200) return;

            const data = response.data;

            const versionData: VersionInfo = {
                latestVersion: data.latest_version,
                minVersion: data.min_version,
                changelog: data.changelog ?? [],
                forceUpdate: data.force_update,
                otaAvailable: data.ota_available,
                storeUrl: data.store_url,
            };

            // If OTA update is available and not forced, handle it
            if (versionData.otaAvailable && !versionData.forceUpdate && !__DEV__) {
                await handleOtaUpdate();
            }

            // Show modal if a store update is required or if there are changes to inform
            if (versionData.forceUpdate || versionData.latestVersion !== currentVersion) {
                setUpdateInfo(versionData);
                setModalVisible(true);
            }
        } catch (error) {
            console.error('Error checking version:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleOtaUpdate = async () => {
        try {
            setDownloadingOta(true);
            const update = await Updates.checkForUpdateAsync();
            if (update.isAvailable) {
                await Updates.fetchUpdateAsync();
                await Updates.reloadAsync(); // Restart the app with the new JS bundle
            }
        } catch (e) {
            console.log('Error in OTA update:', e);
        } finally {
            setDownloadingOta(false);
        }
    };

    const openStore = () => {
        if (updateInfo?.storeUrl) {
            Linking.openURL(updateInfo.storeUrl);
        }
    };

    useEffect(() => {
        checkVersion();
    }, []);

    return {
        loading,
        downloadingOta,
        updateInfo,
        modalVisible,
        dismissModal: () => setModalVisible(false),
        openStore,
    };
};