import * as THREE from 'three';
import { ProceduralTerrain } from './ProceduralTerrain.js';
import { GeoProjection } from './GeoProjection.js';
import { OSMResortPOI, OSMSkiLift, OSMSkiPiste } from './ResortDataService.js';
import { JunctionSignEntry, PisteDecoration } from './PisteDecoration.js';

interface PisteCenterline {
  name: string;
  number: string;
  difficulty: string;
  halfWidth: number;
  color: number;
  isPolygon: boolean;
  isConnector: boolean;
  points: THREE.Vector3[];
  mainDir: THREE.Vector2;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface GroomedPad {
  x: number;
  z: number;
  radius: number;
  dirX: number;
  dirZ: number;
}

export interface PisteSurfaceMap {
  texture: THREE.DataTexture;
  bounds: THREE.Vector4; // (minX, minZ, invSpanX, invSpanZ)
}

const MASK_SIZE = 2048;
const AUX_SIZE = 1024;

/**
 * Generador procedural de pistas de esquí a partir de OpenStreetMap:
 * - Distingue entre pistas lineales (LineString abierto) y áreas pisadas (polígonos cerrados OSM).
 * - Pinta también tramos de interconexión entre pistas, enlaces a embarques/desembarques de remontes,
 *   trazas pisadas de telesquís/cintas/telecuerdas y explanadas de servicios (POIs).
 * - Rasteriza todo el dominio pisado en una textura RGBA de alta resolución (máscara SDF + campo
 *   direccional + dificultad) que se funde directamente en el shader PBR del terreno.
 */
export class ProceduralPistes {
  public group: THREE.Group = new THREE.Group();
  private centerlines: PisteCenterline[] = [];
  private groomedPads: GroomedPad[] = [];
  private surfaceTexture: THREE.DataTexture | null = null;
  private surfaceBounds = new THREE.Vector4(-1000, -1000, 1 / 2000, 1 / 2000);
  private maskLookupGrid: Uint8Array | null = null;
  private liftTerminals: Array<{ x: number; z: number }> = [];
  private aerialHighlight = false;

  private difficultyColors: Record<string, number> = {
    novice: 0x10b981,
    easy: 0x0284c7,
    intermediate: 0xef4444,
    advanced: 0x0f172a,
    expert: 0x0f172a,
  };

  constructor(
    terrain: ProceduralTerrain,
    projection: GeoProjection,
    pistes: OSMSkiPiste[],
    lifts: OSMSkiLift[] = [],
    pois: OSMResortPOI[] = []
  ) {
    this.buildPistesFromOSM(terrain, projection, pistes, lifts, pois);
  }

  public rebuild(
    terrain: ProceduralTerrain,
    projection: GeoProjection,
    pistes: OSMSkiPiste[],
    lifts: OSMSkiLift[] = [],
    pois: OSMResortPOI[] = []
  ) {
    while (this.group.children.length > 0) {
      const child = this.group.children[0] as THREE.Mesh;
      this.group.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    }
    if (this.surfaceTexture) {
      this.surfaceTexture.dispose();
      this.surfaceTexture = null;
    }

    this.buildPistesFromOSM(terrain, projection, pistes, lifts, pois);
  }

  public getSurfaceMap(): PisteSurfaceMap | null {
    if (!this.surfaceTexture) return null;
    return {
      texture: this.surfaceTexture,
      bounds: this.surfaceBounds,
    };
  }

  public getPisteMaterials(): THREE.ShaderMaterial[] {
    return [];
  }

  public setAerialHighlight(enabled: boolean) {
    this.aerialHighlight = enabled;
  }

  public isAerialHighlight(): boolean {
    return this.aerialHighlight;
  }

  private getBaseWidth(diffKey: string, pisteName: string, pisteType = 'downhill'): number {
    if (pisteType === 'connection' || pisteType === 'link') return 12;
    const nameLower = (pisteName || '').toLowerCase();
    if (nameLower.includes('prado') || nameLower.includes('debutantes') || nameLower.includes('pradera')) return 28;
    if (nameLower.includes('loma') || nameLower.includes('estadio')) return 22;

    switch (diffKey) {
      case 'novice':
        return 24;
      case 'easy':
        return 20;
      case 'intermediate':
        return 17;
      case 'advanced':
      case 'expert':
        return 14;
      default:
        return 18;
    }
  }

  private getDifficultyCode(diffKey: string): number {
    switch (diffKey) {
      case 'novice':
        return 64;
      case 'easy':
        return 128;
      case 'intermediate':
        return 192;
      case 'advanced':
      case 'expert':
        return 255;
      default:
        return 128;
    }
  }

