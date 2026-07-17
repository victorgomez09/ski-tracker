import { API_BASE_URL } from 'constants/constants';
import { router } from 'expo-router';
import { useLocalSearchParams } from 'expo-router/build/hooks';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import L from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import { CircleMarker, LayerGroup, LayersControl, MapContainer, Marker, Polygon, Polyline, TileLayer, Tooltip, useMap, useMapEvents, ZoomControl } from 'react-leaflet';

import 'leaflet-polylinedecorator';
import 'leaflet/dist/leaflet.css';

import { Lift, Piste, PisteTextDecoratorProps, ResortDetail } from 'models/ski-resort.model';
import { MapDetailPanel } from './map-detail-panel';
import { ResortDetailPanel } from './resort-detail-panel';

let renderedLabelPoints: { x: number; y: number; text: string }[] = [];

export default function InteractiveSkiMap() {
    const searchParams = useLocalSearchParams();

    const mapRef = useRef(null);
    const lastCenter = useRef({ lat: 0, lng: 0 });
    const [resorts, setResorts] = useState<ResortDetail[]>([]);
    const [activePiste, setActivePiste] = useState<Piste | Lift | null>(null);
    const [activeResort, setActiveResort] = useState<ResortDetail | null>(null);
    const [hoveredPisteID, setHoveredPisteID] = useState<string | null>(null);

    const lat = parseFloat(searchParams.lat as string || '40.797891');
    const lng = parseFloat(searchParams.lng as string || '-3.971953');
    const zoom = parseInt(searchParams.zoom as string || '13');

    const fetchNearbyResorts = async (lat: number, lng: number) => {
        const delta = Math.abs(lat - lastCenter.current.lat) +
            Math.abs(lng - lastCenter.current.lng);

        if (delta < 0.05) return;

        lastCenter.current = { lat, lng };

        try {
            const response = await fetch(`${API_BASE_URL}/resorts/nearby?lat=${lat}&lng=${lng}&radius=20`, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${Platform.OS === 'web' ? localStorage.getItem('jwt_key') || '' : await SecureStore.getItemAsync('jwt_key') || ''}`
                }
            });
            if (!response.ok) throw new Error(`HTTP: ${response.status}`);
            const data: ResortDetail[] = await response.json();
            setResorts(data);
        } catch (error) {
            console.error("Error getting nearby resorts:", error);
        }
    };

    const fetchResortsByBBox = async (minLat: number, maxLat: number, minLon: number, maxLon: number) => {
        try {
            const response = await fetch(`${API_BASE_URL}/resorts/bbox?minLat=${minLat}&maxLat=${maxLat}&minLon=${minLon}&maxLon=${maxLon}`, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${Platform.OS === 'web' ? localStorage.getItem('jwt_key') || '' : await SecureStore.getItemAsync('jwt_key') || ''}`
                }
            });
            if (!response.ok) throw new Error(`HTTP: ${response.status}`);
            const data: ResortDetail[] = await response.json();
            setResorts(data);
        } catch (error) {
            console.error("Error getting resorts by BBOX:", error);
        }
    }

    const pistesNamesRendered = new Set<string>();
    const liftsNamesRendered = new Set<string>();

    const getPisteColor = (difficulty: string) => {
        switch (difficulty.toLowerCase()) {
            case 'novice': return '#00e676';
            case 'easy': return '#2979ff';
            case 'intermediate': return '#ff1744';
            case 'advanced': return '#212121';
            default: return '#9e9e9e';
        }
    };

    type Coord3D = [number, number, number];

    const getDownhillCoords = (coordinates: any): Coord3D[] => {
        if (!coordinates || coordinates.length === 0) return [];

        let flatCoords: Coord3D[];
        if (Array.isArray(coordinates[0]) && typeof coordinates[0][0] !== 'number') {
            flatCoords = coordinates[0];
        } else {
            flatCoords = coordinates;
        }

        if (flatCoords.length < 2) return flatCoords;

        const startAlt = flatCoords[0][2] || 0;
        const endAlt = flatCoords[flatCoords.length - 1][2] || 0;

        return endAlt > startAlt ? [...flatCoords].reverse() : flatCoords;
    };

    const MapEvents = () => {
        useMapEvents({
            zoomend: (e) => {
                router.setParams({ lat: searchParams.lat, lng: searchParams.lng, zoom: e.target.getZoom() });
            },
        });
        return null;
    };

    const MapBoundsListener = ({ onBoundsChange }: { onBoundsChange: (bounds: any) => void }) => {
        useMapEvents({
            moveend: (e) => {
                const bounds = e.target.getBounds();
                onBoundsChange({
                    minLat: bounds.getSouth(),
                    maxLat: bounds.getNorth(),
                    minLon: bounds.getWest(),
                    maxLon: bounds.getEast()
                });

                const newCenter = e.target.getCenter();
                const newZoom = e.target.getZoom();

                if (Math.abs(newCenter.lat - lat) > 0.0001 || Math.abs(newCenter.lng - lng) > 0.0001 || newZoom !== zoom) {
                    router.setParams({
                        lat: newCenter.lat.toFixed(6),
                        lng: newCenter.lng.toFixed(6),
                        zoom: newZoom.toString()
                    });
                }
            },
        });
        return null;
    };

    const MapController = ({ setMapRef }: { setMapRef: (map: any) => void }) => {
        const map = useMap();
        setMapRef(map);
        return null;
    };

    function MapUpdater({ lat, lng, zoom }: { lat: number; lng: number; zoom: number }) {
        const map = useMap();

        useEffect(() => {
            map.setView([lat, lng], zoom);
        }, [lat, lng, zoom, map]);

        return null;
    }

    useEffect(() => {
        if (zoom >= 12) {
            fetchNearbyResorts(parseFloat(searchParams.lat as string || '40.797891'), parseFloat(searchParams.lng as string || '-3.971953'));
        }
    }, [searchParams.lat, searchParams.lng, searchParams.zoom]);

    return (
        <div style={{ position: 'relative', height: 'calc(100vh - 2.5rem)', width: '100%', overflow: 'hidden' }}>
            <MapContainer
                center={[parseFloat(searchParams.lat as string || '40.797891'), parseFloat(searchParams.lng as string || '-3.971953')]}
                zoom={parseInt(searchParams.zoom as string || '13')}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
            >
                {activePiste && (
                    <MapDetailPanel
                        data={activePiste}
                        onClose={() => setActivePiste(null)}
                    />
                )}
                {activeResort && (
                    <ResortDetailPanel
                        resort={activeResort}
                        onClose={() => setActiveResort(null)}
                    />
                )}
                <ZoomControl position="bottomright" />
                <MapController setMapRef={(map) => (mapRef.current = map)} />
                <MapUpdater lat={lat} lng={lng} zoom={zoom} />
                <MapEvents />
                <MapBoundsListener onBoundsChange={(bounds) => {
                    if (zoom < 12) {
                        fetchResortsByBBox(bounds.minLat, bounds.maxLat, bounds.minLon, bounds.maxLon);
                    } else {
                        fetchNearbyResorts(parseFloat(searchParams.lat as string || '40.797891'), parseFloat(searchParams.lng as string || '-3.971953'));
                    }
                }} />

                <TileLayer
                    attribution='&copy; <a href="https://www.esri.com/">Esri</a> &mdash; Source: Esri, USGS, NOAA'
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
                />

                {zoom <= 12 ? (
                    resorts?.map(resort => (
                        <CircleMarker
                            key={resort.ID}
                            center={[resort.Latitude, resort.Longitude]}
                            radius={8}
                            pathOptions={{
                                color: '#ffffff',
                                fillColor: '#e67e22',
                                fillOpacity: 1,
                                weight: 2,
                            }}
                            eventHandlers={{
                                click: () => {
                                    if (mapRef.current) {
                                        (mapRef.current as any).flyTo(
                                            [resort.Latitude, resort.Longitude],
                                            13,
                                            { duration: 1 }
                                        );
                                        setTimeout(() => {
                                            router.setParams({
                                                lat: resort.Latitude.toFixed(6),
                                                lng: resort.Longitude.toFixed(6),
                                                zoom: '13'
                                            });
                                        }, 1000);
                                    }
                                }
                            }}
                        >
                            <Tooltip direction="top" offset={[0, -10]} opacity={1}>
                                {resort.Name}
                            </Tooltip>
                        </CircleMarker>
                    ))
                ) : (
                    <>
                        {resorts?.flatMap(r => r.lifts || []).map((lift) => {
                            const isLiftSelected = activePiste?.ID === lift.ID || (activeResort && activeResort.lifts?.some(l => l.ID === lift.ID));
                            const positions = lift.GeometryGeoJSON.coordinates.map(
                                (coord) => [coord[1], coord[0]] as [number, number]
                            );

                            const displayLiftName = lift.Name && lift.Name.trim() !== ""
                                ? lift.Name
                                : `Lift #${lift.ID.slice(0, 4)}`;

                            let shouldShowLiftText = false;
                            if (lift.Name && !liftsNamesRendered.has(lift.Name)) {
                                liftsNamesRendered.add(lift.Name);
                                shouldShowLiftText = true;
                            }

                            const startPoint = positions[0];
                            const endPoint = positions[positions.length - 1];

                            return (
                                <div key={`lift-${lift.ID}`}>
                                    <CircleMarker
                                        center={startPoint}
                                        radius={zoom > 15 ? 7 : 3.5}
                                        pathOptions={{ color: '#ffffff', fillColor: '#e67e22', fillOpacity: 1, weight: 2 }}
                                    />
                                    <CircleMarker
                                        center={endPoint}
                                        radius={zoom > 15 ? 7 : 3.5}
                                        pathOptions={{ color: '#ffffff', fillColor: '#e67e22', fillOpacity: 1, weight: 2 }}
                                    />

                                    {isLiftSelected && (
                                        <Polyline
                                            positions={positions}
                                            pathOptions={{
                                                color: '#3498db',
                                                weight: 10,
                                                opacity: 0.7,
                                                lineCap: 'square',
                                            }}
                                        />
                                    )}

                                    <Polyline
                                        positions={positions}
                                        pathOptions={{
                                            color: '#e67e22',
                                            weight: 5,
                                            opacity: 0.9,
                                            lineCap: 'square',
                                        }}
                                    />

                                    <Polyline
                                        positions={positions}
                                        pathOptions={{
                                            color: '#2c3e50',
                                            weight: 2,
                                            dashArray: '6, 6',
                                            opacity: 1
                                        }}
                                        eventHandlers={{
                                            click: () => {
                                                setActivePiste(lift);
                                                setActiveResort(null);
                                            }
                                        }}
                                    />

                                    {shouldShowLiftText && zoom > 15 && (
                                        <PisteTextDecorator
                                            positions={positions}
                                            text={displayLiftName}
                                            color="#d35400"
                                            isLift={true}
                                            resorts={resorts}
                                        />
                                    )}
                                </div>
                            );
                        })}

                        {resorts?.flatMap(r => r.pistes || []).filter(piste => piste.GeometryGeoJSON.type !== "Polygon").map((piste) => {
                            const isSelected = activePiste?.ID === piste.ID || !!(activeResort && activeResort.pistes?.some(p => p.ID === piste.ID));
                            const isHovered = hoveredPisteID === piste.ID;
                            const color = getPisteColor(piste.Difficulty);

                            const rawCoords = piste.GeometryGeoJSON.coordinates;
                            const downhillCoordinates = getDownhillCoords(rawCoords);
                            const positions = downhillCoordinates.map(
                                (coord) => [coord[1], coord[0]] as [number, number]
                            );

                            const displayName = piste.Name && piste.Name.trim() !== ""
                                ? piste.Name
                                : `Piste ${piste.Difficulty.toUpperCase()} #${piste.ID.slice(0, 4)}`;

                            let shouldShowText = false;
                            if (piste.Name && !pistesNamesRendered.has(piste.Name)) {
                                pistesNamesRendered.add(piste.Name);
                                shouldShowText = true;
                            }

                            const commonEventHandlers = {
                                click: () => {
                                    setActivePiste(piste);
                                    setActiveResort(null);
                                },
                                mouseover: () => setHoveredPisteID(piste.ID),
                                mouseout: () => setHoveredPisteID(null)
                            };

                            return (
                                <div key={`piste-${piste.ID}`}>
                                    {isSelected && (
                                        <Polyline
                                            positions={positions}
                                            eventHandlers={commonEventHandlers}
                                            pathOptions={{
                                                color: '#3498db',
                                                weight: 12,
                                                opacity: 0.7,
                                                lineCap: 'round',
                                                renderer: L.canvas()
                                            }}
                                        />
                                    )}
                                    <Polyline
                                        positions={positions}
                                        eventHandlers={commonEventHandlers}
                                        pathOptions={{
                                            color: color,
                                            weight: isSelected ? 8 : (isHovered ? 8 : 5),
                                            opacity: 0.85,
                                            lineCap: 'round',
                                            renderer: L.canvas()
                                        }}
                                    />
                                    <Polyline
                                        eventHandlers={commonEventHandlers}
                                        positions={positions}
                                        pathOptions={{ color: '#ffffff', weight: isSelected ? 3.5 : (isHovered ? 3 : 2), opacity: 0.9 }}
                                    />
                                    {zoom >= 15 && <PisteDecorator positions={positions} color={color} />}

                                    {shouldShowText && zoom > 15 && (
                                        <PisteTextDecorator
                                            positions={positions}
                                            text={displayName}
                                            color={color}
                                            resorts={resorts}
                                        />
                                    )}
                                </div>
                            );
                        })}

                        <LayersControl position="topright">
                            <LayersControl.Overlay name="Resort Areas & Polygons">
                                <LayerGroup>
                                    {resorts?.flatMap(r => r.pistes || []).filter(piste => piste.GeometryGeoJSON.type === "Polygon").map((piste) => {
                                        const isSelected = activePiste?.ID === piste.ID || !!(activeResort && activeResort.pistes?.some(p => p.ID === piste.ID));
                                        const color = getPisteColor(piste.Difficulty);

                                        const rawCoords = piste.GeometryGeoJSON.coordinates[0];
                                        const positions = rawCoords.map(
                                            (coord: any) => [coord[1], coord[0]] as [number, number]
                                        );

                                        return (
                                            <Polygon
                                                key={`piste-poly-${piste.ID}`}
                                                positions={positions}
                                                eventHandlers={{
                                                    click: () => {
                                                        setActivePiste(piste);
                                                        setActiveResort(null);
                                                    }
                                                }}
                                                pathOptions={{
                                                    fillColor: color,
                                                    fillOpacity: isSelected ? 0.35 : 0.2,
                                                    color: '#3498db',
                                                    weight: isSelected ? 3.5 : 0,
                                                    stroke: isSelected,
                                                }}
                                            />
                                        );
                                    })}

                                    {resorts?.flatMap(r => r.areas || []).map((area) => {
                                        const polygonCoords = area.GeometryGeoJSON.coordinates[0].map(
                                            coord => [coord[1], coord[0]] as [number, number]
                                        );

                                        return (
                                            <Polygon
                                                key={area.ID}
                                                positions={polygonCoords}
                                                pathOptions={{
                                                    color: '#3498db',
                                                    fillColor: '#3498db',
                                                    fillOpacity: 0.3,
                                                    weight: 2,
                                                    dashArray: '5, 5'
                                                }}
                                            />
                                        );
                                    })}
                                </LayerGroup>
                            </LayersControl.Overlay>
                        </LayersControl>

                        {resorts?.map((resort) => {
                            const customIcon = L.divIcon({
                                className: 'resort-center-marker',
                                html: `
                                    <div class="resort-marker-container">
                                        <div class="resort-marker-dot"></div>
                                        <div class="resort-marker-name">${resort.Name}</div>
                                    </div>
                                `,
                                iconSize: [120, 40],
                                iconAnchor: [60, 5]
                            });

                            return (
                                <Marker
                                    key={`resort-marker-${resort.ID}`}
                                    position={[resort.Latitude, resort.Longitude]}
                                    icon={customIcon}
                                    zIndexOffset={1000}
                                    eventHandlers={{
                                        click: () => {
                                            setActiveResort(resort);
                                            setActivePiste(null);
                                        }
                                    }}
                                />
                            );
                        })}
                    </>
                )}
            </MapContainer>
        </div>
    );
}

