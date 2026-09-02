import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { SQLiteDatabase } from 'expo-sqlite';
import { useAuth } from 'context/auth.context';
import { useToast } from 'context/toast.context';
import api from 'interceptor/api';
import { API_BASE_URL } from 'constants/constants';
import { User } from 'models/user.model';
import {
    clearTrack,
    getAllPhotos,
    getAllPoints,
    savePointToLocalDB,
    TrackPoint,
} from 'tracking/database';
import {
    getInitialCurrentLocation,
    startTracking,
    stopTracking,
} from 'tracking/task-manager';

export interface UseTrackingSessionOptions {
    db: SQLiteDatabase;
    resortId?: string;
    activityType?: string;
}

export const useTrackingSession = ({ db, resortId, activityType = 'ski' }: UseTrackingSessionOptions) => {
    const { t } = useTranslation();
    const { user } = useAuth();
    const { showToast } = useToast();

    const [isTracking, setIsTracking] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [hasTrackData, setHasTrackData] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isStartingTracking, setIsStartingTracking] = useState(false);
    const [trackPoints, setTrackPoints] = useState<TrackPoint[]>([]);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [isPublic, setIsPublic] = useState(true);

    const resortIdRef = useRef(resortId);
    resortIdRef.current = resortId;

    // --- Load Points from SQLite ---
    const loadTrackPoints = useCallback(async () => {
        try {
            const points = await getAllPoints(db);
            setTrackPoints(points);
            setHasTrackData(points.length > 0);
        } catch (e) {
            console.error('Error loading track points from SQLite:', e);
        }
    }, [db]);

    // Initial check on mount
    useEffect(() => {
        loadTrackPoints();
    }, [loadTrackPoints]);

    // --- Live Duration Timer ---
    useEffect(() => {
        let timer: any;
        if (isTracking && !isPaused) {
            timer = setInterval(() => {
                setElapsedSeconds((prev) => prev + 1);
            }, 1000);
        }
        return () => {
            if (timer) clearInterval(timer);
        };
    }, [isTracking, isPaused]);

    // --- Periodic Points Refresh during Recording ---
    useEffect(() => {
        let interval: any;
        if (isTracking && !isPaused) {
            interval = setInterval(() => {
                loadTrackPoints();
            }, 5000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isTracking, isPaused, loadTrackPoints]);

    // --- Start / Stop Tracking ---
    const toggleTracking = useCallback(async () => {
        if (isStartingTracking) return;
        setIsStartingTracking(true);

        try {
            if (isTracking) {
                // STOPPING TRACKING
                try {
                    await stopTracking();
                } catch (stopErr) {
                    console.error('Error in stopTracking():', stopErr);
                    showToast(`stopTracking error: ${stopErr instanceof Error ? stopErr.message : String(stopErr)}`, 'error', 15000);
                }

                setIsTracking(false);
                setIsPaused(false);

                let points: TrackPoint[] = [];
                try {
                    points = await getAllPoints(db);
                } catch (dbErr) {
                    console.error('Error in getAllPoints():', dbErr);
                }

                let photos: { id: number; file_uri: string }[] = [];
                try {
                    photos = await getAllPhotos(db);
                } catch (photoErr) {
                    console.error('Error in getAllPhotos():', photoErr);
                }

                setTrackPoints(points);
                const hasData = points.length > 0 || photos.length > 0;
                setHasTrackData(hasData);

                if (hasData) {
                    setShowUploadModal(true);
                } else {
                    showToast(t('no_points_recorded', 'Sesión detenida sin puntos grabados.'), 'info');
                }
            } else {
                // STARTING TRACKING
                await clearTrack(db);
                setTrackPoints([]);
                setHasTrackData(false);
                setElapsedSeconds(0);
                setShowUploadModal(false);

                let trackingTime = user?.time_tracking || 5000;
                try {
                    const cachedTime = await AsyncStorage.getItem('CACHED_TIME_TRACKING');
                    if (cachedTime) {
                        trackingTime = parseInt(cachedTime, 10);
                    }
                } catch (e) {
                    console.warn('Could not load tracking time from cache:', e);
                }

                const currentResortId = resortIdRef.current || '';

                // Record initial point immediately
                const initialLoc = await getInitialCurrentLocation();
                if (initialLoc) {
                    try {
                        await savePointToLocalDB(
                            initialLoc.coords.latitude,
                            initialLoc.coords.longitude,
                            initialLoc.coords.altitude || 0,
                            initialLoc.coords.speed || 0,
                            null,
                            currentResortId || null,
                            initialLoc.timestamp,
                            db
                        );
                        const initPoints = await getAllPoints(db);
                        setTrackPoints(initPoints);
                        setHasTrackData(initPoints.length > 0);
                    } catch (e) {
                        console.error('Error saving initial point:', e);
                    }
                }

                const started = await startTracking(currentResortId, trackingTime);
                if (!started) {
                    showToast(t('tracking_start_permission_denied', 'Permiso de ubicación denegado.'), 'error');
                    return;
                }
                setIsTracking(true);
                setIsPaused(false);
            }
        } catch (err) {
            const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
            console.error('Error toggling tracking:', err);
            if (message.startsWith('FOREGROUND_SERVICE_MISSING')) {
                showToast(t('tracking_start_foreground_service_required', 'Foreground service requerido'), 'error');
            } else {
                showToast(`Error: ${message}`, 'error', 15000);
            }
        } finally {
            setIsStartingTracking(false);
        }
    }, [isStartingTracking, isTracking, db, user?.time_tracking, showToast, t]);

    // --- Pause / Resume Tracking ---
    const togglePause = useCallback(async () => {
        if (!isTracking) return;

        if (isPaused) {
            let trackingTime = user?.time_tracking || 5000;
            try {
                const cachedTime = await AsyncStorage.getItem('CACHED_TIME_TRACKING');
                if (cachedTime) {
                    trackingTime = parseInt(cachedTime, 10);
                }
            } catch (e) {
                console.warn('Could not load tracking time from cache:', e);
            }

            const currentResortId = resortIdRef.current || '';
            try {
                const started = await startTracking(currentResortId, trackingTime);
                if (started) {
                    setIsPaused(false);
                } else {
                    showToast(t('tracking_resume_failed', 'Error al reanudar seguimiento'), 'error');
                }
            } catch {
                showToast(t('tracking_resume_failed', 'Error al reanudar seguimiento'), 'error');
            }
        } else {
            await stopTracking();
            setIsPaused(true);
        }
    }, [isTracking, isPaused, user?.time_tracking, showToast, t]);

    // --- Discard Track ---
    const discardTrack = useCallback(async () => {
        try {
            await clearTrack(db);
            setTrackPoints([]);
            setHasTrackData(false);
            setShowUploadModal(false);
            setElapsedSeconds(0);
            setIsTracking(false);
            showToast(t('track_discarded', 'Sesión descartada.'), 'info');
        } catch (e) {
            console.error('Error discarding track:', e);
        }
    }, [db, showToast, t]);

    // --- Upload Track ---
    const uploadTrack = useCallback(async () => {
        setIsLoading(true);
        try {
            const points = await getAllPoints(db);
            const photos = await getAllPhotos(db);

            if (points.length === 0) {
                showToast(t('no_tracking_data', 'No hay datos de tracking para subir.'), 'info');
                setIsLoading(false);
                setShowUploadModal(false);
                return;
            }

            const formData = new FormData();
            const currentResortId = resortIdRef.current || points[0]?.resort_id || '';

            // 1. Refresh tracking settings if possible
            try {
                const userRequest = await api.get<User>('/users/me');
                if (userRequest.status === 200 && userRequest.data) {
                    const userTrackingTime = userRequest.data.time_tracking || 5000;
                    await AsyncStorage.setItem('CACHED_TIME_TRACKING', userTrackingTime.toString());
                }
            } catch (e) {
                console.warn('Could not fetch user settings during upload:', e);
            }

            const startPayload: any = {
                isPublic: isPublic,
                activityType: activityType,
            };
            if (currentResortId) {
                startPayload.resortId = currentResortId;
            }

            const startResponse = await api.post(`${API_BASE_URL}/ski-sessions`, startPayload);
            if (startResponse.status !== 201) {
                throw new Error('Failed to start session on backend');
            }

            const sessionId = startResponse.data.sessionId;

            photos.forEach((photo, index) => {
                if (photo && photo.file_uri) {
                    formData.append('photos', {
                        uri: photo.file_uri,
                        type: 'image/jpeg',
                        name: `session_photo_${index}.jpg`,
                    } as any);
                }
            });

            // 2. Upload points
            const payload = {
                points: points.map((p) => ({
                    lat: p.lat,
                    lon: p.lon,
                    altitude: p.alt,
                    speed: p.speed,
                    timestamp: new Date(p.timestamp).toISOString(),
                })),
            };

            formData.append('points', JSON.stringify(payload));

            const pointsResponse = await api.post(
                `${API_BASE_URL}/ski-sessions/${sessionId}/points`,
                formData,
                {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                    },
                }
            );

            if (pointsResponse.status !== 200) {
                throw new Error('Failed to upload points');
            }

            // 3. Finish session
            const finishResponse = await api.post(`${API_BASE_URL}/ski-sessions/${sessionId}/finish`, {});

            if (finishResponse.status === 200 || finishResponse.status === 201) {
                showToast(t('track_uploaded_success', 'Sesión subida con éxito.'), 'success');
                await clearTrack(db);
                setTrackPoints([]);
                setHasTrackData(false);
                setIsTracking(false);
                setShowUploadModal(false);
                setElapsedSeconds(0);
            }
        } catch (error) {
            console.error('Error uploading track:', error);
            showToast(t('error_uploading_track', 'Error al subir la sesión.'), 'error');
        } finally {
            setIsLoading(false);
            setIsStartingTracking(false);
        }
    }, [db, isPublic, activityType, showToast, t]);

    return {
        // State
        isTracking,
        isPaused,
        hasTrackData,
        isLoading,
        isStartingTracking,
        trackPoints,
        elapsedSeconds,
        showUploadModal,
        isPublic,
        // Setters
        setShowUploadModal,
        setIsPublic,
        // Actions
        toggleTracking,
        togglePause,
        discardTrack,
        uploadTrack,
        loadTrackPoints,
    };
};