  private pointInPolygon(x: number, z: number, pts: THREE.Vector3[]): boolean {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x;
      const zi = pts[i].z;
      const xj = pts[j].x;
      const zj = pts[j].z;
      const intersect = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-9) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  private distanceToPolygonEdgesSq(x: number, z: number, pts: THREE.Vector3[]): number {
    let bestSq = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const lenSq = abx * abx + abz * abz;
      const t = lenSq > 1e-5 ? Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / lenSq)) : 0;
      const px = a.x + t * abx;
      const pz = a.z + t * abz;
      const dSq = (x - px) * (x - px) + (z - pz) * (z - pz);
      if (dSq < bestSq) bestSq = dSq;
    }
    return bestSq;
  }

  private findClosestPiste(x: number, z: number, extraMargin = 4.5): PisteCenterline | null {
    let best: PisteCenterline | null = null;
    let bestDistSq = Infinity;

    for (let i = 0; i < this.centerlines.length; i++) {
      const p = this.centerlines[i];
      const pad = p.halfWidth + extraMargin;
      if (x < p.minX - pad || x > p.maxX + pad || z < p.minZ - pad || z > p.maxZ + pad) continue;

      if (p.isPolygon) {
        if (this.pointInPolygon(x, z, p.points)) {
          if (!best || ((best.name === 'Pista' || best.isConnector) && p.name !== 'Pista')) {
            best = p;
            bestDistSq = 0;
          }
          continue;
        }
        if (extraMargin > 0) {
          const edgeSq = this.distanceToPolygonEdgesSq(x, z, p.points);
          if (edgeSq <= extraMargin * extraMargin && edgeSq < bestDistSq) {
            bestDistSq = edgeSq;
            best = p;
          }
        }
        continue;
      }

      const maxDistSq = pad * pad;
      for (let j = 0; j < p.points.length - 1; j++) {
        const a = p.points[j];
        const b = p.points[j + 1];
        const abx = b.x - a.x;
        const abz = b.z - a.z;
        const lenSq = abx * abx + abz * abz;
        const t = lenSq > 1e-5 ? Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / lenSq)) : 0;
        const px = a.x + t * abx;
        const pz = a.z + t * abz;
        const dSq = (x - px) * (x - px) + (z - pz) * (z - pz);
        if (dSq <= maxDistSq) {
          // Priorizar pistas principales sobre conectores automáticos cuando ambos están debajo
          const prefersNew = !best || (best.isConnector && !p.isConnector) || (best.isConnector === p.isConnector && dSq < bestDistSq);
          if (prefersNew) {
            bestDistSq = dSq;
            best = p;
          }
        }
      }
    }

    return best;
  }

  public getPisteAt(x: number, z: number): { name: string; number: string; difficulty: string; color: number } | null {
    const best = this.findClosestPiste(x, z, 3.0);
    if (best) {
      return { name: best.name, number: best.number, difficulty: best.difficulty, color: best.color };
    }
    if (this.sampleMaskAt(x, z) > 0.45) {
      return { name: 'Enlace / Zona pisada', number: '•', difficulty: 'easy', color: 0x0284c7 };
    }
    return null;
  }

  public isPointNearPiste(x: number, z: number, extraMargin = 5.0): boolean {
    if (this.sampleMaskAt(x, z) > 0.12) return true;
    return this.findClosestPiste(x, z, extraMargin) !== null;
  }

  public sampleMaskAt(x: number, z: number): number {
    if (!this.maskLookupGrid) return 0;
    const u = (x - this.surfaceBounds.x) * this.surfaceBounds.z;
    const v = (z - this.surfaceBounds.y) * this.surfaceBounds.w;
    if (u < 0 || u >= 1 || v < 0 || v >= 1) return 0;
    const px = Math.min(AUX_SIZE - 1, Math.max(0, Math.floor(u * AUX_SIZE)));
    const py = Math.min(AUX_SIZE - 1, Math.max(0, Math.floor(v * AUX_SIZE)));
    return this.maskLookupGrid[py * AUX_SIZE + px] / 255;
  }

  private extractPisteNumber(name: string, fallbackIndex: number): string {
    const match = (name || '').match(/\b(\d{1,3})\b/);
    return match ? match[1] : String(fallbackIndex);
  }

  private addCenterlineEntry(
    terrain: ProceduralTerrain,
    rawVectors: THREE.Vector3[],
    opts: {
      name: string;
      number: string;
      difficulty: string;
      halfWidth: number;
      color: number;
      isPolygon: boolean;
      isConnector: boolean;
    }
  ) {
    if (rawVectors.length < 2) return;

    let points: THREE.Vector3[];
    const mainDir = new THREE.Vector2(0, 1);

    if (opts.isPolygon) {
      const closedDist = Math.hypot(
        rawVectors[0].x - rawVectors[rawVectors.length - 1].x,
        rawVectors[0].z - rawVectors[rawVectors.length - 1].z
      );
      points = closedDist < 0.5 ? rawVectors.slice(0, -1) : rawVectors;
      if (points.length < 3) return;
      let highest = points[0];
      let lowest = points[0];
      for (const p of points) {
        if (p.y > highest.y) highest = p;
        if (p.y < lowest.y) lowest = p;
      }
      const dx = lowest.x - highest.x;
      const dz = lowest.z - highest.z;
      const len = Math.hypot(dx, dz);
      if (len > 1) mainDir.set(dx / len, dz / len);
    } else {
      const curve = new THREE.CatmullRomCurve3(rawVectors);
      const sampleCount = opts.isConnector
        ? Math.max(6, Math.min(24, rawVectors.length * 4))
        : Math.max(20, Math.min(160, rawVectors.length * 3));
      points = curve.getPoints(sampleCount);
      for (const p of points) {
        p.y = terrain.getMeshElevationAt(p.x, p.z);
      }
      const startP = points[0];
      const endP = points[points.length - 1];
      const sign = startP.y >= endP.y ? 1 : -1;
      const dx = (endP.x - startP.x) * sign;
      const dz = (endP.z - startP.z) * sign;
      const len = Math.hypot(dx, dz);
      if (len > 1) mainDir.set(dx / len, dz / len);
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }

    this.centerlines.push({
      name: opts.name,
      number: opts.number,
      difficulty: opts.difficulty,
      halfWidth: opts.halfWidth,
      color: opts.color,
      isPolygon: opts.isPolygon,
      isConnector: opts.isConnector,
      points,
      mainDir,
      minX,
      maxX,
      minZ,
      maxZ,
    });
  }

  private buildPistesFromOSM(
    terrain: ProceduralTerrain,
    projection: GeoProjection,
    pistes: OSMSkiPiste[],
    lifts: OSMSkiLift[],
    pois: OSMResortPOI[]
  ) {
    this.centerlines = [];
    this.groomedPads = [];
    this.liftTerminals = [];

    lifts.forEach((lift) => {
      const coords = lift.geometry_geojson?.coordinates;
      if (!coords || coords.length < 2) return;
      const [sx, sz] = projection.project(coords[0][0], coords[0][1]);
      const [ex, ez] = projection.project(coords[coords.length - 1][0], coords[coords.length - 1][1]);
      this.liftTerminals.push({ x: sx, z: sz }, { x: ex, z: ez });
    });

    // 1. Cargar todas las pistas y tramos de enlace explícitos de OSM (incl. connection / link / ski_route)
    pistes.forEach((piste, index) => {
      const geom = piste.geometry_geojson;
      if (!geom || !Array.isArray(geom.coordinates) || geom.coordinates.length === 0) return;

      const pType = (piste.piste_type || 'downhill').toLowerCase();
      // Excluir únicamente rutas puras de raquetas o trineo si vinieran etiquetadas
      if (pType === 'hike' || pType === 'sled' || pType === 'sleigh') return;

      const diffKey = (piste.difficulty || 'easy').toLowerCase();
      const pisteColor = this.difficultyColors[diffKey] || 0x0284c7;
      const baseWidth = this.getBaseWidth(diffKey, piste.name, pType);
      const pisteNumber = this.extractPisteNumber(piste.name, index + 1);
      const isOsmConnector = pType === 'connection' || pType === 'link';

      const gType = (geom.type || 'LineString').toLowerCase();
      const coordSets: number[][][] = [];
      if (gType === 'polygon') {
        if (Array.isArray((geom.coordinates as any)[0])) coordSets.push((geom.coordinates as any)[0]);
      } else if (gType === 'multilinestring') {
        (geom.coordinates as any[]).forEach((line) => {
          if (Array.isArray(line)) coordSets.push(line);
        });
      } else {
        coordSets.push(geom.coordinates as unknown as number[][]);
      }

      coordSets.forEach((coords) => {
        if (!coords || coords.length < 2) return;
        const rawVectors: THREE.Vector3[] = coords.map((pt) => {
          const [x, z] = projection.project(pt[0], pt[1]);
          const y = terrain.getMeshElevationAt(x, z);
          return new THREE.Vector3(x, y, z);
        });

        const first = rawVectors[0];
        const last = rawVectors[rawVectors.length - 1];
        const closedDist = Math.hypot(first.x - last.x, first.z - last.z);
        const isPolygon = (gType === 'polygon') || (rawVectors.length >= 4 && closedDist < 5.0);

        this.addCenterlineEntry(terrain, rawVectors, {
          name: piste.name || (isOsmConnector ? 'Enlace' : `Pista ${pisteNumber}`),
          number: pisteNumber,
          difficulty: diffKey,
          halfWidth: baseWidth * 0.52,
          color: pisteColor,
          isPolygon,
          isConnector: isOsmConnector,
        });
      });
    });

    // 2. Añadir tramos de interconexión, explanadas de remontes, trazas de arrastres y enlaces de POIs
    this.buildInterconnectionsAndPads(terrain, projection, lifts, pois);

    // 3. Calcular bounds globales tras incorporar todos los enlaces y explanadas
    let globalMinX = Infinity;
    let globalMaxX = -Infinity;
    let globalMinZ = Infinity;
    let globalMaxZ = -Infinity;

    for (const p of this.centerlines) {
      const m = p.isPolygon ? 12 : p.halfWidth * 2;
      if (p.minX - m < globalMinX) globalMinX = p.minX - m;
      if (p.maxX + m > globalMaxX) globalMaxX = p.maxX + m;
      if (p.minZ - m < globalMinZ) globalMinZ = p.minZ - m;
      if (p.maxZ + m > globalMaxZ) globalMaxZ = p.maxZ + m;
    }
    for (const pad of this.groomedPads) {
      if (pad.x - pad.radius < globalMinX) globalMinX = pad.x - pad.radius;
      if (pad.x + pad.radius > globalMaxX) globalMaxX = pad.x + pad.radius;
      if (pad.z - pad.radius < globalMinZ) globalMinZ = pad.z - pad.radius;
      if (pad.z + pad.radius > globalMaxZ) globalMaxZ = pad.z + pad.radius;
    }

    if (!isFinite(globalMinX) || (this.centerlines.length === 0 && this.groomedPads.length === 0)) {
      globalMinX = -terrain.width * 0.5;
      globalMaxX = terrain.width * 0.5;
      globalMinZ = -terrain.depth * 0.5;
      globalMaxZ = terrain.depth * 0.5;
    } else {
      const pad = 70;
      globalMinX -= pad;
      globalMaxX += pad;
      globalMinZ -= pad;
      globalMaxZ += pad;
    }

    const spanX = Math.max(300, globalMaxX - globalMinX);
    const spanZ = Math.max(300, globalMaxZ - globalMinZ);
    this.surfaceBounds.set(globalMinX, globalMinZ, 1 / spanX, 1 / spanZ);

    this.rasterizeSurfaceMap(globalMinX, globalMinZ, spanX, spanZ);
    this.placeDecorations(terrain);
    this.buildJunctionSignposts(terrain);
  }

  /**
   * Genera enlaces pisados automáticos para asegurar continuidad completa en la estación:
   * - Explanadas en terminales de embarque y desembarque + conexión a la pista más cercana.
   * - Trazas pisadas bajo remontes de superficie (telesquís, cintas y telecuerdas).
   * - Puentes de interconexión entre extremos próximos de pistas desconectadas.
   * - Explanadas y acceso pisado en servicios/refugios (POIs).
   */
  private buildInterconnectionsAndPads(
    terrain: ProceduralTerrain,
    projection: GeoProjection,
    lifts: OSMSkiLift[],
    pois: OSMResortPOI[]
  ) {
    const primaryPistes = [...this.centerlines];

    const isInsideAnyPrimaryPolygon = (x: number, z: number, excludeIdx = -1): boolean => {
      for (let i = 0; i < primaryPistes.length; i++) {
        if (i === excludeIdx) continue;
        const p = primaryPistes[i];
        if (!p.isPolygon) continue;
        if (x < p.minX || x > p.maxX || z < p.minZ || z > p.maxZ) continue;
        if (this.pointInPolygon(x, z, p.points)) return true;
      }
      return false;
    };

    const findNearestPointOnPrimary = (
      x: number,
      z: number,
      excludeIdx = -1
    ): { pt: THREE.Vector3; dist: number; piste: PisteCenterline } | null => {
      let bestPt: THREE.Vector3 | null = null;
      let bestDistSq = Infinity;
      let bestPiste: PisteCenterline | null = null;

      for (let i = 0; i < primaryPistes.length; i++) {
        if (i === excludeIdx) continue;
        const p = primaryPistes[i];
        const pts = p.points;
        const limit = p.isPolygon ? pts.length : pts.length - 1;
        for (let j = 0; j < limit; j++) {
          const a = pts[j];
          const b = pts[(j + 1) % pts.length];
          const abx = b.x - a.x;
          const abz = b.z - a.z;
          const lenSq = abx * abx + abz * abz;
          const t = lenSq > 1e-5 ? Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / lenSq)) : 0;
          const px = a.x + t * abx;
          const pz = a.z + t * abz;
          const dSq = (x - px) * (x - px) + (z - pz) * (z - pz);
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestPt = new THREE.Vector3(px, terrain.getMeshElevationAt(px, pz), pz);
            bestPiste = p;
          }
        }
      }

      if (!bestPt || !bestPiste) return null;
      return { pt: bestPt, dist: Math.sqrt(bestDistSq), piste: bestPiste };
    };

    const addGroomedLink = (from: THREE.Vector3, to: THREE.Vector3, halfWidth: number, label: string) => {
      const mid = from.clone().lerp(to, 0.5);
      mid.y = terrain.getMeshElevationAt(mid.x, mid.z);
      this.addCenterlineEntry(terrain, [from.clone(), mid, to.clone()], {
        name: label,
        number: '•',
        difficulty: 'easy',
        halfWidth,
        color: 0x0284c7,
        isPolygon: false,
        isConnector: true,
      });
    };

    // A. Terminales, trazas de superficie y enlaces de remontes
    lifts.forEach((lift) => {
      const coords = lift.geometry_geojson?.coordinates;
      if (!coords || coords.length < 2) return;

      const liftPts = coords.map((pt) => {
        const [x, z] = projection.project(pt[0], pt[1]);
        return new THREE.Vector3(x, terrain.getMeshElevationAt(x, z), z);
      });

      const start = liftPts[0];
      const end = liftPts[liftPts.length - 1];
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const len = Math.hypot(dx, dz) || 1;
      const dirX = dx / len;
      const dirZ = dz / len;

      const lType = (lift.lift_type || '').toLowerCase();
      const isSurfaceLift = ['drag_lift', 't-bar', 'platter', 'rope_tow', 'magic_carpet'].includes(lType);
      const padRadius = isSurfaceLift ? 9.5 : 13.5;

      // Explanadas de embarque y desembarque
      this.groomedPads.push({ x: start.x, z: start.z, radius: padRadius, dirX, dirZ });
      this.groomedPads.push({ x: end.x, z: end.z, radius: padRadius, dirX: -dirX, dirZ: -dirZ });

      // Si es remonte de superficie, la propia línea de subida va pisada
      if (isSurfaceLift && len > 15) {
        this.addCenterlineEntry(terrain, liftPts, {
          name: `Remonte ${lift.name || ''}`.trim(),
          number: '•',
          difficulty: 'novice',
          halfWidth: lType === 'magic_carpet' ? 4.5 : 4.0,
          color: 0x10b981,
          isPolygon: false,
          isConnector: true,
        });
      }

      // Enlazar embarque y desembarque con la pista más cercana (si 6m .. 95m y fuera de polígonos ya pisados)
      [start, end].forEach((termPt) => {
        if (isInsideAnyPrimaryPolygon(termPt.x, termPt.z)) return;
        const nearest = findNearestPointOnPrimary(termPt.x, termPt.z);
        if (!nearest) return;
        if (nearest.dist > 6 && nearest.dist <= 95) {
          const slopeRatio = Math.abs(nearest.pt.y - termPt.y) / nearest.dist;
          if (slopeRatio < 0.72) {
            addGroomedLink(termPt, nearest.pt, 5.8, `Enlace ${lift.name || 'Remonte'}`);
          }
        }
      });
    });

    // B. Puentes de interconexión entre extremos próximos de pistas desconectadas (6m .. 62m)
    const bridgedKeys = new Set<string>();
    primaryPistes.forEach((p, idx) => {
      if (p.isPolygon || p.points.length < 2) return;
      const endpoints = [p.points[0], p.points[p.points.length - 1]];

      endpoints.forEach((ep) => {
        if (isInsideAnyPrimaryPolygon(ep.x, ep.z, idx)) return;
        const nearest = findNearestPointOnPrimary(ep.x, ep.z, idx);
        if (!nearest) return;
        if (nearest.dist > 6 && nearest.dist <= 62) {
          const slopeRatio = Math.abs(nearest.pt.y - ep.y) / nearest.dist;
          if (slopeRatio >= 0.65) return;

          const kx1 = Math.round(ep.x / 10);
          const kz1 = Math.round(ep.z / 10);
          const kx2 = Math.round(nearest.pt.x / 10);
          const kz2 = Math.round(nearest.pt.z / 10);
          const key = kx1 < kx2 || (kx1 === kx2 && kz1 <= kz2)
            ? `${kx1},${kz1}-${kx2},${kz2}`
            : `${kx2},${kz2}-${kx1},${kz1}`;

          if (bridgedKeys.has(key)) return;
          bridgedKeys.add(key);

          addGroomedLink(ep, nearest.pt, 5.5, `Interconexión ${p.name}`);
        }
      });
    });

    // C. Explanadas y accesos pisados en POIs de servicio (cafeterías, alquiler, taquillas, escuelas)
    const serviceCats = new Set(['restaurant', 'cafe', 'hotel', 'rental', 'ski_school', 'first_aid', 'info']);
    pois.forEach((poi) => {
      if (!serviceCats.has((poi.category || '').toLowerCase())) return;
      const [px, pz] = projection.project(poi.longitude, poi.latitude);
      const py = terrain.getMeshElevationAt(px, pz);
      const poiPt = new THREE.Vector3(px, py, pz);

      const nearest = findNearestPointOnPrimary(px, pz);
      const dirX = nearest ? (nearest.pt.x - px) / Math.max(1, nearest.dist) : 0;
      const dirZ = nearest ? (nearest.pt.z - pz) / Math.max(1, nearest.dist) : 1;

      this.groomedPads.push({ x: px, z: pz, radius: 12.5, dirX, dirZ });

      if (!isInsideAnyPrimaryPolygon(px, pz) && nearest && nearest.dist > 10 && nearest.dist <= 75) {
        const slopeRatio = Math.abs(nearest.pt.y - py) / nearest.dist;
        if (slopeRatio < 0.65) {
          addGroomedLink(poiPt, nearest.pt, 4.8, `Acceso ${poi.name}`);
        }
      }
    });
  }

  private rasterizeSurfaceMap(minX: number, minZ: number, spanX: number, spanZ: number) {
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = MASK_SIZE;
    maskCanvas.height = MASK_SIZE;
    const maskCtx = maskCanvas.getContext('2d')!;

    const dirCanvas = document.createElement('canvas');
    dirCanvas.width = AUX_SIZE;
    dirCanvas.height = AUX_SIZE;
    const dirCtx = dirCanvas.getContext('2d')!;

    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = AUX_SIZE;
    diffCanvas.height = AUX_SIZE;
    const diffCtx = diffCanvas.getContext('2d')!;

    const toMaskX = (wx: number) => ((wx - minX) / spanX) * MASK_SIZE;
    const toMaskY = (wz: number) => ((wz - minZ) / spanZ) * MASK_SIZE;
    const toAuxX = (wx: number) => ((wx - minX) / spanX) * AUX_SIZE;
    const toAuxY = (wz: number) => ((wz - minZ) / spanZ) * AUX_SIZE;

    const pxPerMeterMask = MASK_SIZE / Math.max(spanX, spanZ);
    const pxPerMeterAux = AUX_SIZE / Math.max(spanX, spanZ);

    // 1. Máscara SDF en 2 pasadas: halo exterior de talud + interior nítido pisado
    maskCtx.fillStyle = '#000000';
    maskCtx.fillRect(0, 0, MASK_SIZE, MASK_SIZE);

    const drawAllMask = (ctx: CanvasRenderingContext2D, extraMeters: number, color: string) => {
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Explanadas circulares pisadas (remontes y servicios)
      for (const pad of this.groomedPads) {
        ctx.beginPath();
        ctx.arc(
          toMaskX(pad.x),
          toMaskY(pad.z),
          Math.max(2, (pad.radius + extraMeters * 0.5) * pxPerMeterMask),
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      // Polígonos cerrados
      for (const p of this.centerlines) {
        if (!p.isPolygon) continue;
        ctx.beginPath();
        p.points.forEach((pt, idx) => {
          const x = toMaskX(pt.x);
          const y = toMaskY(pt.z);
          if (idx === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fill();
        if (extraMeters > 0) {
          ctx.lineWidth = Math.max(2, extraMeters * pxPerMeterMask);
          ctx.stroke();
        }
      }

      // Líneas centrales abiertas y tramos de interconexión
      for (const p of this.centerlines) {
        if (p.isPolygon) continue;
        ctx.beginPath();
        p.points.forEach((pt, idx) => {
          const x = toMaskX(pt.x);
          const y = toMaskY(pt.z);
          if (idx === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.lineWidth = Math.max(3, (p.halfWidth * 2 + extraMeters) * pxPerMeterMask);
        ctx.stroke();
      }
    };

    // Halo exterior suave para el talud / borde prensado de la pisanieves (#555555 ~ 0.33)
    maskCtx.save();
    maskCtx.filter = 'blur(4px)';
    drawAllMask(maskCtx, 8.5, '#555555');
    maskCtx.restore();

    // Superficie interior pisada nítida
    maskCtx.save();
    maskCtx.filter = 'blur(1px)';
    drawAllMask(maskCtx, 0, '#ffffff');
    maskCtx.restore();

    // 2. Campo direccional cuesta abajo (pintando conectores/explanadas primero, pistas principales encima)
    dirCtx.fillStyle = 'rgb(128, 255, 0)';
    dirCtx.fillRect(0, 0, AUX_SIZE, AUX_SIZE);
    dirCtx.lineCap = 'round';
    dirCtx.lineJoin = 'round';

    for (const pad of this.groomedPads) {
      const gx = Math.round(128 + pad.dirX * 126);
      const gz = Math.round(128 + pad.dirZ * 126);
      dirCtx.fillStyle = `rgb(${gx}, ${gz}, 0)`;
      dirCtx.beginPath();
      dirCtx.arc(toAuxX(pad.x), toAuxY(pad.z), Math.max(3, (pad.radius + 6) * pxPerMeterAux), 0, Math.PI * 2);
      dirCtx.fill();
    }

    const drawDirectionLines = (connectorsOnly: boolean) => {
      for (const p of this.centerlines) {
        if (p.isPolygon || p.isConnector !== connectorsOnly) continue;
        const downhill = p.points[0].y >= p.points[p.points.length - 1].y ? 1 : -1;
        dirCtx.lineWidth = Math.max(4, (p.halfWidth * 2 + 11) * pxPerMeterAux);
        for (let i = 0; i < p.points.length - 1; i++) {
          const a = p.points[i];
          const b = p.points[i + 1];
          const dx = (b.x - a.x) * downhill;
          const dz = (b.z - a.z) * downhill;
          const len = Math.hypot(dx, dz);
          if (len < 0.05) continue;
          const nx = dx / len;
          const nz = dz / len;
          const gx = Math.round(128 + nx * 126);
          const gz = Math.round(128 + nz * 126);
          dirCtx.strokeStyle = `rgb(${gx}, ${gz}, 0)`;
          dirCtx.beginPath();
          dirCtx.moveTo(toAuxX(a.x), toAuxY(a.z));
          dirCtx.lineTo(toAuxX(b.x), toAuxY(b.z));
          dirCtx.stroke();
        }
      }
    };

    // Polígonos y conectores debajo; trazados principales encima para orientar fresado dominante
    for (const p of this.centerlines) {
      if (!p.isPolygon) continue;
      const gx = Math.round(128 + p.mainDir.x * 126);
      const gz = Math.round(128 + p.mainDir.y * 126);
      const col = `rgb(${gx}, ${gz}, 0)`;
      dirCtx.fillStyle = col;
      dirCtx.strokeStyle = col;
      dirCtx.lineWidth = Math.max(4, 12 * pxPerMeterAux);
      dirCtx.beginPath();
      p.points.forEach((pt, idx) => {
        const x = toAuxX(pt.x);
        const y = toAuxY(pt.z);
        if (idx === 0) dirCtx.moveTo(x, y);
        else dirCtx.lineTo(x, y);
      });
      dirCtx.closePath();
      dirCtx.fill();
      dirCtx.stroke();
    }
    drawDirectionLines(true);
    drawDirectionLines(false);

    // 3. Dificultad para Vista Aérea
    diffCtx.fillStyle = '#000000';
    diffCtx.fillRect(0, 0, AUX_SIZE, AUX_SIZE);
    diffCtx.lineCap = 'round';
    diffCtx.lineJoin = 'round';

    for (const pad of this.groomedPads) {
      diffCtx.fillStyle = 'rgb(128, 0, 0)';
      diffCtx.beginPath();
      diffCtx.arc(toAuxX(pad.x), toAuxY(pad.z), Math.max(2, pad.radius * pxPerMeterAux), 0, Math.PI * 2);
      diffCtx.fill();
    }

    const drawDiff = (polygonsOnly: boolean) => {
      for (const p of this.centerlines) {
        if (p.isPolygon !== polygonsOnly) continue;
        const code = this.getDifficultyCode(p.difficulty);
        const col = `rgb(${code}, 0, 0)`;
        diffCtx.fillStyle = col;
        diffCtx.strokeStyle = col;
        diffCtx.beginPath();
        p.points.forEach((pt, idx) => {
          const x = toAuxX(pt.x);
          const y = toAuxY(pt.z);
          if (idx === 0) diffCtx.moveTo(x, y);
          else diffCtx.lineTo(x, y);
        });
        if (p.isPolygon) {
          diffCtx.closePath();
          diffCtx.fill();
        } else {
          diffCtx.lineWidth = Math.max(3, p.halfWidth * 2 * pxPerMeterAux);
          diffCtx.stroke();
        }
      }
    };
    drawDiff(true);
    drawDiff(false);

    // 4. Combinar en RGBA DataTexture (2048x2048) + grid de consulta rápida (1024x1024)
    const maskPixels = maskCtx.getImageData(0, 0, MASK_SIZE, MASK_SIZE).data;
    const dirPixels = dirCtx.getImageData(0, 0, AUX_SIZE, AUX_SIZE).data;
    const diffPixels = diffCtx.getImageData(0, 0, AUX_SIZE, AUX_SIZE).data;

    const rgba = new Uint8Array(MASK_SIZE * MASK_SIZE * 4);
    const lookup = new Uint8Array(AUX_SIZE * AUX_SIZE);

    for (let y = 0; y < MASK_SIZE; y++) {
      const ay = y >> 1;
      const rowMaskOffset = y * MASK_SIZE;
      const rowAuxOffset = ay * AUX_SIZE;
      for (let x = 0; x < MASK_SIZE; x++) {
        const ax = x >> 1;
        const mIdx = (rowMaskOffset + x) * 4;
        const aIdx = (rowAuxOffset + ax) * 4;

        const maskVal = maskPixels[mIdx];
        rgba[mIdx] = maskVal;
        rgba[mIdx + 1] = dirPixels[aIdx];
        rgba[mIdx + 2] = dirPixels[aIdx + 1];
        rgba[mIdx + 3] = diffPixels[aIdx];

        if ((x & 1) === 0 && (y & 1) === 0) {
          lookup[rowAuxOffset + ax] = maskVal;
        }
      }
    }

    this.maskLookupGrid = lookup;

    const tex = new THREE.DataTexture(rgba, MASK_SIZE, MASK_SIZE, THREE.RGBAFormat);
    tex.flipY = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    this.surfaceTexture = tex;
  }

  private isNearLiftTerminal(x: number, z: number, radius = 26): boolean {
    const rSq = radius * radius;
    for (let i = 0; i < this.liftTerminals.length; i++) {
      const t = this.liftTerminals[i];
      const dx = x - t.x;
      const dz = z - t.z;
      if (dx * dx + dz * dz < rSq) return true;
    }
    return false;
  }

  private placeDecorations(terrain: ProceduralTerrain) {
    const placedMarkers: THREE.Vector3[] = [];
    const placedCannons: THREE.Vector3[] = [];
    const minMarkerDistSq = 28 * 28;
    const minCannonDistSq = 55 * 55;

    const canPlaceOuterMarker = (pt: THREE.Vector3, outward: THREE.Vector3): boolean => {
      if (this.isNearLiftTerminal(pt.x, pt.z, 26)) return false;
      const checkOutX = pt.x + outward.x * 4.5;
      const checkOutZ = pt.z + outward.z * 4.5;
      if (this.sampleMaskAt(checkOutX, checkOutZ) > 0.35) return false;
      for (let m = 0; m < placedMarkers.length; m++) {
        if (placedMarkers[m].distanceToSquared(pt) < minMarkerDistSq) return false;
      }
      return true;
    };

    // 1. Pistas lineales abiertas (no sobrecargar enlaces cortos automáticos con balizas extra)
    this.centerlines.forEach((p) => {
      if (p.isPolygon || p.isConnector || p.points.length < 3) return;

      let dist = 0;
      let nextMarkerDist = 30;
      let nextCannonDist = 75;
      let cannonSideFlip = false;
      const prevOuterPts: { left: THREE.Vector3 | null; right: THREE.Vector3 | null } = { left: null, right: null };

      for (let i = 1; i < p.points.length - 1; i++) {
        const prevPt = p.points[i - 1];
        const pt = p.points[i];
        const nextPt = p.points[i + 1];
        dist += pt.distanceTo(prevPt);

        const dir = new THREE.Vector3(nextPt.x - prevPt.x, 0, nextPt.z - prevPt.z).normalize();
        const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();

        const left = pt.clone().addScaledVector(side, -p.halfWidth);
        const right = pt.clone().addScaledVector(side, p.halfWidth);
        left.y = terrain.getMeshElevationAt(left.x, left.z);
        right.y = terrain.getMeshElevationAt(right.x, right.z);

        // Redes de seguridad en curvas cerradas exteriores
        const inDir = new THREE.Vector3(pt.x - prevPt.x, 0, pt.z - prevPt.z).normalize();
        const outDir = new THREE.Vector3(nextPt.x - pt.x, 0, nextPt.z - pt.z).normalize();
        const turnSharpness = Math.max(0, 1.0 - inDir.dot(outDir));
        if (turnSharpness > 0.08 && prevOuterPts.left && prevOuterPts.right) {
          const crossY = inDir.x * outDir.z - inDir.z * outDir.x;
          const prevMargin = crossY > 0 ? prevOuterPts.left : prevOuterPts.right;
          const currMargin = crossY > 0 ? left : right;
          const outward = crossY > 0 ? side.clone().negate() : side;
          if (this.sampleMaskAt(currMargin.x + outward.x * 4.0, currMargin.z + outward.z * 4.0) < 0.35) {
            this.group.add(PisteDecoration.createSafetyNetSection(prevMargin, currMargin));
          }
        }
        prevOuterPts.left = left;
        prevOuterPts.right = right;

        if (dist >= nextMarkerDist) {
          nextMarkerDist = dist + 64;
          const leftOut = side.clone().negate();
          const rightOut = side;

          if (canPlaceOuterMarker(left, leftOut)) {
            this.group.add(PisteDecoration.createMarker(left, dir, p.color, false, p.number));
            placedMarkers.push(left);
          }
          if (canPlaceOuterMarker(right, rightOut)) {
            this.group.add(PisteDecoration.createMarker(right, dir, p.color, true, p.number));
            placedMarkers.push(right);
          }
        }

        if (dist >= nextCannonDist) {
          nextCannonDist = dist + 165;
          cannonSideFlip = !cannonSideFlip;
          const edgePt = cannonSideFlip ? right : left;
          const outward = cannonSideFlip ? side : side.clone().negate();
          const cannonPos = edgePt.clone().addScaledVector(outward, 2.4);
          cannonPos.y = terrain.getMeshElevationAt(cannonPos.x, cannonPos.z);

          if (
            !this.isNearLiftTerminal(cannonPos.x, cannonPos.z, 26) &&
            this.sampleMaskAt(cannonPos.x + outward.x * 2.5, cannonPos.z + outward.z * 2.5) < 0.32 &&
            !placedCannons.some((c) => c.distanceToSquared(cannonPos) < minCannonDistSq)
          ) {
            this.group.add(PisteDecoration.createSnowCannon(cannonPos, outward.clone().negate()));
            placedCannons.push(cannonPos);
          }
        }
      }
    });

    // 2. Polígonos cerrados: solo balizar contorno exterior real
    this.centerlines.forEach((p) => {
      if (!p.isPolygon || p.points.length < 4) return;
      let signedArea = 0;
      for (let i = 0; i < p.points.length; i++) {
        const a = p.points[i];
        const b = p.points[(i + 1) % p.points.length];
        signedArea += a.x * b.z - b.x * a.z;
      }
      const windingSign = signedArea >= 0 ? 1 : -1;

      let accum = 0;
      let nextMarker = 35;
      for (let i = 0; i < p.points.length; i++) {
        const a = p.points[i];
        const b = p.points[(i + 1) % p.points.length];
        const segLen = Math.hypot(b.x - a.x, b.z - a.z);
        if (segLen < 0.5) continue;

        const dir = new THREE.Vector3((b.x - a.x) / segLen, 0, (b.z - a.z) / segLen);
        const outward = new THREE.Vector3(dir.z * windingSign, 0, -dir.x * windingSign).normalize();

        accum += segLen;
        if (accum >= nextMarker) {
          nextMarker = accum + 74;
          const pos = new THREE.Vector3((a.x + b.x) * 0.5, 0, (a.z + b.z) * 0.5);
          pos.y = terrain.getMeshElevationAt(pos.x, pos.z);
          if (canPlaceOuterMarker(pos, outward)) {
            this.group.add(PisteDecoration.createMarker(pos, dir, p.color, true, p.number));
            placedMarkers.push(pos);
          }
        }
      }
    });
  }

  private buildJunctionSignposts(terrain: ProceduralTerrain) {
    const placedJunctions: THREE.Vector3[] = [];
    const maxSigns = 26;

    for (let i = 0; i < this.centerlines.length && placedJunctions.length < maxSigns; i++) {
      const pA = this.centerlines[i];
      if (pA.isPolygon || pA.isConnector) continue;

      for (let idxA = 2; idxA < pA.points.length - 2; idxA += 5) {
        const ptA = pA.points[idxA];

        if (this.isNearLiftTerminal(ptA.x, ptA.z, 24)) continue;
        if (placedJunctions.some((pj) => pj.distanceToSquared(ptA) < 65 * 65)) continue;

        const nearbyPistes: Array<{ line: PisteCenterline; ptIdx: number }> = [];
        for (let j = 0; j < this.centerlines.length; j++) {
          if (i === j) continue;
          const pB = this.centerlines[j];
          if (pB.isPolygon || pB.isConnector) continue;
          let bestIdx = -1;
          let bestDistSq = 22 * 22;
          for (let idxB = 0; idxB < pB.points.length; idxB += 2) {
            const dSq = ptA.distanceToSquared(pB.points[idxB]);
            if (dSq < bestDistSq) {
              bestDistSq = dSq;
              bestIdx = idxB;
            }
          }
          if (bestIdx !== -1) {
            nearbyPistes.push({ line: pB, ptIdx: bestIdx });
          }
        }

        if (nearbyPistes.length === 0) continue;

        const prevA = pA.points[Math.max(0, idxA - 1)];
        const nextA = pA.points[Math.min(pA.points.length - 1, idxA + 1)];
        const refDir = new THREE.Vector3(nextA.x - prevA.x, 0, nextA.z - prevA.z).normalize();
        const refRight = new THREE.Vector3(-refDir.z, 0, refDir.x);

        const entries: JunctionSignEntry[] = [
          {
            pisteName: pA.name,
            pisteNumber: pA.number,
            color: pA.color,
            arrow: '▲',
          },
        ];

        nearbyPistes.slice(0, 3).forEach(({ line, ptIdx }) => {
          const nPt = line.points[Math.min(line.points.length - 1, ptIdx + 2)];
          const pPt = line.points[Math.max(0, ptIdx - 1)];
          const outDir = new THREE.Vector3(nPt.x - pPt.x, 0, nPt.z - pPt.z).normalize();
          const sideDot = outDir.dot(refRight);
          const fwdDot = outDir.dot(refDir);
          const arrow: '◀' | '▲' | '▶' =
            Math.abs(sideDot) > 0.35 && fwdDot < 0.85 ? (sideDot > 0 ? '▶' : '◀') : '▲';

          entries.push({
            pisteName: line.name,
            pisteNumber: line.number,
            color: line.color,
            arrow,
          });
        });

        const signPos = ptA.clone().addScaledVector(refRight, pA.halfWidth + 2.2);
        signPos.y = terrain.getMeshElevationAt(signPos.x, signPos.z) + 0.3;
        const facingYaw = Math.atan2(-refDir.x, -refDir.z);

        const signpost = PisteDecoration.createJunctionSignpost(signPos, facingYaw, entries);
        this.group.add(signpost);
        placedJunctions.push(ptA);
      }
    }
  }
}
