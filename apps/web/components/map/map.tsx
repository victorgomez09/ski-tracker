import axios from 'axios';
import { router } from 'expo-router';
import { useLocalSearchParams } from 'expo-router/build/hooks';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Map, { Layer, LayerProps, MapRef, Marker, NavigationControl, Source, ViewStateChangeEvent } from 'react-map-gl/maplibre';

import { API_BASE_URL } from 'constants/constants';
import { useAuth } from 'context/auth.context';
import { Lift, Piste, ResortDetail } from 'models/ski-resort.model';
import { MapDetailPanel } from './map-detail-panel';

export default function InteractiveSkiMap() {
    const searchParams = useLocalSearchParams();
    const mapRef = useRef<MapRef>(null);
    const [resorts, setResorts] = useState<ResortDetail[]>([]);
    const [hoveredResortId, setHoveredResortId] = useState<string | null>(null);
    const [selectedFeature, setSelectedFeature] = useState<Piste | Lift | null>(null);
    const [hoveredFeatureId, setHoveredFeatureId] = useState<string | null>(null);
    const [viewState, setViewState] = useState({
        longitude: parseFloat(searchParams.lon as string || '-3.971953'),
        latitude: parseFloat(searchParams.lat as string || '40.797891'),
        zoom: parseInt(searchParams.zoom as string || '13'),
        bearing: 0,
        pitch: 0
    });
    const { token } = useAuth();

    useEffect(() => {
        const loadInitial = async () => {
            if (Number(searchParams.zoom) < 10) {
                try {
                    const request = await axios.get<ResortDetail[]>(`${API_BASE_URL}/resorts/bbox`, {
                        params: {
                            minLon: searchParams.minLon,
                            minLat: searchParams.minLat,
                            maxLon: searchParams.maxLon,
                            maxLat: searchParams.maxLat
                        },
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    });
                    if (request.status !== 200) {
                        throw new Error(`HTTP error! status: ${request.status}`);
                    }
                    setResorts(request.data);
                } catch (error) {
                    console.error("Error fetching resorts:", error);
                }
            } else {
                try {
                    const lat = parseFloat(searchParams.lat as string || '40.797891');
                    const lon = parseFloat(searchParams.lon as string || '-3.971953');

                    const request = await axios.get<ResortDetail[]>(`${API_BASE_URL}/resorts/nearby`, {
                        params: {
                            lat: lat,
                            lon: lon,
                            radius: 50
                        },
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    });
                    if (request.status !== 200) {
                        throw new Error(`HTTP error! status: ${request.status}`);
                    }
                    setResorts(request.data);
                } catch (error) {
                    console.error("Error fetching resorts:", error);
                }
            }
        }

        loadInitial();
    }, []);

    // --- Layer styles ---
    const pisteLineStyle: LayerProps = {
        id: 'piste-lines',
        type: 'line',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
            'line-color': [
                'match', ['get', 'difficulty'],
                'novice', '#00e676',
                'easy', '#2979ff',
                'intermediate', '#ff1744',
                'advanced', '#212121',
                '#9e9e9e'
            ],
            // if selected or hovered, increase width
            'line-width': [
                'case',
                ['==', ['get', 'id'], selectedFeature?.ID || ''], 9,
                ['==', ['get', 'id'], hoveredFeatureId || ''], 8,
                5
            ]
        }
    };

    const pisteLabelStyle: LayerProps = {
        id: 'piste-labels',
        type: 'symbol',
        minzoom: 13,
        layout: {
            'text-field': ['get', 'name'],
            'text-size': 12,
            'symbol-placement': 'line',
            'text-allow-overlap': false
        },
        paint: {
            'text-color': '#d35400',
            'text-halo-color': '#ffffff',
            'text-halo-width': 2
        }
    };

    const pisteDirectionStyle: LayerProps = {
        id: 'piste-directions',
        type: 'symbol',
        minzoom: 14,
        layout: {
            'symbol-placement': 'line',
            'symbol-spacing': 150,
            'text-field': '>',
            'text-size': 12,
            'text-rotation-alignment': 'map',
            'text-keep-upright': false,
            'text-allow-overlap': false,
            'text-ignore-placement': false
        },
        paint: {
            'text-color': [
                'match', ['get', 'difficulty'],
                'novice', '#00e676',
                'easy', '#2979ff',
                'intermediate', '#ff1744',
                'advanced', '#212121',
                '#9e9e9e'
            ],
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5
        }
    }

    const liftLabelStyle: LayerProps = {
        id: 'lift-labels',
        type: 'symbol',
        minzoom: 15,
        layout: {
            'text-field': ['get', 'name'],
            'text-size': 12,
            'symbol-placement': 'line',
            'text-allow-overlap': false
        },
        paint: {
            'text-color': '#d35400',
            'text-halo-color': '#ffffff',
            'text-halo-width': 2
        }
    };

    const liftLineStyle: LayerProps = {
        id: 'lift-lines',
        type: 'line',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
            'line-color': '#8e44ad',
            'line-width': [
                'case',
                ['==', ['get', 'id'], selectedFeature?.ID || ''], 6,
                ['==', ['get', 'id'], hoveredFeatureId || ''], 5,
                3
            ],
            'line-dasharray': [2, 2]
        }
    };

    // --- Data transformation ---
    const pistesGeoJSON = useMemo(() => {
        const pistesFeatures = resorts.flatMap(r => {
            if (!r.pistes || !Array.isArray(r.pistes)) return [];

            return r.pistes
                .filter(p => {
                    const geomType = p.GeometryGeoJSON?.type;
                    return geomType && geomType !== 'Polygon' && geomType !== 'MultiPolygon';
                })
                .map(p => ({
                    type: 'Feature' as const,
                    properties: {
                        id: p.ID,
                        difficulty: p.Difficulty,
                        name: p.Name || `Piste #${p.ID.slice(0, 4)}`,
                        resortName: r.Name
                    },
                    geometry: p.GeometryGeoJSON
                }));
        });
        return { type: 'FeatureCollection' as const, features: pistesFeatures };
    }, [resorts]);

    const liftsGeoJSON = useMemo(() => {
        const liftsFeatures = resorts.flatMap(r => {
            if (!r.lifts || !Array.isArray(r.lifts)) return [];

            return r.lifts
                .filter(l => {
                    const geomType = l.GeometryGeoJSON?.type;
                    return geomType && geomType !== 'Polygon' && geomType !== 'MultiPolygon';
                })
                .map(l => ({
                    type: 'Feature' as const,
                    properties: {
                        id: l.ID,
                        type: l.LiftType, // Ej: chairlift, gondola, ski_lift, etc.
                        name: l.Name || `Lift #${l.ID.slice(0, 4)}`,
                        resortName: r.Name
                    },
                    geometry: l.GeometryGeoJSON
                }));
        });
        return { type: 'FeatureCollection' as const, features: liftsFeatures };
    }, [resorts]);

    // --- Fetchers ---
    const fetchResortsByBounds = async (bounds: maplibregl.LngLatBounds) => {
        try {
            const sw = bounds.getSouthWest();
            const ne = bounds.getNorthEast();

            const request = await axios.get<ResortDetail[]>(`${API_BASE_URL}/resorts/bbox`, {
                params: {
                    minLon: sw.lng,
                    minLat: sw.lat,
                    maxLon: ne.lng,
                    maxLat: ne.lat
                },
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            if (request.status !== 200) {
                throw new Error(`HTTP error! status: ${request.status}`);
            }
            setResorts(request.data);
        } catch (error) {
            console.error("Error fetching resorts:", error);
        }
    };

    const fetchResortsWithDetails = async (event: ViewStateChangeEvent) => {
        const map = event.target;
        const center = map.getCenter();
        const currentZoom = map.getZoom();

        if (currentZoom > 10) {
            try {
                const lat = center.lat;
                const lon = center.lng;

                const request = await axios.get<ResortDetail[]>(`${API_BASE_URL}/resorts/nearby`, {
                    params: {
                        lat: lat,
                        lon: lon,
                        radius: 50
                    },
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                });
                if (request.status !== 200) {
                    throw new Error(`HTTP error! status: ${request.status}`);
                }
                setResorts(request.data);
            } catch (error) {
                console.error("Error fetching resorts:", error);
            }
        }

        router.setParams({ zoom: currentZoom.toFixed(0) })
    };

    // --- Handler when the user finishes moving/zooming the map ---
    const handleMouseMove = (event: any) => {
        const map = event.target;

        if (!map.isStyleLoaded() || viewState.zoom < 10) return;

        try {
            const features = map.queryRenderedFeatures(event.point, {
                layers: ['piste-lines', 'lift-lines']
            });

            if (features.length > 0) {
                map.getCanvas().style.cursor = 'pointer';
                setHoveredFeatureId(features[0].properties.id);
            } else {
                map.getCanvas().style.cursor = '';
                setHoveredFeatureId(null);
            }
        } catch (error) {
            // Ignore
        }
    };

    const handleMouseLeave = (event: any) => {
        event.target.getCanvas().style.cursor = '';
        setHoveredFeatureId(null);
    };

    // --- Handler for clicks on map lines ---
    const handleMapClick = (event: any) => {
        const map = event.target;
        if (!map.isStyleLoaded() || viewState.zoom < 10) return;

        try {
            const features = map.queryRenderedFeatures(event.point, {
                layers: ['piste-lines', 'lift-lines']
            });

            if (!features.length) return;

            const clickedFeature = features[0];
            const featureId = clickedFeature.properties.id;
            const isLift = clickedFeature.layer.id === 'lift-lines';

            for (const resort of resorts) {
                if (isLift && resort.lifts) {
                    const foundLift = resort.lifts.find(l => l.ID === featureId);
                    if (foundLift) {
                        setSelectedFeature(foundLift);
                        return;
                    }
                } else if (!isLift && resort.pistes) {
                    const foundPiste = resort.pistes.find(p => p.ID === featureId);
                    if (foundPiste) {
                        setSelectedFeature(foundPiste);
                        return;
                    }
                }
            }
        } catch (error) {
            console.error("Error querying features on click:", error);
        }
    };

    const handleMoveEnd = useCallback(() => {
        const map = mapRef.current?.getMap();
        if (!map) return;

        const bounds = map.getBounds();
        const center = map.getCenter();
        const currentZoom = map.getZoom();

        if (center && typeof center.lng === 'number' && typeof center.lat === 'number' && typeof currentZoom === 'number') {
            const sw = bounds.getSouthWest();
            const ne = bounds.getNorthEast();
            router.setParams({
                minLon: sw.lng,
                minLat: sw.lat,
                maxLon: ne.lng,
                maxLat: ne.lat,
                lon: center.lng.toFixed(4),
                lat: center.lat.toFixed(4),
                zoom: currentZoom.toFixed(0)
            });

            if (currentZoom < 10) {
                fetchResortsByBounds(bounds);
            } else {
                fetchResortsWithDetails({ target: map } as ViewStateChangeEvent);
            }
        }
    }, []);

    return (
        <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - 2.5rem)' }}>
            {/* Pistes and lifts details panel */}
            {selectedFeature && (
                <MapDetailPanel
                    data={selectedFeature}
                    onClose={() => setSelectedFeature(null)}
                />
            )}
            <Map
                ref={mapRef}
                {...viewState}
                onMove={evt => setViewState(evt.viewState)}
                onMouseMove={handleMouseMove}
                onMoveEnd={handleMoveEnd}
                onMouseLeave={handleMouseLeave}
                onClick={handleMapClick}
                onZoomEnd={fetchResortsWithDetails}
                interactiveLayerIds={['piste-lines', 'lift-lines']}
                style={{ width: '100%', height: 'calc(100vh - 4rem)' }}
                mapStyle="https://tiles.openfreemap.org/styles/liberty"
                mapLib={maplibregl}
            >
                <NavigationControl position="bottom-right" />

                {/* Pistes Layer */}
                {viewState.zoom >= 10 && (
                    <Source id="pistes-source" type="geojson" data={pistesGeoJSON}>
                        <Layer {...pisteLineStyle} />
                        <Layer {...pisteLabelStyle} />
                    </Source>
                )}

                {/* Resort markers */}
                {viewState.zoom < 10 && resorts.map(resort => (
                    <Marker
                        key={resort.ID}
                        longitude={resort.Longitude}
                        latitude={resort.Latitude}
                        anchor="bottom"
                        onClick={() => {
                            console.log("Estación seleccionada:", resort.Name);
                            setViewState(prev => ({
                                ...prev,
                                longitude: resort.Longitude,
                                latitude: resort.Latitude,
                                zoom: 12
                            }));
                        }}
                    >
                        <div
                            className="resort-marker-container"
                            style={{ cursor: 'pointer', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                            onMouseEnter={() => setHoveredResortId(resort.ID)}
                            onMouseLeave={() => setHoveredResortId(null)}
                        >
                            {hoveredResortId === resort.ID && (
                                <div style={{
                                    backgroundColor: 'white',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontWeight: 'bold',
                                    color: '#333',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                                    marginBottom: '4px',
                                    whiteSpace: 'nowrap',
                                    zIndex: 10
                                }}>
                                    {resort.Name}
                                </div>
                            )}

                            <div className="resort-marker-dot" style={{
                                background: '#e67e22',
                                width: 12,
                                height: 12,
                                borderRadius: '50%',
                                border: '2px solid white',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                                transition: 'transform 0.2s',
                                transform: hoveredResortId === resort.ID ? 'scale(1.2)' : 'scale(1)'
                            }}></div>
                        </div>
                    </Marker>
                ))}

                {/* 2. Zoom >= 10: Render pistes in detail and also the central or resort marker */}
                {viewState.zoom >= 10 && (
                    <>
                        <Source id="pistes-source" type="geojson" data={pistesGeoJSON}>
                            <Layer {...pisteLineStyle} />
                            <Layer {...pisteLabelStyle} />
                            <Layer {...pisteDirectionStyle} />
                        </Source>

                        <Source id="lifts-source" type="geojson" data={liftsGeoJSON}>
                            <Layer {...liftLineStyle} />
                            <Layer {...liftLabelStyle} />
                        </Source>

                        {/* Optional: Show resort marker with pistes and lifts */}
                        {/* {resorts.map(resort => (
                        <Marker
                            key={`label-${resort.ID}`}
                            longitude={resort.Longitude}
                            latitude={resort.Latitude}
                            anchor="top"
                        >
                            <div style={{
                                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 'bold',
                                color: '#2c3e50',
                                boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                                pointerEvents: 'none'
                            }}>
                                ⛷️ {resort.Name}
                            </div>
                        </Marker>
                    ))} */}
                    </>
                )}
            </Map>
        </div>
    );
}