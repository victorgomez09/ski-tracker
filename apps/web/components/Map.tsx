import { API_BASE_URL } from 'constants/constants';
import L from 'leaflet';
import 'leaflet-polylinedecorator';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { MapContainer, Polygon, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import { PisteDetailPanel } from './PisteDetailPanel';

// --- INTERFACES ---
interface GeoJSONLine {
    type: string;
    coordinates: [number, number, number][]; // [longitud, latitud, altitud]
}

interface Piste {
    ID: string;
    Difficulty: string;
    Name: string;
    GeometryGeoJSON: GeoJSONLine;
}

// Nueva interfaz para los Remontes
interface Lift {
    ID: string;
    Name: string;
    LiftType: string;      // ej: "chair_lift", "drag_lift", "gondola"
    Capacity: number;      // plazas por silla/cabina (ej: 4)
    CapacityHourly: number; // capacidad de transporte por hora (ej: 2400)
    GeometryGeoJSON: GeoJSONLine;
}

interface Area {
    ID: string;
    Name?: string;
    GeometryGeoJSON: {
        type: "Polygon";
        coordinates: [number, number][][]; // Polígono: Array de anillos
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
    const [activeResortName, setActiveResortName] = useState<string>("Valdesquí");

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

    useEffect(() => {
        fetchNearbyResorts(center.lat, center.lng);
    }, []);

    // Sets para recordar qué nombres ya hemos dibujado y evitar duplicados en pantalla
    const nombresPistasRenderizados = new Set<string>();
    const nombresRemontesRenderizados = new Set<string>();

    const getPisteColor = (difficulty: string) => {
        switch (difficulty.toLowerCase()) {
            case 'novice': return '#00e676';       // Verde
            case 'easy': return '#2979ff';         // Azul
            case 'intermediate': return '#ff1744'; // Rojo
            case 'advanced': return '#212121';     // Negro
            default: return '#9e9e9e';
        }
    };

    // Helper para verificar el sentido de la bajada en base a la altitud
    const getDownhillCoords = (coordinates: [number, number, number][]) => {
        if (coordinates.length < 2) return coordinates;

        const startAlt = coordinates[0][2] || 0;
        const endAlt = coordinates[coordinates.length - 1][2] || 0;

        if (endAlt > startAlt) {
            return [...coordinates].reverse();
        }
        return coordinates;
    };

    return (
        <div style={{ position: 'relative', height: '100vh', width: '100%', overflow: 'hidden' }}>

            {/* PANEL DETALLES DE PISTA (IZQUIERDA) */}
            {activePiste && (
                <PisteDetailPanel
                    piste={activePiste}
                    onClose={() => setActivePiste(null)}
                />
            )}

            {/* MAPA */}
            <MapContainer
                center={[center.lat, center.lng]}
                zoom={14}
                style={{ height: '100%', width: '100%' }}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.esri.com/">Esri</a> &mdash; Source: Esri, USGS, NOAA'
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
                />

                {/* --- RENDERIZADO DE PISTAS --- */}
                {resorts.flatMap(r => r.pistes || []).map((piste) => {
                    const isSelected = activePiste?.ID === piste.ID;
                    const color = getPisteColor(piste.Difficulty);
                    const downhillCoordinates = getDownhillCoords(piste.GeometryGeoJSON.coordinates);

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
                            {/* Borde exterior / Sombra */}
                            <Polyline
                                positions={positions}
                                eventHandlers={{
                                    click: () => setActivePiste(piste)
                                }}
                                pathOptions={{
                                    color: color,
                                    weight: isSelected ? 7 : 5,
                                    opacity: 0.85,
                                    lineCap: 'round',
                                    renderer: L.canvas()
                                }}
                            />

                            {/* Línea central blanca estilizada */}
                            <Polyline
                                positions={positions}
                                pathOptions={{
                                    color: '#ffffff',
                                    weight: isSelected ? 3 : 2,
                                    opacity: 0.9
                                }}
                            />

                            {/* Flechas de sentido */}
                            <PisteDecorator positions={positions} color={color} />

                            {/* Nombre de la pista */}
                            {shouldShowText && (
                                <PisteTextDecorator
                                    positions={positions}
                                    text={displayName}
                                    color={color}
                                />
                            )}
                        </div>
                    );
                })}

                {/* --- RENDERIZADO DE REMONTES (LIFTS) --- */}
                {resorts.flatMap(r => r.lifts || []).map((lift) => {
                    // Formateamos las coordenadas [Lat, Lng]
                    const positions = lift.GeometryGeoJSON.coordinates.map(
                        (coord) => [coord[1], coord[0]] as [number, number]
                    );

                    const displayLiftName = lift.Name && lift.Name.trim() !== ""
                        ? lift.Name
                        : `Remonte #${lift.ID.slice(0, 4)}`;

                    // Controlamos mostrar el texto una sola vez
                    let shouldShowLiftText = false;
                    if (lift.Name && !nombresRemontesRenderizados.has(lift.Name)) {
                        nombresRemontesRenderizados.add(lift.Name);
                        shouldShowLiftText = true;
                    }

                    return (
                        <div key={`lift-${lift.ID}`}>
                            {/* Línea exterior del remonte (Color Naranja para que resalte) */}
                            <Polyline
                                positions={positions}
                                pathOptions={{
                                    color: '#e67e22', // Color característico de remonte (naranja vibrante)
                                    weight: 5,
                                    opacity: 0.9,
                                    lineCap: 'square',
                                }}
                            />

                            {/* Línea interior discontinua (Efecto cable/sillas) */}
                            <Polyline
                                positions={positions}
                                pathOptions={{
                                    color: '#2c3e50', // Gris oscuro / cable
                                    weight: 2,
                                    dashArray: '6, 6', // Crea el efecto visual de "cable suspendido"
                                    opacity: 1
                                }}
                            >
                                {/* Popup interactivo al hacer click */}
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

                            {/* Nombre del remonte rotado sobre su línea */}
                            {shouldShowLiftText && (
                                <PisteTextDecorator
                                    positions={positions}
                                    text={displayLiftName}
                                    color="#d35400" // Texto en un tono naranja más oscuro para legibilidad
                                    isLift={true}
                                />
                            )}
                        </div>
                    );
                })}

                {resorts.flatMap(r => r.areas || []).map((area) => {
                    // Convertimos [lng, lat] de GeoJSON a [lat, lng] de Leaflet
                    const polygonCoords = area.GeometryGeoJSON.coordinates[0].map(
                        coord => [coord[1], coord[0]] as [number, number]
                    );

                    return (
                        <Polygon
                            key={area.ID}
                            positions={polygonCoords}
                            pathOptions={{
                                color: '#3498db',     // Color del borde (azul suave)
                                fillColor: '#3498db', // Color de relleno
                                fillOpacity: 0.3,     // Transparencia para ver el terreno base
                                weight: 2,
                                dashArray: '5, 5'     // Opcional: borde punteado para diferenciar
                            }}
                        />
                    );
                })}
            </MapContainer>
        </div>
    );
}

// --- DECORADORES (IGUAL QUE ANTES) ---

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
    isLift?: boolean; // Añadimos un flag para diferenciar remonte de pista
}

