import { API_BASE_URL } from 'constants/constants';
import L from 'leaflet';
import 'leaflet-polylinedecorator';
import 'leaflet/dist/leaflet.css';
import { Lift, Piste, PisteTextDecoratorProps, ResortDetail } from 'models/ski-resort.model';
import { useEffect, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Polygon, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents, ZoomControl } from 'react-leaflet';
import { MapDetailPanel } from './MapDetailPanel';

export default function InteractiveSkiMap() {
    const mapRef = useRef(null);
    const lastCenter = useRef({ lat: 0, lng: 0 });
    const [center, setCenter] = useState({ lat: 40.797891, lng: -3.971953 });
    const [resorts, setResorts] = useState<ResortDetail[]>([]);
    const [activePiste, setActivePiste] = useState<Piste | Lift | null>(null);
    const [zoom, setZoom] = useState(13);

    const fetchNearbyResorts = async (lat: number, lng: number) => {
        const delta = Math.abs(lat - lastCenter.current.lat) +
            Math.abs(lng - lastCenter.current.lng);

        if (delta < 0.05) return;

        lastCenter.current = { lat, lng };

        try {
            const response = await fetch(`${API_BASE_URL}/resorts/nearby?lat=${lat}&lng=${lng}&radius=20`);
            if (!response.ok) throw new Error(`HTTP: ${response.status}`);
            const data: ResortDetail[] = await response.json();
            setResorts(data);
        } catch (error) {
            console.error("Error getting nearby resorts:", error);
        }
    };

    const fetchResortsByBBox = async (minLat: number, maxLat: number, minLon: number, maxLon: number) => {
        try {
            const response = await fetch(`${API_BASE_URL}/resorts/bbox?minLat=${minLat}&maxLat=${maxLat}&minLon=${minLon}&maxLon=${maxLon}`);
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
                setZoom(e.target.getZoom());
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
            },
        });
        return null;
    };

    const MapController = ({ setMapRef }: { setMapRef: (map: any) => void }) => {
        const map = useMap();
        setMapRef(map);
        return null;
    };

    useEffect(() => {
        if (zoom > 10) {
            fetchNearbyResorts(center.lat, center.lng);
        }
    }, [center, zoom]);

    return (
        <div style={{ position: 'relative', height: '100vh', width: '100%', overflow: 'hidden' }}>

            <MapContainer
                center={[center.lat, center.lng]}
                zoom={zoom}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
            >
                {activePiste && (
                    <MapDetailPanel
                        data={activePiste}
                        onClose={() => setActivePiste(null)}
                    />
                )}
                <ZoomControl position="bottomright" />
                <MapController setMapRef={(map) => (mapRef.current = map)} />
                <MapEvents />
                <MapBoundsListener onBoundsChange={(bounds) => {
                    if (zoom < 10) {
                        fetchResortsByBBox(bounds.minLat, bounds.maxLat, bounds.minLon, bounds.maxLon);
                    } else {
                        const centerLat = (bounds.minLat + bounds.maxLat) / 2;
                        const centerLon = (bounds.minLon + bounds.maxLon) / 2;
                        setCenter({ lat: centerLat, lng: centerLon });
                        fetchNearbyResorts(centerLat, centerLon);
                    }
                }} />
                <TileLayer
                    attribution='&copy; <a href="https://www.esri.com/">Esri</a> &mdash; Source: Esri, USGS, NOAA'
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
                />

                {zoom < 12 ? (
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
                                className: 'focus-none'
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
                                            setCenter({ lat: resort.Latitude, lng: resort.Longitude });
                                            setZoom(13);
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
                        {resorts.flatMap(r => r.pistes || []).map((piste) => {
                            const isSelected = activePiste?.ID === piste.ID;
                            const color = getPisteColor(piste.Difficulty);

                            const rawCoords = piste.GeometryGeoJSON.type === "Polygon"
                                ? piste.GeometryGeoJSON.coordinates[0]
                                : piste.GeometryGeoJSON.coordinates;

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

                            return (
                                <div key={`piste-${piste.ID}`}>
                                    {piste.GeometryGeoJSON.type !== "Polygon" ? (
                                        <Polyline
                                            positions={positions}
                                            eventHandlers={{ click: () => setActivePiste(piste) }}
                                            pathOptions={{
                                                color: color,
                                                weight: isSelected ? 7 : 5,
                                                opacity: 0.85,
                                                lineCap: 'round',
                                                renderer: L.canvas()
                                            }}
                                        />
                                    ) : <Polygon
                                        positions={positions}
                                        eventHandlers={{ click: () => setActivePiste(piste) }}
                                        pathOptions={{
                                            fillColor: color,
                                            fillOpacity: isSelected ? 0.4 : 0.2,
                                            stroke: false,
                                        }}
                                    />}

                                    {piste.GeometryGeoJSON.type !== "Polygon" && (
                                        <>
                                            <Polyline
                                                eventHandlers={{ click: () => setActivePiste(piste) }}
                                                positions={positions}
                                                pathOptions={{ color: '#ffffff', weight: isSelected ? 3 : 2, opacity: 0.9 }}
                                            />
                                            <PisteDecorator positions={positions} color={color} />
                                        </>
                                    )}

                                    {shouldShowText && zoom > 15 && (
                                        <PisteTextDecorator
                                            positions={positions}
                                            text={displayName}
                                            color={color}
                                        />
                                    )}
                                </div>
                            );
                        })}

                        {resorts.flatMap(r => r.lifts || []).map((lift) => {
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
                                        eventHandlers={{ click: () => setActivePiste(lift) }}
                                    />

                                    {shouldShowLiftText && zoom > 15 && (
                                        <PisteTextDecorator
                                            positions={positions}
                                            text={displayLiftName}
                                            color="#d35400"
                                            isLift={true}
                                        />
                                    )}
                                </div>
                            );
                        })}

                        {resorts.flatMap(r => r.areas || []).map((area) => {
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
                    offset: '15%',
                    repeat: '100px',
                    symbol: LeafletSymbol.arrowHead({
                        pixelSize: 8,
                        headAngle: 60,
                        pathOptions: {
                            stroke: true,
                            color: color,
                            weight: 2,
                            fill: false
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

export function PisteTextDecorator({ positions, text, color, isLift = false }: PisteTextDecoratorProps) {
    const map = useMap();
    const svgMarkerRef = useRef<L.Marker | null>(null);

    useEffect(() => {
        if (!positions || positions.length < 2 || !text) return;

        let totalLength = 0;
        for (let i = 0; i < positions.length - 1; i++) {
            totalLength += getDistance(positions[i], positions[i + 1]);
        }

        const halfLength = totalLength / 2;
        let currentLength = 0;
        let p1 = positions[0];
        let p2 = positions[1];

        for (let i = 0; i < positions.length - 1; i++) {
            const dist = getDistance(positions[i], positions[i + 1]);
            if (currentLength + dist >= halfLength) {
                p1 = positions[i];
                p2 = positions[i + 1];
                break;
            }
            currentLength += dist;
        }

        const midPoint: [number, number] = [
            (p1[0] + p2[0]) / 2,
            (p1[1] + p2[1]) / 2
        ];

        const dy = p2[0] - p1[0];
        const dx = p2[1] - p1[1];
        let angle = Math.atan2(dy, dx) * (180 / Math.PI);

        if (angle > 90) {
            angle -= 180;
        } else if (angle < -90) {
            angle += 180;
        }

        const renderAngle = -angle;

        const charWidth = 7;
        const padding = 16;
        const rectWidth = Math.max(60, text.length * charWidth + padding);
        const rectHeight = 18;

        const halfW = rectWidth / 2;
        const halfH = rectHeight / 2;

        const rectFill = isLift ? '#e67e22' : '#ffffff';
        const rectStroke = isLift ? '#d35400' : color;
        const textColor = isLift ? '#ffffff' : '#1e293b';

        const svgHtml = `
          <svg width="240" height="60" viewBox="0 0 240 60" style="overflow: visible; pointer-events: none;">
            <g transform="rotate(${renderAngle} 120 30)">
              <rect 
                x="${120 - halfW}" 
                y="${30 - halfH}" 
                width="${rectWidth}" 
                height="${rectHeight}" 
                rx="5" 
                fill="${rectFill}" 
                stroke="${rectStroke}" 
                stroke-width="1"
                style="filter: drop-shadow(0px 1px 2px rgba(0,0,0,0.2));"
              />
              <text 
                x="120" 
                y="31" 
                fill="${textColor}"
                dominant-baseline="middle" 
                text-anchor="middle" 
                font-size="10px" 
                font-family="system-ui, -apple-system, sans-serif" 
                font-weight="700"
                letter-spacing="0.5px"
              >
                ${text}
              </text>
            </g>
          </svg>
        `;

        const svgIcon = L.divIcon({
            className: 'static-piste-label',
            html: svgHtml,
            iconSize: [240, 60],
            iconAnchor: [120, 30]
        });

        svgMarkerRef.current = L.marker(midPoint, {
            icon: svgIcon,
            interactive: false
        }).addTo(map);

        return () => {
            if (svgMarkerRef.current) {
                map.removeLayer(svgMarkerRef.current);
            }
        };
    }, [map, positions, text, color, isLift]);

    return null;
}