import { ResortDetail } from 'models/ski-resort.model';
import { TrackPoint } from 'tracking/database';

export const getDistanceFromLatLonInKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

export const orientLineDownhill = (coords: any[]): any[] => {
    if (!coords || coords.length < 2) return coords;
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (first && last && first.length >= 3 && last.length >= 3) {
        const startElev = first[2];
        const endElev = last[2];
        if (typeof startElev === 'number' && typeof endElev === 'number' && endElev > startElev) {
            return [...coords].reverse();
        }
    }
    return coords;
};

export const getOrientedPisteGeometry = (geometry: any): any => {
    if (!geometry || !geometry.coordinates) return null;
    if (geometry.type === 'LineString') {
        return {
            type: 'LineString',
            coordinates: orientLineDownhill(geometry.coordinates)
        };
    } else if (geometry.type === 'MultiLineString') {
        return {
            type: 'MultiLineString',
            coordinates: geometry.coordinates.map((line: any[]) => orientLineDownhill(line))
        };
    }
    return geometry;
};

export const normalizeGeoJSONLine = (geometry: any): any => {
    if (!geometry) return null;
    if (Array.isArray(geometry) && geometry.length > 1 && Array.isArray(geometry[0]) && typeof geometry[0][0] === 'number') {
        return { type: 'LineString', coordinates: geometry };
    }
    if (geometry.coordinates && Array.isArray(geometry.coordinates) && geometry.coordinates.length > 1) {
        return {
            type: geometry.type === 'MultiLineString' ? 'MultiLineString' : 'LineString',
            coordinates: geometry.coordinates
        };
    }
    return null;
};

// --- Map Styles ---

export const getPisteLineStyle = (selectedFeatureId?: string): any => ({
    id: 'piste-lines',
    sourceID: 'pistes-source',
    type: 'line',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
        'line-color': [
            'match', ['get', 'difficulty'],
            'novice', '#81c784',
            'easy', '#90caf9',
            'intermediate', '#ef9a9a',
            'advanced', '#757575',
            '#cccccc'
        ],
        'line-dasharray': [1, 0],
        'line-width': [
            'case',
            ['==', ['get', 'id'], selectedFeatureId || ''], 7,
            5
        ]
    }
});

export const pisteLabelStyle: any = {
    id: 'piste-labels',
    sourceID: 'pistes-source',
    type: 'symbol',
    layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 250,
        'text-field': ['get', 'name'],
        'text-size': 11,
        'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
        'text-letter-spacing': 0.05,
        'text-max-angle': 30,
        'text-keep-upright': false
    },
    paint: {
        'text-color': '#000000',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.5,
        'text-halo-blur': 0.5
    }
};

export const pisteDirectionStyle: any = {
    id: 'piste-direction-arrows',
    sourceID: 'pistes-source',
    type: 'symbol',
    minZoom: 13,
    layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 80,
        'text-field': '▶',
        'text-size': 10,
        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        'text-keep-upright': false,
        'text-allow-overlap': true,
        'text-ignore-placement': true
    },
    paint: {
        'text-color': [
            'match', ['get', 'difficulty'],
            'novice', '#2e7d32',
            'easy', '#1565c0',
            'intermediate', '#c62828',
            'advanced', '#212121',
            '#424242'
        ],
        'text-halo-color': '#ffffff',
        'text-halo-width': 1
    }
};

export const getLiftLineStyle = (selectedFeatureId?: string): any => ({
    id: 'lift-lines',
    sourceID: 'lifts-source',
    type: 'line',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
        'line-color': '#424242',
        'line-dasharray': [2, 2],
        'line-width': [
            'case',
            ['==', ['get', 'id'], selectedFeatureId || ''], 5,
            3
        ]
    }
});

export const liftLabelStyle: any = {
    id: 'lift-labels',
    sourceID: 'lifts-source',
    type: 'symbol',
    layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 300,
        'text-field': ['get', 'name'],
        'text-size': 10,
        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        'text-letter-spacing': 0.05,
        'text-max-angle': 30
    },
    paint: {
        'text-color': '#424242',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.5
    }
};

export const trackLineStyle: any = {
    id: 'user-track-line',
    sourceID: 'track-source',
    type: 'line',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
        'line-color': '#e11d48',
        'line-width': 5,
        'line-opacity': 0.8
    }
};

