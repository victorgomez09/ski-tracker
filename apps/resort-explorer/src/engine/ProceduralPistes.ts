import * as THREE from 'three';
import { ProceduralTerrain } from './ProceduralTerrain.js';
import { GeoProjection } from './GeoProjection.js';
import { OSMSkiPiste } from './ResortDataService.js';
import { createPisteCorduroyMaterial } from './PisteShaderMaterial.js';
import { JunctionSignEntry, PisteDecoration } from './PisteDecoration.js';

interface PisteCenterline {
  name: string;
  number: string;
  color: number;
  points: THREE.Vector3[];
}

/**
 * Generador procedural de pistas de esquí a partir de OpenStreetMap con curvas naturales
 */
export class ProceduralPistes {
  public group: THREE.Group = new THREE.Group();
  private centerlines: PisteCenterline[] = [];

  private difficultyColors: Record<string, number> = {
    novice: 0x10b981,       // Verde oficial
    easy: 0x0284c7,         // Azul oficial
    intermediate: 0xef4444, // Roja oficial
    advanced: 0x0f172a,     // Negra oficial
    expert: 0x0f172a,
  };

  constructor(terrain: ProceduralTerrain, projection: GeoProjection, pistes: OSMSkiPiste[]) {
    this.buildPistesFromOSM(terrain, projection, pistes);
  }

  public rebuild(terrain: ProceduralTerrain, projection: GeoProjection, pistes: OSMSkiPiste[]) {
    while (this.group.children.length > 0) {
      const child = this.group.children[0] as THREE.Mesh;
      this.group.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    }

    this.buildPistesFromOSM(terrain, projection, pistes);
  }

  private getBaseWidth(diffKey: string, pisteName: string): number {
    const nameLower = (pisteName || '').toLowerCase();
    if (nameLower.includes('prado') || nameLower.includes('debutantes')) return 28;
    if (nameLower.includes('loma') || nameLower.includes('estadio')) return 22;

    switch (diffKey) {
      case 'novice': return 24;
      case 'easy': return 20;
      case 'intermediate': return 16;
      case 'advanced':
      case 'expert': return 13;
      default: return 18;
    }
  }

  private buildPistesFromOSM(terrain: ProceduralTerrain, projection: GeoProjection, pistes: OSMSkiPiste[]) {
    this.centerlines = [];
    pistes.forEach((piste, index) => {
      if (!piste.geometry_geojson || !Array.isArray(piste.geometry_geojson.coordinates)) return;
      const coords = piste.geometry_geojson.coordinates;
      if (coords.length < 2) return;

      const pisteNumber = this.extractPisteNumber(piste.name, index + 1);
      this.createPisteRibbon(terrain, projection, piste, pisteNumber);
    });

    this.buildJunctionSignposts(terrain);
  }

  private extractPisteNumber(name: string, fallbackIndex: number): string {
    const match = (name || '').match(/\b(\d{1,3})\b/);
    return match ? match[1] : String(fallbackIndex);
  }

