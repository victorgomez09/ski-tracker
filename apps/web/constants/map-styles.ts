import { ActivityType } from 'models/activity.model';

export type MapStyleId = 'outdoor' | 'satellite' | 'topo' | 'streets' | 'dark';

export interface MapStyleOption {
    id: MapStyleId;
    labelKey: string;
    defaultLabel: string;
    iconName: string;
    descriptionKey: string;
    defaultDescription: string;
    url: string | object;
}

// Satellite tile style object for MapLibre
export const SATELLITE_MAP_STYLE = {
    version: 8,
    sources: {
        'esri-satellite': {
            type: 'raster',
            tiles: [
                'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            ],
            tileSize: 256,
            attribution: 'Esri, Maxar, Earthstar Geographics, CNES/Airbus DS',
            maxzoom: 19,
        },
    },
    layers: [
        {
            id: 'esri-satellite-layer',
            type: 'raster',
            source: 'esri-satellite',
            minzoom: 0,
            maxzoom: 19,
        },
    ],
};

// OpenTopoMap tile style object for MapLibre
export const TOPO_MAP_STYLE = {
    version: 8,
    sources: {
        'opentopomap': {
            type: 'raster',
            tiles: [
                'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
                'https://b.tile.opentopomap.org/{z}/{x}/{y}.png',
                'https://c.tile.opentopomap.org/{z}/{x}/{y}.png',
            ],
            tileSize: 256,
            attribution: '© OpenStreetMap, SRTM | © OpenTopoMap',
            maxzoom: 17,
        },
    },
    layers: [
        {
            id: 'opentopomap-layer',
            type: 'raster',
            source: 'opentopomap',
            minzoom: 0,
            maxzoom: 17,
        },
    ],
};

export const MAP_STYLES: Record<MapStyleId, MapStyleOption> = {
    outdoor: {
        id: 'outdoor',
        labelKey: 'map_style_outdoor',
        defaultLabel: 'Outdoor / Nieve',
        iconName: 'mountain-snow',
        descriptionKey: 'map_style_outdoor_desc',
        defaultDescription: 'Optimizado para pistas de esquí y relieve natural',
        url: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
    },
    topo: {
        id: 'topo',
        labelKey: 'map_style_topo',
        defaultLabel: 'Topográfico',
        iconName: 'footprints',
        descriptionKey: 'map_style_topo_desc',
        defaultDescription: 'Curvas de nivel y senderos para senderismo',
        url: TOPO_MAP_STYLE,
    },
    satellite: {
        id: 'satellite',
        labelKey: 'map_style_satellite',
        defaultLabel: 'Satélite',
        iconName: 'globe',
        descriptionKey: 'map_style_satellite_desc',
        defaultDescription: 'Fotografía aérea y ortofoto de alta resolución',
        url: SATELLITE_MAP_STYLE,
    },
    streets: {
        id: 'streets',
        labelKey: 'map_style_streets',
        defaultLabel: 'Calles / Ciudad',
        iconName: 'map-pin',
        descriptionKey: 'map_style_streets_desc',
        defaultDescription: 'Red vial clara para ciclismo y trayectos urbanos',
        url: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    },
    dark: {
        id: 'dark',
        labelKey: 'map_style_dark',
        defaultLabel: 'Modo Oscuro',
        iconName: 'moon',
        descriptionKey: 'map_style_dark_desc',
        defaultDescription: 'Alto contraste nocturno para viajes en carretera',
        url: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    },
};

export const DEFAULT_STYLE_BY_ACTIVITY: Record<ActivityType, MapStyleId> = {
    ski: 'outdoor',
    snowboard: 'outdoor',
    hike: 'topo',
    walk: 'topo',
    bike: 'streets',
    car: 'streets',
    general: 'outdoor',
};

export const getMapStyleValue = (styleId: MapStyleId): string | object => {
    return MAP_STYLES[styleId]?.url || MAP_STYLES.outdoor.url;
};

export const MAP_STYLE_STORAGE_KEY = 'PREF_MAP_STYLE';
