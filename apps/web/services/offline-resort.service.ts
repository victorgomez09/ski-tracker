import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import api from '../interceptor/api';
import { API_BASE_URL } from '../constants/constants';
import { OfflineResortPack, ResortDetail } from '../models/ski-resort.model';

const STORAGE_INDEX_KEY = 'offline_resorts_index';
const STORAGE_PREFIX = 'offline_resort_';

export interface OfflineIndexItem {
    id: string;
    name: string;
    country?: string;
    latitude: number;
    longitude: number;
    bbox: [number, number, number, number];
    downloadedAt: number;
    tilePackName?: string;
    totalPistes: number;
    totalLifts: number;
    totalPois: number;
    sizeBytes?: number;
}

class OfflineResortManager {
    /**
     * Retrieves the index of all downloaded offline resorts.
     */
    async getIndex(): Promise<OfflineIndexItem[]> {
        try {
            const raw = await AsyncStorage.getItem(STORAGE_INDEX_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.error('Error reading offline resorts index:', e);
            return [];
        }
    }

    /**
     * Checks whether a resort is downloaded and available offline.
     */
    async isResortOffline(resortId: string): Promise<boolean> {
        if (!resortId) return false;
        const index = await this.getIndex();
        return index.some((item) => item.id === resortId);
    }

    /**
     * Retrieves a single offline resort by ID.
     */
    async getOfflineResort(resortId: string): Promise<ResortDetail | null> {
        if (!resortId) return null;
        try {
            const raw = await AsyncStorage.getItem(`${STORAGE_PREFIX}${resortId}`);
            if (!raw) return null;
            const pack: OfflineResortPack = JSON.parse(raw);
            return pack?.resort || null;
        } catch (e) {
            console.error(`Error loading offline resort ${resortId}:`, e);
            return null;
        }
    }

    /**
     * Retrieves all downloaded resorts.
     */
    async getAllOfflineResorts(): Promise<ResortDetail[]> {
        const index = await this.getIndex();
        if (index.length === 0) return [];

        const resorts: ResortDetail[] = [];
        for (const item of index) {
            const resort = await this.getOfflineResort(item.id);
            if (resort) {
                resorts.push(resort);
            }
        }
        return resorts;
    }

    /**
     * Retrieves all full offline packs (including metadata and bboxes).
     */
    async getAllOfflinePacks(): Promise<OfflineResortPack[]> {
        const index = await this.getIndex();
        const packs: OfflineResortPack[] = [];

        for (const item of index) {
            try {
                const raw = await AsyncStorage.getItem(`${STORAGE_PREFIX}${item.id}`);
                if (raw) {
                    packs.push(JSON.parse(raw));
                }
            } catch (e) {
                console.error(`Error loading pack ${item.id}:`, e);
            }
        }
        return packs;
    }

    /**
     * Searches downloaded resorts locally by query string.
     */
    async searchOfflineResorts(query: string): Promise<ResortDetail[]> {
        const resorts = await this.getAllOfflineResorts();
        if (!query || query.trim().length === 0) return resorts;

        const q = query.toLowerCase().trim();
        return resorts.filter((r) =>
            r.Name?.toLowerCase().includes(q) ||
            r.Country?.toLowerCase().includes(q)
        );
    }

    /**
     * Finds offline resorts that fall within or intersect a given bounding box.
     */
    async findOfflineResortsInBounds(
        minLon: number,
        minLat: number,
        maxLon: number,
        maxLat: number
    ): Promise<ResortDetail[]> {
        const packs = await this.getAllOfflinePacks();
        return packs
            .filter((p) => {
                const [bMinLon, bMinLat, bMaxLon, bMaxLat] = p.bbox || [
                    p.resort.Longitude - 0.05,
                    p.resort.Latitude - 0.05,
                    p.resort.Longitude + 0.05,
                    p.resort.Latitude + 0.05,
                ];
                // Check AABB intersection
                return (
                    bMinLon <= maxLon &&
                    bMaxLon >= minLon &&
                    bMinLat <= maxLat &&
                    bMaxLat >= minLat
                );
            })
            .map((p) => p.resort);
    }

    /**
     * Saves an offline resort pack and updates the index.
     */
    async saveOfflinePack(pack: OfflineResortPack): Promise<void> {
        if (!pack?.resort?.ID) return;

        try {
            await AsyncStorage.setItem(
                `${STORAGE_PREFIX}${pack.resort.ID}`,
                JSON.stringify(pack)
            );

            const index = await this.getIndex();
            const filtered = index.filter((i) => i.id !== pack.resort.ID);
            const newItem: OfflineIndexItem = {
                id: pack.resort.ID,
                name: pack.resort.Name,
                country: pack.resort.Country,
                latitude: pack.resort.Latitude,
                longitude: pack.resort.Longitude,
                bbox: pack.bbox,
                downloadedAt: pack.downloadedAt,
                tilePackName: pack.tilePackName,
                totalPistes: pack.totalPistes,
                totalLifts: pack.totalLifts,
                totalPois: pack.totalPois,
                sizeBytes: pack.sizeBytes,
            };

            filtered.push(newItem);
            await AsyncStorage.setItem(STORAGE_INDEX_KEY, JSON.stringify(filtered));
        } catch (e) {
            console.error('Error saving offline resort pack:', e);
            throw e;
        }
    }

    /**
     * Deletes an offline resort pack from storage and deletes associated tile packs if any.
     */
    async deleteOfflineResort(resortId: string): Promise<void> {
        try {
            const raw = await AsyncStorage.getItem(`${STORAGE_PREFIX}${resortId}`);
            if (raw) {
                const pack: OfflineResortPack = JSON.parse(raw);
                if (pack.tilePackName && Platform.OS !== 'web') {
                    try {
                        const { OfflineManager } = require('@maplibre/maplibre-react-native');
                        await OfflineManager.deletePack(pack.tilePackName);
                    } catch (err) {
                        console.warn('Could not delete MapLibre tile pack:', err);
                    }
                }
            }

            await AsyncStorage.removeItem(`${STORAGE_PREFIX}${resortId}`);
            const index = await this.getIndex();
            const filtered = index.filter((i) => i.id !== resortId);
            await AsyncStorage.setItem(STORAGE_INDEX_KEY, JSON.stringify(filtered));
        } catch (e) {
            console.error(`Error deleting offline resort ${resortId}:`, e);
            throw e;
        }
    }

    /**
     * Downloads the complete offline package for a resort from backend API,
     * including vector/raster map tiles via MapLibre OfflineManager on native.
     */
    async downloadFullResortPack(
        resortId: string,
        mapStyleUrl: string,
        onProgress?: (progressPct: number) => void
    ): Promise<OfflineResortPack> {
        onProgress?.(5);

        // 1. Fetch complete data pack from API
        const res = await api.get(`${API_BASE_URL}/resorts/by-id/${resortId}/offline-pack`);
        if (res.status !== 200 || !res.data) {
            throw new Error(`Failed to fetch offline pack for resort ${resortId}`);
        }

        onProgress?.(35);
        const data = res.data;
        const resortDetail: ResortDetail = {
            ID: data.ID || data.id,
            Name: data.Name || data.name,
            Latitude: data.Latitude || data.latitude,
            Longitude: data.Longitude || data.longitude,
            Country: data.Country || data.country,
            Website: data.Website || data.website,
            Tags: data.Tags || data.tags,
            pistes: data.pistes || data.Pistes || [],
            lifts: data.lifts || data.Lifts || [],
            pois: data.pois || data.POIs || [],
            areas: data.areas || data.Areas || [],
            statistics: data.statistics || {
                maxElevation: data.max_elevation || 0,
                minElevation: data.min_elevation || 0,
            },
        };

        const bbox: [number, number, number, number] = data.bbox || [
            resortDetail.Longitude - 0.05,
            resortDetail.Latitude - 0.05,
            resortDetail.Longitude + 0.05,
            resortDetail.Latitude + 0.05,
        ];

        const tilePackName = `resort_${resortDetail.ID}_${Date.now()}`;

        // 2. Download map tiles via MapLibre OfflineManager on Native
        if (Platform.OS !== 'web' && mapStyleUrl) {
            try {
                const { OfflineManager } = require('@maplibre/maplibre-react-native');
                const bounds: [[number, number], [number, number]] = [
                    [bbox[0], bbox[1]], // [minLon, minLat]
                    [bbox[2], bbox[3]], // [maxLon, maxLat]
                ];

                await new Promise<void>((resolve, reject) => {
                    const progressListener = (_pack: any, status: any) => {
                        const pct = 35 + (status.percentage * 0.6);
                        onProgress?.(Math.min(95, Math.round(pct)));
                        if (status.state === 'complete') {
                            resolve();
                        }
                    };

                    const errorListener = (pack: any, err: any) => {
                        console.error('MapLibre OfflineManager tile download error:', err);
                        // Resolve anyway so resort data is saved even if some tiles had warnings
                        resolve();
                    };

                    OfflineManager.createPack(
                        {
                            mapStyle: mapStyleUrl,
                            bounds,
                            minZoom: 10,
                            maxZoom: 16,
                            metadata: {
                                name: tilePackName,
                                resortId: resortDetail.ID,
                                resortName: resortDetail.Name,
                            },
                        },
                        progressListener,
                        errorListener
                    ).catch(reject);
                });
            } catch (err) {
                console.warn('MapLibre offline tile download warning (proceeding with data):', err);
            }
        }

        onProgress?.(98);

        // 3. Assemble and save offline resort pack
        const pack: OfflineResortPack = {
            resort: resortDetail,
            bbox,
            downloadedAt: Date.now(),
            tilePackName,
            version: data.version || '1.0',
            totalPistes: resortDetail.pistes?.length || 0,
            totalLifts: resortDetail.lifts?.length || 0,
            totalPois: resortDetail.pois?.length || 0,
            sizeBytes: JSON.stringify(resortDetail).length,
        };

        await this.saveOfflinePack(pack);
        onProgress?.(100);

        return pack;
    }
}

export const offlineResortService = new OfflineResortManager();
