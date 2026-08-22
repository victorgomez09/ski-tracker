import { LngLatBounds, OfflineManager } from '@maplibre/maplibre-react-native';
import { useCallback, useEffect, useState } from 'react';

export interface OfflinePackInfo {
    name: string;
    bounds: LngLatBounds; // [[southwestLng, southwestLat], [northeastLng, northeastLat]]
    percentage: number;
    completed: boolean;
    sizeBytes?: number;
}

export const useOfflineMaps = (styleURLS: string) => {
    const [packs, setPacks] = useState<OfflinePackInfo[]>([]);
    const [downloadingPack, setDownloadingPack] = useState<string | null>(null);
    const [downloadingProgress, setDownloadingProgress] = useState<number>(0);

    // Get downloaded packs
    const refreshPacks = useCallback(async () => {
        try {
            const offlinePacks = await OfflineManager.getPacks();
            const formattedPacks: OfflinePackInfo[] = offlinePacks.map(pack => ({
                name: pack.metadata.name as string,
                bounds: pack.bounds,
                percentage: 100,
                completed: true,
            }));
            setPacks(formattedPacks);
        } catch (error) {
            console.error('Error refreshing offline packs:', error);
        }
    }, [])

    useEffect(() => {
        refreshPacks();
    }, [refreshPacks]);

    // Download a new pack
    const downloadRegion = async (packName: string, bounds: LngLatBounds, minZoom: number = 10, maxZoom: number = 16) => {
        try {
            setDownloadingPack(packName);
            setDownloadingProgress(0);

            const progressListener = (offlinePack: any, status: any) => {
                const percentage = status.percentage;
                setDownloadingProgress(percentage);

                if (status.state === "complete") {
                    setDownloadingPack(null);
                    setDownloadingProgress(100);
                    refreshPacks();
                }
            };

            const errorListener = (offlinePack: any, error: any) => {
                console.error(`Error downloading offline pack ${offlinePack.id}:`, error);
                setDownloadingPack(null);
            }

            await OfflineManager.createPack({
                mapStyle: styleURLS,
                bounds: bounds,
                minZoom: minZoom,
                maxZoom: maxZoom,
                metadata: { name: packName, styleURLS },
            }, progressListener, errorListener);
        } catch (error) {
            console.error('Error downloading offline pack:', error);
        }
    }

    // Delete a pack
    const deletePack = async (packName: string) => {
        try {
            await OfflineManager.deletePack(packName);
            await refreshPacks();
        } catch (error) {
            console.error(`Error al eliminar la zona ${packName}:`, error);
        }
    };

    return {
        packs,
        downloadingPack,
        downloadingProgress,
        downloadRegion,
        deletePack,
        refreshPacks,
    };
}