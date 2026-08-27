import axios from 'axios';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import i18n from 'i18n';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';

import { API_BASE_URL } from 'constants/constants';

export type OtaPhase = 'idle' | 'checking' | 'mandatory' | 'downloading' | 'optional' | 'none';

export interface OtaUpdateInfo {
    forceUpdate: boolean;
    isNative: boolean;
    latestVersion: string;
    changelog: string[];
    downloadUrl?: string;
}

const readExtra = (manifest: Updates.Manifest | undefined): Record<string, unknown> => {
    if (!manifest || !('extra' in manifest) || !manifest.extra || typeof manifest.extra !== 'object') {
        return {};
    }
    return manifest.extra as Record<string, unknown>;
};

const changelogForLang = (changelog: Record<string, string[]> | undefined): string[] => {
    if (!changelog || typeof changelog !== 'object') return [];
    const lang = i18n.language?.startsWith('en') ? 'en' : 'es';
    return changelog[lang] ?? changelog.es ?? changelog.en ?? [];
};

export const useOtaUpdates = () => {
    const [phase, setPhase] = useState<OtaPhase>('idle');
    const [updateInfo, setUpdateInfo] = useState<OtaUpdateInfo | null>(null);
    const [optionalModalVisible, setOptionalModalVisible] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState<number>(0);

    const applyUpdate = useCallback(async () => {
        if (updateInfo?.isNative && updateInfo.downloadUrl) {
            if (Platform.OS === 'android') {
                try {
                    setPhase('downloading');
                    setDownloadProgress(0);

                    // Import legacy FileSystem dynamically / statically
                    const FileSystem = await import('expo-file-system/legacy');
                    const IntentLauncher = await import('expo-intent-launcher');

                    const filename = `app-update-${updateInfo.latestVersion || Date.now()}.apk`;
                    const fileUri = `${FileSystem.documentDirectory}${filename}`;

                    // Check if already downloaded
                    const fileInfo = await FileSystem.getInfoAsync(fileUri);
                    if (fileInfo.exists) {
                        await FileSystem.deleteAsync(fileUri, { idempotent: true });
                    }

                    const downloadResumable = FileSystem.createDownloadResumable(
                        updateInfo.downloadUrl,
                        fileUri,
                        {},
                        (downloadProgressData) => {
                            if (downloadProgressData.totalBytesExpectedToWrite > 0) {
                                const progress =
                                    downloadProgressData.totalBytesWritten /
                                    downloadProgressData.totalBytesExpectedToWrite;
                                setDownloadProgress(Math.min(Math.max(progress, 0), 1));
                            }
                        }
                    );

                    const result = await downloadResumable.downloadAsync();
                    if (!result || !result.uri) {
                        throw new Error('APK download failed: No local URI returned');
                    }

                    setDownloadProgress(1);

                    // Convert to content URI so Android PackageInstaller can read it
                    const contentUri = await FileSystem.getContentUriAsync(result.uri);

                    // Launch PackageInstaller Intent with FLAG_GRANT_READ_URI_PERMISSION (1)
                    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
                        data: contentUri,
                        type: 'application/vnd.android.package-archive',
                        flags: 1,
                    });

                    setPhase('mandatory');
                } catch (err) {
                    console.error('Error downloading/installing native APK:', err);
                    setPhase('mandatory');
                    // Fallback to external browser if internal install fails
                    try {
                        await Linking.openURL(updateInfo.downloadUrl);
                    } catch (linkErr) {
                        console.error('Fallback link open failed:', linkErr);
                    }
                }
                return;
            }

            // Fallback for iOS or other platforms
            try {
                await Linking.openURL(updateInfo.downloadUrl);
            } catch (err) {
                console.error('Error opening native download link:', err);
            }
            return;
        }

        if (__DEV__ || Platform.OS === 'web' || !Updates.isEnabled) return;

        try {
            setPhase('downloading');
            setDownloadProgress(0);
            const result = await Updates.fetchUpdateAsync();
            if (result.isNew) {
                await Updates.reloadAsync();
                return;
            }
            setPhase('optional');
        } catch (error) {
            console.error('Error applying OTA update:', error);
            setPhase('optional');
        }
    }, [updateInfo]);

    const checkForUpdates = useCallback(async () => {
        setPhase('checking');

        // 1. First: Check for Native updates (Always MANDATORY)
        try {
            const currentVersion = Constants.expoConfig?.version || '1.0.0';
            const currentRuntime =
                typeof Updates.runtimeVersion === 'string' && Updates.runtimeVersion
                    ? Updates.runtimeVersion
                    : (Constants.expoConfig?.runtimeVersion as string) || '1.0.0';

            const nativeCheckRes = await axios.get(`${API_BASE_URL}/app/check-update`, {
                params: {
                    platform: Platform.OS,
                    current_version: currentVersion,
                    current_runtime: currentRuntime,
                },
                timeout: 5000,
            });

            if (nativeCheckRes.status === 200 && nativeCheckRes.data?.has_update) {
                const data = nativeCheckRes.data;
                const info: OtaUpdateInfo = {
                    forceUpdate: true, // Native updates are ALWAYS mandatory
                    isNative: true,
                    latestVersion: data.latest_version || currentVersion,
                    changelog: changelogForLang(data.changelog),
                    downloadUrl: data.download_url,
                };
                setUpdateInfo(info);
                setPhase('mandatory');
                return; // Stop here: native update must be installed before any OTA
            }
        } catch (nativeErr) {
            // Ignore offline or 404 errors during native check and continue to OTA check
            console.warn('Native update check skipped or failed:', nativeErr);
        }

        // 2. Second: Check for OTA updates (OPCIONAL)
        if (__DEV__ || Platform.OS === 'web' || !Updates.isEnabled) {
            setPhase('none');
            return;
        }

        try {
            const result = await Updates.checkForUpdateAsync();
            if (!result.isAvailable) {
                setPhase('none');
                setUpdateInfo(null);
                return;
            }

            const extra = readExtra(result.manifest);
            const info: OtaUpdateInfo = {
                forceUpdate: false, // OTA updates are OPTIONAL by default
                isNative: false,
                latestVersion: typeof extra.version === 'string' && extra.version ? extra.version : Updates.updateId ?? '',
                changelog: changelogForLang(extra.changelog as Record<string, string[]> | undefined),
            };

            setUpdateInfo(info);
            setPhase('optional');
            setOptionalModalVisible(true);
        } catch (error) {
            console.error('Error checking OTA update:', error);
            setPhase('none');
        }
    }, []);

    useEffect(() => {
        checkForUpdates();
    }, [checkForUpdates]);

    return {
        phase,
        updateInfo,
        downloadProgress,
        optionalModalVisible,
        hasOptionalUpdate: phase === 'optional',
        isBlocking: phase === 'checking' || phase === 'downloading',
        isDownloading: phase === 'downloading',
        openOptionalModal: () => setOptionalModalVisible(true),
        dismissOptionalModal: () => setOptionalModalVisible(false),
        applyUpdate,
        checkForUpdates,
    };
};