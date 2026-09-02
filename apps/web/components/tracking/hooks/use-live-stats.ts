import { useMemo } from 'react';
import { TrackPoint } from 'tracking/database';
import { getDistanceFromLatLonInKm } from '../map/tracking-map-layers';

export interface LiveStats {
    currentSpeed: number; // km/h
    maxSpeed: number; // km/h
    altitude: number; // meters
    distance: number; // km
    duration: number; // seconds
    currentPaceMinutesPerKm?: number; // min/km for walk/hike
}

export const formatDuration = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
        return `${h}h ${m}m`;
    }
    return `${m}m ${s}s`;
};

export const formatPace = (speedKmh: number): string => {
    if (!speedKmh || speedKmh < 0.5) return "--'--\"";
    const minutesPerKm = 60 / speedKmh;
    const mins = Math.floor(minutesPerKm);
    const secs = Math.floor((minutesPerKm - mins) * 60);
    return `${mins}'${secs < 10 ? '0' : ''}${secs}"/km`;
};

export const useLiveStats = (
    isTracking: boolean,
    trackPoints: TrackPoint[],
    elapsedSeconds: number
): LiveStats | null => {
    return useMemo(() => {
        if (!isTracking) return null;
        const latest = trackPoints.length > 0 ? trackPoints[trackPoints.length - 1] : null;

        let totalDistance = 0;
        let maxSpeed = 0;
        for (let i = 1; i < trackPoints.length; i++) {
            const prev = trackPoints[i - 1];
            const curr = trackPoints[i];
            totalDistance += getDistanceFromLatLonInKm(prev.lat, prev.lon, curr.lat, curr.lon);
            if (curr.speed > maxSpeed) {
                maxSpeed = curr.speed;
            }
        }

        const currentSpeedKmh = latest ? latest.speed * 3.6 : 0;
        const maxSpeedKmh = maxSpeed * 3.6;

        return {
            currentSpeed: currentSpeedKmh,
            maxSpeed: maxSpeedKmh,
            altitude: latest ? latest.alt : 0,
            distance: totalDistance,
            duration: elapsedSeconds,
            currentPaceMinutesPerKm: currentSpeedKmh > 0.5 ? 60 / currentSpeedKmh : undefined,
        };
    }, [isTracking, trackPoints, elapsedSeconds]);
};