export const trackDirectionStyle: any = {
    id: 'track-direction-arrow',
    sourceID: 'track-direction-source',
    type: 'symbol',
    layout: {
        'text-field': '▶',
        'text-size': 14,
        'text-rotate': ['get', 'rotation'],
        'text-rotation-alignment': 'map',
        'text-allow-overlap': true,
        'text-ignore-placement': true
    },
    paint: {
        'text-color': '#e11d48',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.5
    }
};

export const chartHoverPointStyle: any = {
    id: 'chart-hover-point-layer',
    type: 'circle',
    style: {
        circleRadius: 8,
        circleColor: 'transparent',
        circleStrokeWidth: 3,
        circleStrokeColor: '#000000',
        circlePitchAlignment: 'map',
    }
};

// --- GeoJSON builders ---

export const buildPistesGeoJSON = (resort?: ResortDetail | null) => {
    if (!resort || !resort.pistes) return { type: 'FeatureCollection' as const, features: [] };
    const features = resort.pistes.map(piste => {
        const baseGeom = normalizeGeoJSONLine(piste.GeometryGeoJSON) || normalizeGeoJSONLine(piste.Waypoints);
        if (!baseGeom) return null;
        const geom = getOrientedPisteGeometry(baseGeom);
        if (!geom) return null;
        return {
            type: 'Feature' as const,
            properties: {
                id: piste.ID,
                resortId: resort.ID,
                name: piste.Name || 'Piste',
                difficulty: piste.Difficulty?.toLowerCase() || 'novice',
                pisteType: piste.PisteType?.toLowerCase() || 'downhill',
                grooming: piste.Grooming?.toLowerCase() || 'classic'
            },
            geometry: geom
        };
    }).filter((f): f is NonNullable<typeof f> => Boolean(f));
    return { type: 'FeatureCollection' as const, features };
};

export const buildLiftsGeoJSON = (resort?: ResortDetail | null) => {
    if (!resort || !resort.lifts) return { type: 'FeatureCollection' as const, features: [] };
    const features = resort.lifts.map(lift => {
        const geometry = normalizeGeoJSONLine(lift.GeometryGeoJSON) || normalizeGeoJSONLine(lift.Waypoints);
        if (!geometry) return null;
        return {
            type: 'Feature' as const,
            properties: {
                id: lift.ID,
                resortId: resort.ID,
                name: lift.Name || 'Lift',
                liftType: lift.LiftType?.toLowerCase() || 'chair_lift'
            },
            geometry
        };
    }).filter((f): f is NonNullable<typeof f> => Boolean(f));
    return { type: 'FeatureCollection' as const, features };
};

export const buildTrackGeoJSON = (trackPoints: TrackPoint[]) => {
    if (trackPoints.length === 0) return { type: 'FeatureCollection' as const, features: [] };
    let coordinates = trackPoints.map(p => [p.lon, p.lat]);
    if (coordinates.length === 1) {
        coordinates = [coordinates[0], coordinates[0]];
    }
    return {
        type: 'FeatureCollection' as const,
        features: [{
            type: 'Feature' as const,
            properties: {},
            geometry: {
                type: 'LineString' as const,
                coordinates
            }
        }]
    };
};

export const buildTrackDirectionGeoJSON = (trackPoints: TrackPoint[]) => {
    if (trackPoints.length < 2) return { type: 'FeatureCollection' as const, features: [] };

    const coordinates = trackPoints.map(p => [p.lon, p.lat]);
    const start = coordinates[0];
    const end = coordinates[coordinates.length - 1];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const rotation = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
    const midpoint: [number, number] = [
        (start[0] + end[0]) / 2,
        (start[1] + end[1]) / 2,
    ];

    return {
        type: 'FeatureCollection' as const,
        features: [{
            type: 'Feature' as const,
            properties: { rotation },
            geometry: {
                type: 'Point' as const,
                coordinates: midpoint,
            }
        }],
    };
};

export const buildChartHoverGeoJSON = (chartHoverPoint: [number, number] | null) => {
    if (!chartHoverPoint) return null;
    return {
        type: 'FeatureCollection' as const,
        features: [{
            type: 'Feature' as const,
            properties: {},
            geometry: {
                type: 'Point' as const,
                coordinates: chartHoverPoint
            }
        }]
    };
};
