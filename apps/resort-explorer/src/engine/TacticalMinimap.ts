import L from 'leaflet';
import { GeoProjection } from './GeoProjection.js';
import { ResortDataPayload } from './ResortDataService.js';
import { ProceduralTerrain } from './ProceduralTerrain.js';

interface ProjectedPiste {
  name: string;
  difficulty: string;
  color: string;
  points: Array<[number, number]>;
  latLngs: Array<[number, number]>;
  lengthMeters: number;
}

interface ProjectedLift {
  name: string;
  liftType: string;
  points: Array<[number, number]>;
  latLngs: Array<[number, number]>;
}

interface ProjectedPOI {
  name: string;
  category: string;
  x: number;
  z: number;
  lat: number;
  lon: number;
}

interface SelectedMapTarget {
  kind: 'piste' | 'lift' | 'poi';
  title: string;
  badgeText: string;
  badgeColor: string;
  details: string[];
  x: number;
  z: number;
  heading?: number;
}

/**
 * Minimapa táctico 2D en tiempo real (Fase 10.7):
 * - Vista compacta en esquina (Canvas 60 FPS centrado en el esquiador).
 * - Plano ampliado (tecla M o clic) sobre capa Leaflet blanquecina (OSM) con
 *   pistas, remontes, POIs y posición en vivo, más menú de detalles y confirmación
 *   para viajar rápido al punto seleccionado.
 */
export class TacticalMinimap {
  private miniCanvas: HTMLCanvasElement;
  private miniCtx: CanvasRenderingContext2D;
  private expandedOverlay: HTMLElement;
  private selectionMenu: HTMLElement;

  private expandedMap: L.Map | null = null;
  private expandedLayers: L.LayerGroup | null = null;
  private skierMarker: L.Marker | null = null;
  private targetPin: L.CircleMarker | null = null;
  private sessionTrailPolyline: L.Polyline | null = null;
  private sessionTrailXZ: Array<[number, number]> = [];
  private sessionTrailLatLngs: Array<[number, number]> = [];
  private showSessionTrail = true;
  private remotePeers: Array<{ userId: string; name: string; x: number; z: number }> = [];
  private remotePeerMarkers: Map<string, L.Marker> = new Map();

  private projection: GeoProjection | null = null;
  private terrain: ProceduralTerrain | null = null;
  private baseAltitudeMeters = 1860;
  private summitAltitudeMeters = 2280;

  private pistes: ProjectedPiste[] = [];
  private lifts: ProjectedLift[] = [];
  private pois: ProjectedPOI[] = [];

  private isExpanded = false;
  private miniSpanMeters = 1040;
  private mapRotationDeg = 0;
  private skierX = 0;
  private skierZ = 0;
  private skierHeading = 0;
  private onFastTravel: (x: number, z: number, heading?: number) => void;

  private readonly difficultyColors: Record<string, string> = {
    novice: '#10b981',
    easy: '#0284c7',
    intermediate: '#ef4444',
    advanced: '#18181b',
    expert: '#18181b',
  };

  private readonly difficultyLabels: Record<string, string> = {
    novice: 'Verde · Muy fácil',
    easy: 'Azul · Fácil',
    intermediate: 'Roja · Intermedia',
    advanced: 'Negra · Difícil',
    expert: 'Negra · Experto',
  };

  constructor(onFastTravel: (x: number, z: number, heading?: number) => void) {
    this.onFastTravel = onFastTravel;

    this.miniCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
    this.miniCtx = this.miniCanvas.getContext('2d')!;
    this.expandedOverlay = document.getElementById('expanded-minimap-overlay') as HTMLElement;
    this.selectionMenu = document.getElementById('expanded-selection-menu') as HTMLElement;

    this.bindEvents();
  }

