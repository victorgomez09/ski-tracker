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

export interface Resort {
        ID: string;
        Name: string;
        Country: string;
        Website: string;
        Latitude: number;
        Longitude: number;
        Tags: {
            activities: string[];
            id: string;
            name: string;
            places: [
                {
                    iso3166_1Alpha2: string;
                    iso3166_2: string;
                    localized: {
                        en: {
                            country: string;
                            locality: string | null;
                            region: string;
                        }
                    }
                },
                {
                    iso3166_1Alpha2: string;
                    iso3166_2: string;
                    localized: {
                        en: {
                            country: string;
                            locality: string | null;
                            region: string;
                        }
                    }
                }
            ],
            runConvention: string;
            sources: [
                {
                    id: string;
                    type: string;
                }
            ];
            statistics: {
                lifts: {
                    byType: {
                        chair_lift: {
                            combinedElevationChange: number;
                            count: number;
                            lengthInKm: number;
                            maxElevation: number;
                            minElevation: number;
                        },
                        drag_lift: {
                            combinedElevationChange: number;
                            count: number;
                            lengthInKm: number;
                            maxElevation: number;
                            minElevation: number;
                        },
                        magic_carpet: {
                            combinedElevationChange: number;
                            count: number;
                            lengthInKm: number;
                            maxElevation: number;
                            minElevation: number;
                        },
                        rope_tow: {
                            combinedElevationChange: number;
                            count: number;
                            lengthInKm: number;
                            maxElevation: number;
                            minElevation: number;
                        }
                    },
                    maxElevation: number;
                    minElevation: number;
                },
                maxElevation: number;
                minElevation: number;
                runs: {
                    byActivity: {
                        downhill: {
                            byDifficulty: {
                                advanced: {
                                    combinedElevationChange: number;
                                    count: number;
                                    lengthInKm: number;
                                    maxElevation: number;
                                    minElevation: number;
                                    snowfarmingLengthInKm: number;
                                    snowmakingLengthInKm: number;
                                },
                                easy: {
                                    combinedElevationChange: number;
                                    count: number;
                                    lengthInKm: number;
                                    maxElevation: number;
                                    minElevation: number;
                                    snowfarmingLengthInKm: number;
                                    snowmakingLengthInKm: number;
                                },
                                intermediate: {
                                    combinedElevationChange: number;
                                    count: number;
                                    lengthInKm: number;
                                    maxElevation: number;
                                    minElevation: number;
                                    snowfarmingLengthInKm: number;
                                    snowmakingLengthInKm: number;
                                },
                                novice: {
                                    combinedElevationChange: number;
                                    count: number;
                                    lengthInKm: number;
                                    maxElevation: number;
                                    minElevation: number;
                                    snowfarmingLengthInKm: number,
                                    snowmakingLengthInKm: number
                                }
                            }
                        }
                    },
                    maxElevation: number,
                    minElevation: number
                }
            },
            status: string;
            type: string;
            viewportHint: {
                bearing: number;
                center: number[];
                minCameraY: number;
                rotatedHeightMeters: number;
                rotatedWidthMeters: number;
            };
            websites: string[];
            wikidataID: null;
        },
        CreatedAt: string;
        Pistes: Piste[] | null;
        Lifts: Lift[] | null;
        distance_km: number | null;
        total_pistes: number | null;
        total_lifts: number | null;
}

export interface ResortDetail {
    ID: string;
    Name: string;
    Latitude: number;
    Longitude: number;
    Country?: string;
    Website?: string;
    Tags?: any;
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