export interface GeoJSONLine {
    type: string;
    coordinates: [number, number, number][];
}

export interface Piste {
    ID: string;
    Difficulty: string;
    Name: string;
    GeometryGeoJSON: GeoJSONLine;
    Tags: any;
    PisteType: 'downhill' | 'cross_country' | 'freeride' | 'freestyle' | 'sledding' | 'snowpark' | 'touring';
}

export interface Lift {
    ID: string;
    Name: string;
    LiftType: string;
    Capacity: number;
    CapacityHourly: number;
    GeometryGeoJSON: GeoJSONLine;
    Tags: any;
}

export interface Area {
    ID: string;
    Name?: string;
    GeometryGeoJSON: {
        type: "Polygon";
        coordinates: [number, number][][];
    };
    Type: 'beginner_area' | 'off_piste' | 'building';
}

export interface ResortDetail {
    ID: string;
    Name: string;
    Latitude: number;
    Longitude: number;
    pistes: Piste[];
    lifts?: Lift[];
    areas?: Area[];
    statistics: {
        maxElevation: number;
        minElevation: number;
    };
}

export interface PisteTextDecoratorProps {
    positions: [number, number][];
    text: string;
    color: string;
    isLift?: boolean;
}