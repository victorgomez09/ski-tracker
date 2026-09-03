import { useMemo } from 'react';
import { TrackPoint } from 'tracking/database';
import { getDistanceFromLatLonInKm } from '../map/tracking-map-layers';

export interface LiveStats {
    currentSpeed: number; // km/h
    maxSpeed: number; // km/h
    avgSpeed: number; // km/h
    altitude: number; // meters
    distance: number; // km
    duration: number; // seconds
    elevationGain: number; // meters (D+)
    elevationLoss: number; // meters (D-)
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

export const formatPaceFromMinPerKm = (minPerKm: number): string => {
    if (!minPerKm || minPerKm <= 0 || !isFinite(minPerKm)) return "--'--\"";
    const mins = Math.floor(minPerKm);
    const secs = Math.floor((minPerKm - mins) * 60);
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
        let gain = 0;
        let loss = 0;

        // Elevation hysteresis tracking (2.0m threshold)
        if (trackPoints.length >= 2) {
            let refAlt = trackPoints[0].alt;
            let currentTrend = 0; // 0: undecided, 1: climbing, -1: descending
            let localExtremum = refAlt;

            for (let i = 1; i < trackPoints.length; i++) {
                const prev = trackPoints[i - 1];
                const curr = trackPoints[i];

                totalDistance += getDistanceFromLatLonInKm(prev.lat, prev.lon, curr.lat, curr.lon);
                if (curr.speed > maxSpeed) {
                    maxSpeed = curr.speed;
                }

                const alt = curr.alt;
                if (currentTrend === 0) {
                    if (Math.abs(alt - refAlt) >= 2.0) {
                        if (alt > refAlt) {
                            currentTrend = 1;
                            gain += alt - refAlt;
                        } else {
                            currentTrend = -1;
                            loss += refAlt - alt;
                        }
                        localExtremum = alt;
                    }
                } else if (currentTrend === 1) {
                    if (alt > localExtremum) {
                        gain += alt - localExtremum;
                        localExtremum = alt;
                    } else if (localExtremum - alt >= 2.0) {
                        currentTrend = -1;
                        loss += localExtremum - alt;
                        localExtremum = alt;
                    }
                } else if (currentTrend === -1) {
                    if (alt < localExtremum) {
                        loss += localExtremum - alt;
                        localExtremum = alt;
                    } else if (alt - localExtremum >= 2.0) {
                        currentTrend = 1;
                        gain += alt - localExtremum;
                        localExtremum = alt;
                    }
                }
            }
        }

        const currentSpeedKmh = latest ? latest.speed * 3.6 : 0;
        const maxSpeedKmh = maxSpeed * 3.6;
        const avgSpeedKmh = elapsedSeconds > 0 ? (totalDistance / (elapsedSeconds / 3600)) : 0;

        return {
            currentSpeed: currentSpeedKmh,
            maxSpeed: maxSpeedKmh,
            avgSpeed: avgSpeedKmh,
            altitude: latest ? latest.alt : 0,
            distance: totalDistance,
            duration: elapsedSeconds,
            elevationGain: gain,
            elevationLoss: loss,
            currentPaceMinutesPerKm: currentSpeedKmh > 0.5 ? 60 / currentSpeedKmh : undefined,
        };
    }, [isTracking, trackPoints, elapsedSeconds]);
};
