export type ActivityType = 'ski' | 'snowboard' | 'walk' | 'hike' | 'bike' | 'car' | 'general';

export interface ActivityConfig {
    type: ActivityType;
    labelKey: string;
    defaultLabel: string;
    icon: string;
    speedUnit: 'km/h' | 'min/km';
    requiresResort: boolean;
    gpsTimeInterval: number; // in milliseconds
    gpsDistanceInterval: number; // in meters
}

export const ACTIVITY_CONFIGS: Record<ActivityType, ActivityConfig> = {
    ski: {
        type: 'ski',
        labelKey: 'activity_ski',
        defaultLabel: 'Esquí',
        icon: '⛷️',
        speedUnit: 'km/h',
        requiresResort: true,
        gpsTimeInterval: 3000,
        gpsDistanceInterval: 0,
    },
    snowboard: {
        type: 'snowboard',
        labelKey: 'activity_snowboard',
        defaultLabel: 'Snowboard',
        icon: '🏂',
        speedUnit: 'km/h',
        requiresResort: true,
        gpsTimeInterval: 3000,
        gpsDistanceInterval: 0,
    },
    walk: {
        type: 'walk',
        labelKey: 'activity_walk',
        defaultLabel: 'Paseo',
        icon: '🚶',
        speedUnit: 'min/km',
        requiresResort: false,
        gpsTimeInterval: 5000,
        gpsDistanceInterval: 5,
    },
    hike: {
        type: 'hike',
        labelKey: 'activity_hike',
        defaultLabel: 'Senderismo',
        icon: '🥾',
        speedUnit: 'min/km',
        requiresResort: false,
        gpsTimeInterval: 5000,
        gpsDistanceInterval: 5,
    },
    bike: {
        type: 'bike',
        labelKey: 'activity_bike',
        defaultLabel: 'Ciclismo',
        icon: '🚴',
        speedUnit: 'km/h',
        requiresResort: false,
        gpsTimeInterval: 3000,
        gpsDistanceInterval: 3,
    },
    car: {
        type: 'car',
        labelKey: 'activity_car',
        defaultLabel: 'Coche / Viaje',
        icon: '🚗',
        speedUnit: 'km/h',
        requiresResort: false,
        gpsTimeInterval: 2000,
        gpsDistanceInterval: 10,
    },
    general: {
        type: 'general',
        labelKey: 'activity_general',
        defaultLabel: 'Actividad libre',
        icon: '📍',
        speedUnit: 'km/h',
        requiresResort: false,
        gpsTimeInterval: 4000,
        gpsDistanceInterval: 5,
    },
};