  private createPisteRibbon(
    terrain: ProceduralTerrain,
    projection: GeoProjection,
    piste: OSMSkiPiste,
    pisteNumber: string
  ) {
    const coords = piste.geometry_geojson.coordinates;
    const diffKey = (piste.difficulty || 'easy').toLowerCase();
    const pisteColor = this.difficultyColors[diffKey] || 0x0284c7;
    const baseWidth = this.getBaseWidth(diffKey, piste.name);

    const vectors: THREE.Vector3[] = [];
    for (const pt of coords) {
      const lon = pt[0];
      const lat = pt[1];
      const [x, z] = projection.project(lon, lat);
      const y = terrain.getElevationAt(x, z) + 0.85;
      vectors.push(new THREE.Vector3(x, y, z));
    }

    if (vectors.length < 2) return;

    // Respetar las curvas reales de OSM densamente
    const curve = new THREE.CatmullRomCurve3(vectors);
    const sampleCount = Math.max(24, Math.min(180, vectors.length * 3));
    const curvePoints = curve.getPoints(sampleCount);

    this.centerlines.push({
      name: piste.name || `Pista ${pisteNumber}`,
      number: pisteNumber,
      color: pisteColor,
      points: curvePoints,
    });

    const ribbonGeom = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    let accumulatedDistance = 0;
    const rightMarginPoints: THREE.Vector3[] = [];
    const leftMarginPoints: THREE.Vector3[] = [];

    for (let i = 0; i < curvePoints.length; i++) {
      const pt = curvePoints[i];
      const nextPt = curvePoints[Math.min(i + 1, curvePoints.length - 1)];
      const prevPt = curvePoints[Math.max(0, i - 1)];

      const rawDir = i < curvePoints.length - 1
        ? new THREE.Vector3().subVectors(nextPt, pt)
        : new THREE.Vector3().subVectors(pt, prevPt);
      const dir = new THREE.Vector3(rawDir.x, 0, rawDir.z);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      dir.normalize();

      const up = new THREE.Vector3(0, 1, 0);
      const side = new THREE.Vector3().crossVectors(dir, up).normalize();

      // Detección de giro / peralte
      const inDir = new THREE.Vector3().subVectors(pt, prevPt).normalize();
      const outDir = new THREE.Vector3().subVectors(nextPt, pt).normalize();
      const turnSharpness = Math.max(0, 1.0 - inDir.dot(outDir));
      const dynamicWidth = baseWidth * (1.0 + turnSharpness * 0.40);

      if (i > 0) {
        accumulatedDistance += pt.distanceTo(prevPt);
      }

      const left = pt.clone().addScaledVector(side, -dynamicWidth / 2);
      const right = pt.clone().addScaledVector(side, dynamicWidth / 2);

      left.y = terrain.getElevationAt(left.x, left.z) + 1.1;
      right.y = terrain.getElevationAt(right.x, right.z) + 1.1;

      rightMarginPoints.push(right);
      leftMarginPoints.push(left);

      // Malla transversal de 4 puntos para adaptarse al relieve sin recortar el terreno
      const cols = 4;
      for (let k = 0; k < cols; k++) {
        const t = k / (cols - 1);
        const vx = left.x + (right.x - left.x) * t;
        const vz = left.z + (right.z - left.z) * t;
        const vy = terrain.getElevationAt(vx, vz) + 1.1;

        vertices.push(vx, vy, vz);
        uvs.push(t, accumulatedDistance * 0.08);
      }

      // Balizas cada ~5 segmentos con el número de pista impreso en el disco
      if (i % 5 === 0 && i < curvePoints.length - 1) {
        const leftMarker = PisteDecoration.createMarker(left, dir, pisteColor, false, pisteNumber);
        const rightMarker = PisteDecoration.createMarker(right, dir, pisteColor, true, pisteNumber);
        this.group.add(leftMarker);
        this.group.add(rightMarker);
      }

      // Redes de seguridad en curvas pronunciadas
      if (turnSharpness > 0.08 && i > 1 && i < curvePoints.length - 2) {
        const crossY = inDir.x * outDir.z - inDir.z * outDir.x;
        const outerMarginPrev = crossY > 0 ? leftMarginPoints[i - 1] : rightMarginPoints[i - 1];
        const outerMarginCurr = crossY > 0 ? left : right;

        const safetyNet = PisteDecoration.createSafetyNetSection(outerMarginPrev, outerMarginCurr);
        this.group.add(safetyNet);
      }
    }

    const cols = 4;
    for (let i = 0; i < curvePoints.length - 1; i++) {
      const row1 = i * cols;
      const row2 = (i + 1) * cols;
      for (let k = 0; k < cols - 1; k++) {
        const a = row1 + k;
        const b = row1 + k + 1;
        const c = row2 + k;
        const d = row2 + k + 1;
        // Orden antihorario (CCW) mirando desde arriba (+Y)
        indices.push(a, b, c);
        indices.push(b, d, c);
      }
    }

    ribbonGeom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    ribbonGeom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    ribbonGeom.setIndex(indices);
    ribbonGeom.computeVertexNormals();

    const pisteMaterial = createPisteCorduroyMaterial(pisteColor);
    const ribbonMesh = new THREE.Mesh(ribbonGeom, pisteMaterial);
    this.group.add(ribbonMesh);
  }

  /**
   * Detecta intersecciones y bifurcaciones entre pistas y coloca carteles direccionales 3D.
   */
  private buildJunctionSignposts(terrain: ProceduralTerrain) {
    const placedJunctions: THREE.Vector3[] = [];
    const maxSigns = 32;

    for (let i = 0; i < this.centerlines.length && placedJunctions.length < maxSigns; i++) {
      const pA = this.centerlines[i];
      for (let idxA = 2; idxA < pA.points.length - 2; idxA += 4) {
        const ptA = pA.points[idxA];

        // Evitar agrupar carteles a menos de 55m entre sí
        if (placedJunctions.some((pj) => pj.distanceToSquared(ptA) < 55 * 55)) continue;

        const nearbyPistes: Array<{ line: PisteCenterline; ptIdx: number }> = [];
        for (let j = 0; j < this.centerlines.length; j++) {
          if (i === j) continue;
          const pB = this.centerlines[j];
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

        // Dirección de entrada por pA en el cruce
        const prevA = pA.points[Math.max(0, idxA - 1)];
        const nextA = pA.points[Math.min(pA.points.length - 1, idxA + 1)];
        const refDir = new THREE.Vector3(nextA.x - prevA.x, 0, nextA.z - prevA.z).normalize();
        const refRight = new THREE.Vector3(-refDir.z, 0, refDir.x);

        const entries: JunctionSignEntry[] = [{
          pisteName: pA.name,
          pisteNumber: pA.number,
          color: pA.color,
          arrow: '▲',
        }];

        nearbyPistes.slice(0, 3).forEach(({ line, ptIdx }) => {
          const nPt = line.points[Math.min(line.points.length - 1, ptIdx + 2)];
          const pPt = line.points[Math.max(0, ptIdx - 1)];
          const outDir = new THREE.Vector3(nPt.x - pPt.x, 0, nPt.z - pPt.z).normalize();
          const sideDot = outDir.dot(refRight);
          const fwdDot = outDir.dot(refDir);
          const arrow: '◀' | '▲' | '▶' = Math.abs(sideDot) > 0.35 && fwdDot < 0.85
            ? (sideDot > 0 ? '▶' : '◀')
            : '▲';

          entries.push({
            pisteName: line.name,
            pisteNumber: line.number,
            color: line.color,
            arrow,
          });
        });

        // Colocar el cartel en el margen derecho mirando hacia el esquiador que llega
        const signPos = ptA.clone().addScaledVector(refRight, 11);
        signPos.y = terrain.getElevationAt(signPos.x, signPos.z) + 0.6;
        const facingYaw = Math.atan2(-refDir.x, -refDir.z);

        const signpost = PisteDecoration.createJunctionSignpost(signPos, facingYaw, entries);
        this.group.add(signpost);
        placedJunctions.push(ptA);
      }
    }
  }
}
