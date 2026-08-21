import * as Updates from 'expo-updates';
import i18n from 'i18n';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

export type OtaPhase = 'idle' | 'checking' | 'mandatory' | 'downloading' | 'optional' | 'none';

export interface OtaUpdateInfo {
    forceUpdate: boolean;
    latestVersion: string;
    changelog: string[];
}

const readExtra = (manifest: Updates.Manifest | undefined): Record<string, unknown> => {
    if (!manifest || !('extra' in manifest) || !manifest.extra || typeof manifest.extra !== 'object') {
        return {};
    }
    return manifest.extra as Record<string, unknown>;
};

const changelogForLang = (extra: Record<string, unknown>): string[] => {
    const changelog = extra.changelog;
    if (!changelog || typeof changelog !== 'object') return [];
    const byLang = changelog as Record<string, string[]>;
    const lang = i18n.language?.startsWith('en') ? 'en' : 'es';
    return byLang[lang] ?? byLang.en ?? byLang.es ?? [];
};

export const useOtaUpdates = () => {
    const [phase, setPhase] = useState<OtaPhase>('idle');
    const [updateInfo, setUpdateInfo] = useState<OtaUpdateInfo | null>(null);
    const [optionalModalVisible, setOptionalModalVisible] = useState(false);

    const applyUpdate = useCallback(async () => {
        if (__DEV__ || Platform.OS === 'web' || !Updates.isEnabled) return;
        try {
            setPhase('downloading');
            const result = await Updates.fetchUpdateAsync();
            if (result.isNew) {
                await Updates.reloadAsync();
                return;
            }
            setPhase(updateInfo?.forceUpdate ? 'mandatory' : 'optional');
        } catch (error) {
            console.error('Error applying OTA update:', error);
            setPhase(updateInfo?.forceUpdate ? 'mandatory' : 'optional');
        }
    }, [updateInfo?.forceUpdate]);

    const checkForOta = useCallback(async () => {
        if (__DEV__ || Platform.OS === 'web' || !Updates.isEnabled) {
            setPhase('none');
            return;
        }

        try {
            setPhase('checking');
            const result = await Updates.checkForUpdateAsync();
            if (!result.isAvailable) {
                setPhase('none');
                setUpdateInfo(null);
                return;
            }

            const extra = readExtra(result.manifest);
            const forceUpdate = Boolean(extra.forceUpdate);
            const info: OtaUpdateInfo = {
                forceUpdate,
                latestVersion: typeof extra.version === 'string' && extra.version ? extra.version : Updates.updateId ?? '',
                changelog: changelogForLang(extra),
            };
            setUpdateInfo(info);

            if (forceUpdate) {
                setPhase('mandatory');
                setPhase('downloading');
                const fetched = await Updates.fetchUpdateAsync();
                if (fetched.isNew) {
                    await Updates.reloadAsync();
                    return;
                }
                setPhase('mandatory');
            } else {
                setPhase('optional');
            }
        } catch (error) {
            console.error('Error checking OTA update:', error);
            setPhase('none');
        }
    }, []);

    useEffect(() => {
        checkForOta();
    }, [checkForOta]);

    return {
        phase,
        updateInfo,
        optionalModalVisible,
        hasOptionalUpdate: phase === 'optional',
        isBlocking: phase === 'checking' || phase === 'downloading',
        isDownloading: phase === 'downloading',
        openOptionalModal: () => setOptionalModalVisible(true),
        dismissOptionalModal: () => setOptionalModalVisible(false),
        applyUpdate,
        checkForOta,
    };
};
