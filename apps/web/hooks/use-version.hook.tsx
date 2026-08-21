import Constants from 'expo-constants';
import i18n from 'i18n';
import api from 'interceptor/api';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';

export interface VersionInfo {
    latestVersion: string;
    minVersion: string;
    changelog: string[];
    forceUpdate: boolean;
    storeUrl: string;
}

export const useVersionCheck = (apiBaseUrl: string) => {
    const [loading, setLoading] = useState(true);
    const [updateInfo, setUpdateInfo] = useState<VersionInfo | null>(null);
    const [modalVisible, setModalVisible] = useState(false);

    const currentVersion = Constants.expoConfig?.version ?? '1.0.0';
    const platform = Platform.OS; // "ios" o "android"
    const lang = i18n.language?.startsWith('en') ? 'en' : 'es';

    const checkVersion = useCallback(async () => {
        try {
            setLoading(true);

            const url = `${apiBaseUrl}/manifest/check-version?version=${currentVersion}&platform=${platform}&lang=${lang}`;
            const response = await api.get(url);

            if (response.status !== 200) return;

            const data = response.data;

            // Si hay una actualización OTA disponible, dejamos que `useOtaUpdates` se encargue de ella.
            if (data.ota_available) {
                return;
            }

            const versionData: VersionInfo = {
                latestVersion: data.latest_version,
                minVersion: data.min_version,
                changelog: data.changelog ?? [],
                forceUpdate: data.force_update,
                storeUrl: data.store_url,
            };

            // Solo mostramos modal si la actualización requiere descargar una versión nativa (Store / APK)
            if (versionData.forceUpdate || versionData.latestVersion !== currentVersion) {
                setUpdateInfo(versionData);
                setModalVisible(true);
            }
        } catch (error) {
            console.error('Error checking native version:', error);
        } finally {
            setLoading(false);
        }
    }, [apiBaseUrl, currentVersion, platform, lang]);

    const openStore = async () => {
        if (!updateInfo?.storeUrl) return;

        const canOpen = await Linking.canOpenURL(updateInfo.storeUrl);
        if (canOpen) {
            await Linking.openURL(updateInfo.storeUrl);
        } else {
            console.error('Cannot open store URL:', updateInfo.storeUrl);
        }
    };

    useEffect(() => {
        checkVersion();
    }, [checkVersion]);

    return {
        loading,
        updateInfo,
        modalVisible,
        dismissModal: () => setModalVisible(false),
        openStore,
        checkVersion,
    };
};