function PisteDecorator({ positions, color }: { positions: [number, number][], color: string }) {
    const map = useMap();
    const decoratorRef = useRef<any>(null);

    useEffect(() => {
        if (positions.length < 2) return;

        const LeafletSymbol =
            (L as any).Symbol ||
            (window as any).L?.Symbol ||
            (L as any).PolylineDecorator?.Symbol;

        if (!LeafletSymbol || !LeafletSymbol.arrowHead) {
            console.warn("Could not load Leaflet arrow symbol generator");
            return;
        }

        decoratorRef.current = (L as any).polylineDecorator(positions, {
            patterns: [
                {
                    offset: '25px',
                    repeat: '80px',
                    symbol: LeafletSymbol.arrowHead({
                        pixelSize: 8,
                        headAngle: 60,
                        polygon: false,
                        pathOptions: {
                            stroke: true,
                            color: color,
                            weight: 2.0,
                            fill: false,
                            opacity: 0.95
                        }
                    })
                }
            ]
        }).addTo(map);

        return () => {
            if (decoratorRef.current) {
                map.removeLayer(decoratorRef.current);
            }
        };
    }, [map, positions, color]);

    return null;
}

const getDistance = (p1: [number, number], p2: [number, number]) => {
    const dy = p2[0] - p1[0];
    const dx = p2[1] - p1[1];
    return Math.sqrt(dx * dx + dy * dy);
};