  private bindEvents() {
    const widget = document.getElementById('minimap-widget');
    widget?.addEventListener('click', () => {
      this.toggleExpanded(true);
    });

    widget?.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.adjustMiniZoom(e.deltaY > 0 ? 1.2 : 0.82);
      },
      { passive: false }
    );

    document.getElementById('minimap-zoom-in')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.adjustMiniZoom(0.75);
    });

    document.getElementById('minimap-zoom-out')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.adjustMiniZoom(1.33);
    });

    document.getElementById('expanded-minimap-close')?.addEventListener('click', () => {
      this.toggleExpanded(false);
    });

    // Controles de rotación y zoom del mapa ampliado
    document.getElementById('exp-rotate-left')?.addEventListener('click', () => this.setMapRotation(this.mapRotationDeg - 15));
    document.getElementById('exp-rotate-right')?.addEventListener('click', () => this.setMapRotation(this.mapRotationDeg + 15));
    document.getElementById('exp-rotate-reset')?.addEventListener('click', () => this.setMapRotation(0));
    document.getElementById('exp-zoom-in')?.addEventListener('click', () => this.expandedMap?.zoomIn());
    document.getElementById('exp-zoom-out')?.addEventListener('click', () => this.expandedMap?.zoomOut());

    const rotSlider = document.getElementById('exp-rotate-slider') as HTMLInputElement | null;
    rotSlider?.addEventListener('input', (e) => {
      this.setMapRotation(Number((e.target as HTMLInputElement).value));
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM') {
        this.toggleExpanded(!this.isExpanded);
      } else if (e.code === 'Escape' && this.isExpanded) {
        this.toggleExpanded(false);
      }
    });
  }

  private adjustMiniZoom(factor: number) {
    this.miniSpanMeters = Math.max(360, Math.min(3600, this.miniSpanMeters * factor));
    this.drawMini();
  }

  private syncRotatorGeometry() {
    const body = document.querySelector('.expanded-minimap-body') as HTMLElement | null;
    const rotator = document.getElementById('expanded-map-rotator');
    if (!body || !rotator) return;

    const w = body.clientWidth || 800;
    const h = body.clientHeight || 600;
    // Cuadrado circunscrito a la diagonal del contenedor: garantiza 0 márgenes negros en cualquier ángulo 0-360°
    const side = Math.ceil(Math.hypot(w, h)) + 64;
    rotator.style.width = `${side}px`;
    rotator.style.height = `${side}px`;
    rotator.style.left = `${(w - side) / 2}px`;
    rotator.style.top = `${(h - side) / 2}px`;
  }

  private setMapRotation(deg: number) {
    this.mapRotationDeg = ((deg % 360) + 360) % 360;
    this.syncRotatorGeometry();
    const rotator = document.getElementById('expanded-map-rotator');
    if (rotator) {
      rotator.style.transform = `rotate(${this.mapRotationDeg}deg)`;
    }
    this.expandedMap?.invalidateSize({ animate: false });
    const slider = document.getElementById('exp-rotate-slider') as HTMLInputElement | null;
    if (slider) {
      slider.value = String(Math.round(this.mapRotationDeg));
    }
    const label = document.getElementById('exp-rotate-label');
    if (label) {
      label.textContent = `${Math.round(this.mapRotationDeg)}°`;
    }
  }

  private ensureExpandedMap() {
    if (this.expandedMap) return;
    const mapContainer = document.getElementById('expanded-leaflet-map');
    if (!mapContainer) return;

    this.expandedMap = L.map(mapContainer, {
      center: [40.7997, -3.9745],
      zoom: 14,
      minZoom: 9,
      maxZoom: 18,
      zoomControl: false,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
      className: 'leaflet-snow-layer',
    }).addTo(this.expandedMap);

    this.expandedMap.on('zoomend', () => {
      const z = this.expandedMap?.getZoom() ?? 14;
      mapContainer.classList.toggle('show-piste-labels', z >= 13);
    });
    mapContainer.classList.add('show-piste-labels');

    this.expandedLayers = L.layerGroup().addTo(this.expandedMap);
  }

  public toggleExpanded(open: boolean) {
    this.isExpanded = open;
    this.expandedOverlay.style.display = open ? 'flex' : 'none';
    if (!open) {
      this.selectionMenu.style.display = 'none';
      return;
    }

    this.ensureExpandedMap();
    this.syncRotatorGeometry();
    this.renderExpandedLayers();
    setTimeout(() => {
      this.syncRotatorGeometry();
      this.expandedMap?.invalidateSize({ animate: false });
      this.fitResortBounds();
    }, 60);
  }

  private fitResortBounds() {
    if (!this.expandedMap) return;
    const allCoords: Array<[number, number]> = [];
    this.pistes.forEach((p) => p.latLngs.forEach((ll) => allCoords.push(ll)));
    this.lifts.forEach((l) => l.latLngs.forEach((ll) => allCoords.push(ll)));

    if (allCoords.length > 0) {
      this.expandedMap.fitBounds(L.latLngBounds(allCoords), { padding: [32, 32] });
    }
  }

  public setResortData(data: ResortDataPayload, projection: GeoProjection, terrain: ProceduralTerrain) {
    this.projection = projection;
    this.terrain = terrain;
    this.baseAltitudeMeters = data.base_altitude || 1860;
    this.summitAltitudeMeters = data.summit_altitude || 2280;

    this.pistes = [];
    this.lifts = [];
    this.pois = [];

    (data.pistes || []).forEach((p) => {
      const geom = p.geometry_geojson;
      if (!geom || geom.type !== 'LineString' || !Array.isArray(geom.coordinates)) return;
      const pType = (p.piste_type || 'downhill').toLowerCase();
      if (pType !== 'downhill' && pType !== 'alpine') return;

      const coords = geom.coordinates;
      if (coords.length < 2) return;
      // Descartar polígonos cerrados (zonas/áreas) donde inicio == fin
      const first = coords[0];
      const last = coords[coords.length - 1];
      if (coords.length > 3 && Math.abs(first[0] - last[0]) < 1e-6 && Math.abs(first[1] - last[1]) < 1e-6) {
        return;
      }

      let lengthMeters = 0;
      const pts: Array<[number, number]> = [];
      const latLngs: Array<[number, number]> = [];

      coords.forEach((pt, idx) => {
        const [x, z] = projection.project(pt[0], pt[1]);
        pts.push([x, z]);
        latLngs.push([pt[1], pt[0]]);
        if (idx > 0) {
          lengthMeters += Math.hypot(x - pts[idx - 1][0], z - pts[idx - 1][1]);
        }
      });

      const diff = (p.difficulty || 'easy').toLowerCase();
      this.pistes.push({
        name: p.name || 'Pista sin nombre',
        difficulty: diff,
        color: this.difficultyColors[diff] || '#0284c7',
        points: pts,
        latLngs,
        lengthMeters: Math.round(lengthMeters),
      });
    });

    (data.lifts || []).forEach((l) => {
      const coords = l.geometry_geojson?.coordinates;
      if (!coords || coords.length < 2) return;
      const pts: Array<[number, number]> = [];
      const latLngs: Array<[number, number]> = [];
      coords.forEach((pt) => {
        const [x, z] = projection.project(pt[0], pt[1]);
        pts.push([x, z]);
        latLngs.push([pt[1], pt[0]]);
      });
      this.lifts.push({
        name: l.name || 'Remonte',
        liftType: l.lift_type || 'chair_lift',
        points: pts,
        latLngs,
      });
    });

    (data.pois || []).forEach((poi) => {
      const [x, z] = projection.project(poi.longitude, poi.latitude);
      this.pois.push({
        name: poi.name,
        category: poi.category,
        x,
        z,
        lat: poi.latitude,
        lon: poi.longitude,
      });
    });

    if (this.isExpanded) {
      this.renderExpandedLayers();
      this.fitResortBounds();
    }
  }

  private renderExpandedLayers() {
    if (!this.expandedMap || !this.expandedLayers) return;
    this.expandedLayers.clearLayers();
    this.skierMarker = null;
    this.targetPin = null;
    this.sessionTrailPolyline = null;
    this.remotePeerMarkers.clear();

    // 1. Pistas clicables con nombre alineado en dirección de la pista y viaje al punto exacto
    this.pistes.forEach((p) => {
      const line = L.polyline(p.latLngs, {
        color: p.color,
        weight: 4.5,
        opacity: 0.9,
      });

      if (p.name && p.name !== 'Pista sin nombre' && p.name !== 'Pista' && p.points.length >= 2) {
        const midIdx = Math.floor(p.points.length / 2);
        const aIdx = Math.max(0, midIdx - 1);
        const bIdx = Math.min(p.points.length - 1, midIdx + 1);
        const dx = p.points[bIdx][0] - p.points[aIdx][0];
        const dz = p.points[bIdx][1] - p.points[aIdx][1];
        let angleDeg = (Math.atan2(dz, dx) * 180) / Math.PI;
        // Mantener texto siempre legible (nunca boca abajo)
        if (angleDeg > 90) angleDeg -= 180;
        if (angleDeg < -90) angleDeg += 180;

        const labelIcon = L.divIcon({
          className: 'piste-map-label',
          iconSize: [0, 0],
          iconAnchor: [0, 0],
          html: `<span class="piste-inline-text" style="transform:translate(-50%,-50%) rotate(${angleDeg.toFixed(1)}deg);color:${p.color};">${p.name}</span>`,
        });
        L.marker(p.latLngs[midIdx], { icon: labelIcon, interactive: false }).addTo(this.expandedLayers!);
      }

      line.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (!this.projection) return;

        // Calcular punto exacto sobre la polilínea más cercano al clic del usuario
        const [clickX, clickZ] = this.projection.project(e.latlng.lng, e.latlng.lat);
        const snapped = this.closestPointOnPolyline(clickX, clickZ, p.points);
        const [snappedLon, snappedLat] = this.projection.unproject(snapped.x, snapped.z);

        // Dibujar marcador visual en el punto exacto seleccionado
        this.showTargetPin(snappedLat, snappedLon);

        const clickedAlt = this.estimateRealAltitude(snapped.x, snapped.z);
        const startAlt = this.estimateRealAltitude(p.points[0][0], p.points[0][1]);
        const endAlt = this.estimateRealAltitude(p.points[p.points.length - 1][0], p.points[p.points.length - 1][1]);

        this.showSelectionMenu({
          kind: 'piste',
          title: p.name,
          badgeText: this.difficultyLabels[p.difficulty] || p.difficulty,
          badgeColor: p.color,
          details: [
            `Punto elegido: ${clickedAlt} m`,
            `Longitud total: ${p.lengthMeters >= 1000 ? `${(p.lengthMeters / 1000).toFixed(2)} km` : `${p.lengthMeters} m`}`,
            `Cota inicio → fin: ${startAlt} m → ${endAlt} m`,
          ],
          x: snapped.x,
          z: snapped.z,
          heading: snapped.heading,
        });
      });

      line.addTo(this.expandedLayers!);
    });

    // 2. Remontes
    this.lifts.forEach((l) => {
      const line = L.polyline(l.latLngs, {
        color: '#475569',
        weight: 2.5,
        dashArray: '6, 5',
        opacity: 0.85,
      });

      line.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        const base = l.points[0];
        const top = l.points[l.points.length - 1];
        const heading = Math.atan2(top[0] - base[0], top[1] - base[1]);
        const baseAlt = this.estimateRealAltitude(base[0], base[1]);
        const topAlt = this.estimateRealAltitude(top[0], top[1]);

        this.showSelectionMenu({
          kind: 'lift',
          title: l.name,
          badgeText: `Remonte · ${l.liftType.replace('_', ' ')}`,
          badgeColor: '#475569',
          details: [
            `Base → Cumbre: ${baseAlt} m → ${topAlt} m`,
            'Te teletransportará a la zona de embarque',
          ],
          x: base[0],
          z: base[1],
          heading,
        });
      });

      line.addTo(this.expandedLayers!);
    });

    // 3. POIs
    this.pois.forEach((poi) => {
      const marker = L.circleMarker([poi.lat, poi.lon], {
        radius: 6,
        color: '#ffffff',
        weight: 2,
        fillColor: '#d97706',
        fillOpacity: 1,
      });

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        const alt = this.estimateRealAltitude(poi.x, poi.z);
        this.showSelectionMenu({
          kind: 'poi',
          title: poi.name,
          badgeText: `POI · ${poi.category}`,
          badgeColor: '#d97706',
          details: [`Altitud aproximada: ${alt} m`],
          x: poi.x,
          z: poi.z,
        });
      });

      marker.addTo(this.expandedLayers!);
    });

    this.updateExpandedSkierMarker();
  }

  private showTargetPin(lat: number, lon: number) {
    if (!this.expandedLayers) return;
    if (this.targetPin) {
      this.expandedLayers.removeLayer(this.targetPin);
      this.targetPin = null;
    }
    this.targetPin = L.circleMarker([lat, lon], {
      radius: 8,
      color: '#ffffff',
      weight: 3,
      fillColor: '#f97316',
      fillOpacity: 1,
    }).addTo(this.expandedLayers);
  }

  private clearTargetPin() {
    if (this.targetPin && this.expandedLayers) {
      this.expandedLayers.removeLayer(this.targetPin);
      this.targetPin = null;
    }
  }

  private closestPointOnPolyline(
    px: number,
    pz: number,
    points: Array<[number, number]>
  ): { x: number; z: number; heading: number } {
    let bestDistSq = Infinity;
    let bestX = points[0][0];
    let bestZ = points[0][1];
    let bestHeading = 0;

    for (let i = 0; i < points.length - 1; i++) {
      const [ax, az] = points[i];
      const [bx, bz] = points[i + 1];
      const abx = bx - ax;
      const abz = bz - az;
      const abLenSq = abx * abx + abz * abz;
      const t = abLenSq > 1e-6 ? Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / abLenSq)) : 0;
      const cx = ax + abx * t;
      const cz = az + abz * t;
      const dSq = (px - cx) * (px - cx) + (pz - cz) * (pz - cz);

      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestX = cx;
        bestZ = cz;
        bestHeading = Math.atan2(abx, abz);
      }
    }

    return { x: bestX, z: bestZ, heading: bestHeading };
  }

  private estimateRealAltitude(x: number, z: number): number {
    if (!this.terrain) return this.baseAltitudeMeters;
    const y = this.terrain.getElevationAt(x, z);
    const range = Math.max(1, this.terrain.verticalDropMeters || 420);
    const norm = Math.max(0, Math.min(1, (y - 14) / range));
    return Math.round(this.baseAltitudeMeters + norm * (this.summitAltitudeMeters - this.baseAltitudeMeters));
  }

  private showSelectionMenu(target: SelectedMapTarget) {
    const actionLabel =
      target.kind === 'piste'
        ? '🎿 Ir a esta pista'
        : target.kind === 'lift'
          ? '🚡 Ir a la base del remonte'
          : '📍 Ir a este punto';

    this.selectionMenu.style.display = 'flex';
    this.selectionMenu.innerHTML = `
      <div class="sel-menu-header">
        <div>
          <span class="sel-badge" style="background:${target.badgeColor};">${target.badgeText}</span>
          <h3>${target.title}</h3>
        </div>
        <button class="sel-close-btn" id="sel-menu-cancel">✕</button>
      </div>
      <div class="sel-menu-details">
        ${target.details.map((d) => `<div>• ${d}</div>`).join('')}
      </div>
      <div class="sel-menu-actions">
        <button class="sel-btn-cancel" id="sel-btn-cancel">Cancelar</button>
        <button class="sel-btn-go" id="sel-btn-go">${actionLabel}</button>
      </div>
    `;

    this.selectionMenu.querySelector('#sel-menu-cancel')?.addEventListener('click', () => {
      this.selectionMenu.style.display = 'none';
      this.clearTargetPin();
    });
    this.selectionMenu.querySelector('#sel-btn-cancel')?.addEventListener('click', () => {
      this.selectionMenu.style.display = 'none';
      this.clearTargetPin();
    });
    this.selectionMenu.querySelector('#sel-btn-go')?.addEventListener('click', () => {
      this.selectionMenu.style.display = 'none';
      this.clearTargetPin();
      this.toggleExpanded(false);
      this.onFastTravel(target.x, target.z, target.heading);
    });
  }

  public setSessionTrailEnabled(enabled: boolean) {
    this.showSessionTrail = enabled;
    if (!enabled && this.sessionTrailPolyline && this.expandedLayers) {
      this.expandedLayers.removeLayer(this.sessionTrailPolyline);
      this.sessionTrailPolyline = null;
    }
    this.drawMini();
    if (this.isExpanded) {
      this.updateExpandedSkierMarker();
    }
  }

  public setRemotePeers(peers: Array<{ userId: string; name: string; x: number; z: number }>) {
    this.remotePeers = peers;
  }

  public update(skierX: number, skierZ: number, heading: number) {
    this.skierX = skierX;
    this.skierZ = skierZ;
    this.skierHeading = heading;

    if (this.projection) {
      const last = this.sessionTrailXZ[this.sessionTrailXZ.length - 1];
      const distSq = last ? (skierX - last[0]) ** 2 + (skierZ - last[1]) ** 2 : Infinity;
      if (distSq >= 64 && distSq <= 3600) {
        this.sessionTrailXZ.push([skierX, skierZ]);
        const [lon, lat] = this.projection.unproject(skierX, skierZ);
        this.sessionTrailLatLngs.push([lat, lon]);
      } else if (!last) {
        this.sessionTrailXZ.push([skierX, skierZ]);
        const [lon, lat] = this.projection.unproject(skierX, skierZ);
        this.sessionTrailLatLngs.push([lat, lon]);
      }
    }

    this.drawMini();
    if (this.isExpanded) {
      this.updateExpandedSkierMarker();
    }
  }

  private updateExpandedSkierMarker() {
    if (!this.expandedMap || !this.expandedLayers || !this.projection) return;
    if (this.showSessionTrail && this.sessionTrailLatLngs.length >= 2) {
      if (!this.sessionTrailPolyline) {
        this.sessionTrailPolyline = L.polyline(this.sessionTrailLatLngs, {
          color: '#f97316',
          weight: 3.5,
          opacity: 0.9,
          dashArray: '6 4',
          interactive: false,
        }).addTo(this.expandedLayers);
      } else {
        this.sessionTrailPolyline.setLatLngs(this.sessionTrailLatLngs);
      }
    }
    const [lon, lat] = this.projection.unproject(this.skierX, this.skierZ);
    const deg = (-Math.atan2(Math.sin(this.skierHeading), Math.cos(this.skierHeading)) * 180) / Math.PI + 180;

    const icon = L.divIcon({
      className: 'skier-map-arrow-icon',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
      html: `<div style="transform:rotate(${deg}deg);width:22px;height:22px;display:flex;align-items:center;justify-content:center;">
        <svg width="20" height="20" viewBox="0 0 24 24"><path d="M12 2L20 21L12 16L4 21Z" fill="#0284c7" stroke="#ffffff" stroke-width="2"/></svg>
      </div>`,
    });

    if (!this.skierMarker) {
      this.skierMarker = L.marker([lat, lon], { icon, zIndexOffset: 1000 }).addTo(this.expandedLayers);
    } else {
      this.skierMarker.setLatLng([lat, lon]);
      this.skierMarker.setIcon(icon);
    }

    const activeIds = new Set(this.remotePeers.map((p) => p.userId));
    this.remotePeerMarkers.forEach((m, id) => {
      if (!activeIds.has(id)) {
        this.expandedLayers?.removeLayer(m);
        this.remotePeerMarkers.delete(id);
      }
    });
    this.remotePeers.forEach((p) => {
      const [pLon, pLat] = this.projection!.unproject(p.x, p.z);
      const existing = this.remotePeerMarkers.get(p.userId);
      if (existing) {
        existing.setLatLng([pLat, pLon]);
      } else {
        const peerIcon = L.divIcon({
          className: 'remote-peer-map-icon',
          iconSize: [18, 18],
          iconAnchor: [9, 9],
          html: `<div style="width:14px;height:14px;border-radius:50%;background:#10b981;border:2px solid #ffffff;box-shadow:0 0 8px rgba(16,185,129,0.9);"></div>`,
        });
        const marker = L.marker([pLat, pLon], { icon: peerIcon, zIndexOffset: 900 })
          .bindTooltip(p.name, { permanent: true, direction: 'top', offset: [0, -8] })
          .addTo(this.expandedLayers!);
        this.remotePeerMarkers.set(p.userId, marker);
      }
    });
  }

  private drawMini() {
    const ctx = this.miniCtx;
    const w = this.miniCanvas.width;
    const h = this.miniCanvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(11, 19, 32, 0.92)';
    ctx.fillRect(0, 0, w, h);

    const span = this.miniSpanMeters;
    const scale = w / span;
    const toPx = (wx: number, wz: number): [number, number] => [
      w / 2 + (wx - this.skierX) * scale,
      h / 2 + (wz - this.skierZ) * scale,
    ];

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.6;
    this.pistes.forEach((p) => {
      ctx.strokeStyle = p.difficulty === 'advanced' || p.difficulty === 'expert' ? '#94a3b8' : p.color;
      ctx.beginPath();
      p.points.forEach(([wx, wz], idx) => {
        const [px, py] = toPx(wx, wz);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    });

    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = '#cbd5e1';
    this.lifts.forEach((l) => {
      ctx.beginPath();
      l.points.forEach(([wx, wz], idx) => {
        const [px, py] = toPx(wx, wz);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    });
    ctx.restore();

    if (this.showSessionTrail && this.sessionTrailXZ.length >= 2) {
      ctx.save();
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 2.0;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      this.sessionTrailXZ.forEach(([wx, wz], idx) => {
        const [px, py] = toPx(wx, wz);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle = '#fbbf24';
    this.pois.forEach((poi) => {
      const [px, py] = toPx(poi.x, poi.z);
      if (px >= 0 && px <= w && py >= 0 && py <= h) {
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    this.remotePeers.forEach((peer) => {
      const [px, py] = toPx(peer.x, peer.z);
      if (px >= -6 && px <= w + 6 && py >= -6 && py <= h + 6) {
        ctx.fillStyle = '#10b981';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    });

    const angle = Math.atan2(Math.sin(this.skierHeading), Math.cos(this.skierHeading));
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-angle + Math.PI);
    ctx.fillStyle = '#38bdf8';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5.5);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-5, 5.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