export function PisteTextDecorator({ positions, text, color, isLift = false }: PisteTextDecoratorProps) {
    const map = useMap();
    const svgMarkerRef = useRef<L.Marker | null>(null);

    useEffect(() => {
        if (!positions || positions.length < 2 || !text) return;

        // 1. Calcular el punto medio
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

        // 2. Calcular ángulo de rotación para alinearse con la línea
        const dy = p2[0] - p1[0];
        const dx = p2[1] - p1[1];
        let angle = Math.atan2(dy, dx) * (180 / Math.PI);

        if (angle > 90) {
            angle -= 180;
        } else if (angle < -90) {
            angle += 180;
        }

        const renderAngle = -angle;

        // 3. CÁLCULO DINÁMICO DEL ANCHO: Evita cajas gigantes en nombres cortos
        const charWidth = 7; // promedio de px por carácter en font-size 10px
        const padding = 16;
        const rectWidth = Math.max(60, text.length * charWidth + padding);
        const rectHeight = 18;

        const halfW = rectWidth / 2;
        const halfH = rectHeight / 2;

        // 4. DISEÑO INTEGRADO (Estilo cartografía alpina)
        // - Si es remonte: Caja naranja con letras blancas (integrado en el cable)
        // - Si es pista: Caja blanca con borde del color de la dificultad
        const rectFill = isLift ? '#e67e22' : '#ffffff';
        const rectStroke = isLift ? '#d35400' : color;
        const textColor = isLift ? '#ffffff' : '#1e293b';

        const svgHtml = `
          <svg width="240" height="60" viewBox="0 0 240 60" style="overflow: visible; pointer-events: none;">
            <g transform="rotate(${renderAngle} 120 30)">
              <!-- CONTENEDOR MÁSCARA: "Corta" la línea de fondo de forma limpia -->
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
              <!-- TEXTO DE LA PISTA/REMONTE -->
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
            iconAnchor: [120, 30] // Centrado absoluto
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