export function PisteTextDecorator({ positions, text, color, isLift = false, resorts = [] }: PisteTextDecoratorProps & { resorts?: ResortDetail[] }) {
    const map = useMap();
    const svgMarkerRef = useRef<L.Marker | null>(null);

    useEffect(() => {
        if (!positions || positions.length < 2 || !text) return;

        // Calculate all segments in the line
        const segments: { p1: [number, number]; p2: [number, number]; dist: number }[] = [];
        for (let i = 0; i < positions.length - 1; i++) {
            segments.push({
                p1: positions[i],
                p2: positions[i + 1],
                dist: getDistance(positions[i], positions[i + 1])
            });
        }
        // Sort by distance descending (prefer longest segments)
        segments.sort((a, b) => b.dist - a.dist);

        let finalPoint: [number, number] | null = null;
        let chosenSegment = segments[0];

        // Try to find a position without collision
        for (const seg of segments) {
            // Check center (50%), then quarter (25%), then three-quarter (75%)
            const fractions = [0.5, 0.25, 0.75];
            for (const frac of fractions) {
                const candidate: [number, number] = [
                    seg.p1[0] + (seg.p2[0] - seg.p1[0]) * frac,
                    seg.p1[1] + (seg.p2[1] - seg.p1[1]) * frac
                ];

                // Check collision in screen pixels with other labels
                const pt = map.latLngToContainerPoint(candidate);
                let hasCollision = renderedLabelPoints.some(r => {
                    const dx = r.x - pt.x;
                    const dy = r.y - pt.y;
                    return Math.sqrt(dx * dx + dy * dy) < 95; // 95 pixels safety distance
                });

                // Also check collision with resort center markers (avoid overlapping resort names)
                if (!hasCollision && resorts && resorts.length > 0) {
                    hasCollision = resorts.some(resort => {
                        try {
                            const rPt = map.latLngToContainerPoint([resort.Latitude, resort.Longitude]);
                            const dx = rPt.x - pt.x;
                            const dy = rPt.y - pt.y;
                            return Math.sqrt(dx * dx + dy * dy) < 95; // 95 pixels safety distance from resort center
                        } catch (e) {
                            return false;
                        }
                    });
                }

                if (!hasCollision) {
                    finalPoint = candidate;
                    chosenSegment = seg;
                    break;
                }
            }
            if (finalPoint) break;
        }

        // Fallback to the midpoint of the longest segment if they all collide
        if (!finalPoint) {
            const seg = segments[0];
            finalPoint = [
                seg.p1[0] + (seg.p2[0] - seg.p1[0]) * 0.5,
                seg.p1[1] + (seg.p2[1] - seg.p1[1]) * 0.5
            ];
            chosenSegment = seg;
        }

        // Register final point to screen coordinate registry
        try {
            const pt = map.latLngToContainerPoint(finalPoint);
            renderedLabelPoints.push({ x: pt.x, y: pt.y, text });
        } catch (e) {
            // map.latLngToContainerPoint might throw if points are out of bounds/invalid
        }

        const p1 = chosenSegment.p1;
        const p2 = chosenSegment.p2;

        const dy = p2[0] - p1[0];
        const dx = p2[1] - p1[1];
        let angle = Math.atan2(dy, dx) * (180 / Math.PI);

        if (angle > 90) {
            angle -= 180;
        } else if (angle < -90) {
            angle += 180;
        }

        const renderAngle = -angle;

        const textColor = isLift ? '#d35400' : color;

        const svgHtml = `
          <svg width="200" height="30" viewBox="0 0 200 30" style="overflow: visible; pointer-events: none;">
            <g transform="rotate(${renderAngle} 100 15)">
              <text 
                x="100" 
                y="15" 
                fill="${textColor}"
                dominant-baseline="middle" 
                text-anchor="middle" 
                font-size="9px" 
                font-family="system-ui, -apple-system, sans-serif" 
                font-weight="700"
                letter-spacing="0.5px"
                style="text-shadow: 1px 1px 1px #ffffff, -1px -1px 1px #ffffff, 1px -1px 1px #ffffff, -1px 1px 1px #ffffff;"
              >
                ${text}
              </text>
            </g>
          </svg>
        `;

        const svgIcon = L.divIcon({
            className: 'static-piste-label',
            html: svgHtml,
            iconSize: [200, 30],
            iconAnchor: [100, 15]
        });

        svgMarkerRef.current = L.marker(finalPoint, {
            icon: svgIcon,
            interactive: false
        }).addTo(map);

        return () => {
            if (svgMarkerRef.current) {
                map.removeLayer(svgMarkerRef.current);
            }
        };
    }, [map, positions, text, color, isLift, resorts]);

    return null;
}