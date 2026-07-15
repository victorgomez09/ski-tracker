import { API_BASE_URL } from 'constants/constants';
import L from 'leaflet';
import 'leaflet-polylinedecorator';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Marker, Polygon, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { PisteDetailPanel } from './PisteDetailPanel';

interface GeoJSONLine {
    type: string;
    coordinates: [number, number, number][];
}

interface Piste {
    ID: string;
    Difficulty: string;
    Name: string;
    GeometryGeoJSON: GeoJSONLine;
}

interface Lift {
    ID: string;
    Name: string;
    LiftType: string;
    Capacity: number;
    CapacityHourly: number;
    GeometryGeoJSON: GeoJSONLine;
}

interface Area {
    ID: string;
    Name?: string;
    GeometryGeoJSON: {
        type: "Polygon";
        coordinates: [number, number][][];
    };
    Type: 'beginner_area' | 'off_piste' | 'building';
}

interface ResortDetail {
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


export default function InteractiveSkiMap() {
    const [center, setCenter] = useState({ lat: 40.797891, lng: -3.971953 });
    const [resorts, setResorts] = useState<ResortDetail[]>([]);
    const [activePiste, setActivePiste] = useState<Piste | null>(null);
    const [zoom, setZoom] = useState(13);

    const fetchNearbyResorts = async (lat: number, lng: number) => {
        try {
            const response = await fetch(`${API_BASE_URL}/resorts/nearby?lat=${lat}&lng=${lng}&radius=20`);
            if (!response.ok) throw new Error(`HTTP: ${response.status}`);
            const data: ResortDetail[] = await response.json();
            setResorts(data);
        } catch (error) {
            console.error("Error cargando estaciones:", error);
        }
    };

    const nombresPistasRenderizados = new Set<string>();
    const nombresRemontesRenderizados = new Set<string>();

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

    useEffect(() => {
        fetchNearbyResorts(center.lat, center.lng);
    }, []);

    return (
        <div style={{ position: 'relative', height: '100vh', width: '100%', overflow: 'hidden' }}>
            {activePiste && (
                <PisteDetailPanel
                    piste={activePiste}
                    onClose={() => setActivePiste(null)}
                />
            )}

            <MapContainer
                center={[center.lat, center.lng]}
                zoom={zoom}
                style={{ height: '100%', width: '100%' }}
            >
                <MapEvents />
                <TileLayer
                    attribution='&copy; <a href="https://www.esri.com/">Esri</a> &mdash; Source: Esri, USGS, NOAA'
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
                />

                {zoom < 12 ? (
                    resorts.map(resort => (
                        <CircleMarker
                            key={resort.ID}
                            center={[resort.Latitude, resort.Longitude]}
                            radius={8} // Tamaño del punto en píxeles
                            pathOptions={{
                                color: '#ffffff',       // Color del borde del punto
                                fillColor: '#e67e22',   // Color interior (mismo naranja que tus remontes)
                                fillOpacity: 1,         // Sólido
                                weight: 2               // Grosor del borde blanco para que destaque
                            }}
                            eventHandlers={{
                                click: () => {
                                    // Aquí podrías hacer zoom automáticamente a la estación al hacer click
                                    console.log("Estación seleccionada:", resort.Name);
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
                                : `Pista ${piste.Difficulty.toUpperCase()} #${piste.ID.slice(0, 4)}`;

                            let shouldShowText = false;
                            if (piste.Name && !nombresPistasRenderizados.has(piste.Name)) {
                                nombresPistasRenderizados.add(piste.Name);
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
                                            fillOpacity: 0.2,
                                            stroke: false,
                                        }}
                                    />}

                                    {piste.GeometryGeoJSON.type !== "Polygon" && (
                                        <>
                                            <Polyline
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
                                : `Remonte #${lift.ID.slice(0, 4)}`;

                            let shouldShowLiftText = false;
                            if (lift.Name && !nombresRemontesRenderizados.has(lift.Name)) {
                                nombresRemontesRenderizados.add(lift.Name);
                                shouldShowLiftText = true;
                            }

                            const startPoint = positions[0];
                            const endPoint = positions[positions.length - 1];

                            return (
                                <div key={`lift-${lift.ID}`}>
                                    <CircleMarker
                                        center={startPoint}
                                        radius={7}
                                        pathOptions={{ color: '#ffffff', fillColor: '#e67e22', fillOpacity: 1, weight: 2 }}
                                    />
                                    <CircleMarker
                                        center={endPoint}
                                        radius={7}
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
                                    >
                                        <Popup>
                                            <div style={{
                                                fontFamily: 'system-ui, sans-serif',
                                                fontSize: '13px',
                                                lineHeight: '1.4',
                                                minWidth: '160px'
                                            }}>
                                                <h4 style={{ margin: '0 0 5px 0', color: '#e67e22', borderBottom: '1px solid #eee', paddingBottom: '3px' }}>
                                                    🚠 {displayLiftName}
                                                </h4>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0' }}>
                                                    <span style={{ fontWeight: '600', color: '#666' }}>Tipo:</span>
                                                    <span>{(lift.LiftType || 'Desconocido').toUpperCase().replace('_', ' ')}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0' }}>
                                                    <span style={{ fontWeight: '600', color: '#666' }}>Capacidad:</span>
                                                    <span>👥 {lift.Capacity || 'N/A'} pers.</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0' }}>
                                                    <span style={{ fontWeight: '600', color: '#666' }}>Cap. Horaria:</span>
                                                    <span>⚡ {lift.CapacityHourly || 'N/A'} p/h</span>
                                                </div>
                                            </div>
                                        </Popup>
                                    </Polyline>

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
            console.warn("No se pudo cargar el generador de símbolos de flecha de Leaflet");
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

interface PisteTextDecoratorProps {
    positions: [number, number][];
    text: string;
    color: string;
    isLift?: boolean;
}

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
                rx="9" 
                fill="${rectFill}" 
                stroke="${rectStroke}" 
                stroke-width="1.5"
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