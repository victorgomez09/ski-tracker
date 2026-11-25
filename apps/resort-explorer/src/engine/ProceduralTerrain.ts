import * as THREE from 'three';
import { GeoProjection } from './GeoProjection.js';
import { ResortDataPayload } from './ResortDataService.js';
import { TerrariumDEM } from './TerrainTileLoader.js';

interface ElevationAnchor {
  x: number;
  z: number;
  h: number;
}

/**
 * Topografía 3D en escala real 1:1 (1 unidad = 1 metro):
 * - Prioriza DEM satelital real (AWS Terrain Tiles Terrarium) para reproducir fielmente
 *   los picos, laderas y valles exactos de cualquier estación (Valdesquí, Valdezcaray, Baqueira, etc.).
 * - Si no hay conexión, recurre a interpolación orográfica desde las cotas de remontes/pistas.
 */
export class ProceduralTerrain {
  public mesh: THREE.Mesh;
  public width: number;
  public depth: number;
  public readonly segments: number;
  public verticalDropMeters = 420;

  private demGrid: Float32Array | null = null;
  private demResolution = 0;
  private demMinAlt = 1860;
  private demMaxAlt = 2280;

  private awsDem: TerrariumDEM | null = null;
  private activeProjection: GeoProjection | null = null;
  private customAnchors: ElevationAnchor[] = [];
  private customVerticalDrop = 420;
  private useValdesquiPreset = true;

  constructor(width = 1200, depth = 1200, segments = 200) {
    this.width = width;
    this.depth = depth;
    this.segments = segments;

    const geometry = new THREE.PlaneGeometry(width, depth, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    this.deformTerrain(geometry);

    const material = this.createMountainMaterial();
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
  }

  public loadDEMGrid(grid: Float32Array, resolution: number, minAlt = 1860, maxAlt = 2280) {
    this.demGrid = grid;
    this.demResolution = resolution;
    this.demMinAlt = minAlt;
    this.demMaxAlt = maxAlt;

    const geometry = this.mesh.geometry as THREE.PlaneGeometry;
    this.deformTerrain(geometry);
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  /**
   * Reconstruye la montaña abarcando el dominio completo de la estación (10 o 270+ pistas)
   * usando elevación satelital real de AWS Terrarium si está disponible.
   */
  public rebuildFromResort(projection: GeoProjection, data: ResortDataPayload, awsDem: TerrariumDEM | null = null) {
    this.demGrid = null;
    this.awsDem = awsDem;
    this.activeProjection = projection;
    const isValdesqui = data.id === 'valdesqui' || data.name.toLowerCase().includes('valdesqu');
    this.useValdesquiPreset = isValdesqui && !awsDem;
    this.customAnchors = [];

    const verticalDrop = Math.max(120, (data.summit_altitude || 2250) - (data.base_altitude || 1800));
    this.customVerticalDrop = verticalDrop;
    this.verticalDropMeters = verticalDrop;

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    let demMin = Infinity;
    let demMax = -Infinity;

    const scanCoord = (lon: number, lat: number) => {
      const [px, pz] = projection.project(lon, lat);
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (pz < minZ) minZ = pz;
      if (pz > maxZ) maxZ = pz;

      if (awsDem) {
        const elev = awsDem.sampleElevation(lon, lat);
        if (elev < demMin) demMin = elev;
        if (elev > demMax) demMax = elev;
      }
    };

    (data.lifts || []).forEach((lift) => {
      const coords = lift.geometry_geojson?.coordinates;
      if (!coords || coords.length < 2) return;
      coords.forEach((pt) => scanCoord(pt[0], pt[1]));

      if (!awsDem) {
        const [sx, sz] = projection.project(coords[0][0], coords[0][1]);
        const [ex, ez] = projection.project(coords[coords.length - 1][0], coords[coords.length - 1][1]);
        this.customAnchors.push({ x: sx, z: sz, h: 14 });
        this.customAnchors.push({ x: (sx + ex) * 0.5, z: (sz + ez) * 0.5, h: 14 + verticalDrop * 0.52 });
        this.customAnchors.push({ x: ex, z: ez, h: 14 + verticalDrop });
      }
    });

    (data.pistes || []).forEach((piste) => {
      const coords = piste.geometry_geojson?.coordinates;
      if (!coords || coords.length < 2) return;
      coords.forEach((pt, idx) => {
        scanCoord(pt[0], pt[1]);
        if (!awsDem && (data.lifts || []).length === 0 && (idx === 0 || idx === coords.length - 1)) {
          const [px, pz] = projection.project(pt[0], pt[1]);
          const h = idx === 0 ? 14 + verticalDrop * 0.85 : 14;
          this.customAnchors.push({ x: px, z: pz, h });
        }
      });
    });

    if (!isFinite(minX)) {
      minX = -600;
      maxX = 600;
      minZ = -600;
      maxZ = 600;
    }

    if (awsDem && isFinite(demMin) && isFinite(demMax)) {
      this.demMinAlt = demMin;
      this.demMaxAlt = demMax;
      this.verticalDropMeters = Math.max(80, demMax - demMin);
    }

    // Abarcar toda la estación completa con margen amplio de valle y cumbre
    const maxAbs = Math.max(Math.abs(minX), Math.abs(maxX), Math.abs(minZ), Math.abs(maxZ), 600);
    const newSize = Math.max(1600, Math.min(22000, Math.ceil((maxAbs * 2.6) / 200) * 200));
    this.width = newSize;
    this.depth = newSize;

    const oldGeom = this.mesh.geometry;
    const newGeom = new THREE.PlaneGeometry(newSize, newSize, this.segments, this.segments);
    newGeom.rotateX(-Math.PI / 2);
    this.deformTerrain(newGeom);

    this.mesh.geometry = newGeom;
    oldGeom.dispose();
  }

  private deformTerrain(geometry: THREE.PlaneGeometry) {
    const positions = geometry.attributes.position;
    const vertex = new THREE.Vector3();

    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i);
      const h = this.getElevationAt(vertex.x, vertex.z);
      positions.setY(i, h);
    }

    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }

  public getElevationAt(x: number, z: number): number {
    if (this.awsDem && this.activeProjection) {
      const [lon, lat] = this.activeProjection.unproject(x, z);
      const realAlt = this.awsDem.sampleElevation(lon, lat);
      return Math.max(4, realAlt - this.demMinAlt + 14);
    }

    if (this.demGrid && this.demResolution > 0) {
      const u = ((x + this.width / 2) / this.width) * (this.demResolution - 1);
      const v = ((z + this.depth / 2) / this.depth) * (this.demResolution - 1);

      if (u >= 0 && u <= this.demResolution - 1 && v >= 0 && v <= this.demResolution - 1) {
        const x0 = Math.floor(u);
        const x1 = Math.min(this.demResolution - 1, x0 + 1);
        const z0 = Math.floor(v);
        const z1 = Math.min(this.demResolution - 1, z0 + 1);

        const fx = u - x0;
        const fz = v - z0;

        const h00 = this.demGrid[z0 * this.demResolution + x0];
        const h10 = this.demGrid[z0 * this.demResolution + x1];
        const h01 = this.demGrid[z1 * this.demResolution + x0];
        const h11 = this.demGrid[z1 * this.demResolution + x1];

        const top = h00 * (1 - fx) + h10 * fx;
        const bottom = h01 * (1 - fx) + h11 * fx;
        const realAltitude = top * (1 - fz) + bottom * fz;

        const norm = Math.max(0, Math.min(1, (realAltitude - this.demMinAlt) / (this.demMaxAlt - this.demMinAlt)));
        return 14 + norm * 155;
      }
    }

    if (!this.useValdesquiPreset && this.customAnchors.length > 0) {
      return this.calculateDataDrivenElevation(x, z);
    }

    return this.calculateElevation(x, z);
  }

  private calculateDataDrivenElevation(x: number, z: number): number {
    // Interpolación suave IDW sobre los puntos reales de remontes y pistas de la estación
    let weightedSum = 0;
    let weightTotal = 0;
    const smoothingSq = 180 * 180; // Suaviza transiciones para laderas esquiables naturales

    for (let i = 0; i < this.customAnchors.length; i++) {
      const a = this.customAnchors[i];
      const dx = x - a.x;
      const dz = z - a.z;
      const distSq = dx * dx + dz * dz + smoothingSq;
      const w = 1.0 / distSq;
      weightedSum += w * a.h;
      weightTotal += w;
    }

    const baseHeight = weightTotal > 0 ? weightedSum / weightTotal : 14;

    // Micro-relieve montañoso natural acorde a la escala de la estación
    const nx = x * 0.0035;
    const nz = z * 0.0035;
    const ridgeNoise =
      (Math.sin(nx * 2.1 + nz * 1.7) * 0.6 + Math.cos(nx * 4.3 - nz * 3.1) * 0.4) *
      (this.customVerticalDrop * 0.06);

    const distCenter = Math.hypot(x, z);
    const boundsFalloff = Math.max(0.15, 1.0 - Math.pow(distCenter / (this.width * 0.65), 3.0));

    return Math.max(14, (baseHeight + ridgeNoise) * boundsFalloff);
  }

  /**
   * Modelo orográfico exacto de Valdesquí:
   * Las cumbres están en z > 0 (Sur). El valle bajo está en z < 0 (Norte).
   */
  private calculateElevation(x: number, z: number): number {
    // 1. Pendiente general del anfiteatro: sube hacia el sur (z > 0)
    const zSlopeProgress = (z + 150) / 450;
    const generalSlope = Math.max(0, zSlopeProgress) * 98;

    // 2. Pico Bola del Mundo (Sureste / x ~ +220, z ~ +290, cota 2.265 m)
    const dxBola = x - 220;
    const dzBola = z - 290;
    const distBola = Math.sqrt(dxBola * dxBola + dzBola * dzBola);
    const domeBola = Math.max(0, 1.0 - distBola / 240);
    const hBola = Math.pow(domeBola, 1.7) * 88;

    // 3. Pico Valdemartín (Suroeste / x ~ -210, z ~ +320, cota 2.280 m)
    const dxValde = x - (-210);
    const dzValde = z - 320;
    const distValde = Math.sqrt(dxValde * dxValde + dzValde * dzValde);
    const domeValde = Math.max(0, 1.0 - distValde / 260);
    const hValde = Math.pow(domeValde, 1.7) * 95;

    // 4. Loma central divisoria (La Loma) que desciende hacia Prado Llano
    const lomaDist = Math.abs(x * 0.009);
    const lomaFactor = Math.exp(-lomaDist * lomaDist * 3.5);
    const lomaRidge = lomaFactor * Math.max(0, (z + 180) * 0.10);

    // 5. Suavizado de bordes del mapa
    const distCenter = Math.sqrt(x * x + z * z);
    const boundsFalloff = Math.max(0, 1.0 - Math.pow(distCenter / (this.width * 0.72), 3.0));

    // 6. Micro-relieve granítico de Guadarrama
    const nx = x * 0.004;
    const nz = z * 0.004;
    let micro = Math.sin(nx * 2.2 + nz * 1.8) * 8;
    micro += Math.cos(nx * 4.5 - nz * 3.2) * 4;

    const totalHeight = (generalSlope + hBola + hValde + lomaRidge + micro) * boundsFalloff;

    // Cota base mínima en Prado Llano
    return Math.max(14, totalHeight + 14);
  }

  private createMountainMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      lights: false,
      uniforms: {
        snowColor: { value: new THREE.Color(0xfafafa) }, // Nieve natural blanca pura
        skyColor: { value: new THREE.Color(0xe2e8f0) },  // Sombra neutra fría (sin tinte azul artificial)
        sunColor: { value: new THREE.Color(0xfffdf8) },
        rockColor: { value: new THREE.Color(0x6b7280) },
        sunDirection: { value: new THREE.Vector3(0.45, 0.78, 0.42).normalize() },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPosition;

        void main() {
          // Normal en espacio de mundo para que coincida con sunDirection y la vertical Y
          vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform vec3 snowColor;
        uniform vec3 skyColor;
        uniform vec3 sunColor;
        uniform vec3 rockColor;
        uniform vec3 sunDirection;

        varying vec3 vNormal;
        varying vec3 vWorldPosition;

        void main() {
          float slope = clamp(vNormal.y, 0.0, 1.0);
          float rockFactor = smoothstep(0.45, 0.20, slope);

          float NdotL = dot(vNormal, sunDirection);
          float halfLambert = clamp(NdotL * 0.5 + 0.5, 0.0, 1.0);
          float directSun = smoothstep(0.18, 0.72, halfLambert);

          float skyFactor = clamp(vNormal.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 ambientReflection = mix(skyColor * 0.90, vec3(0.95, 0.96, 0.98), skyFactor);

          vec3 litSnow = mix(
            snowColor * ambientReflection * 0.92,
            snowColor * (ambientReflection * 0.25 + sunColor * 0.80),
            directSun
          );

          vec3 litRock = mix(
            rockColor * ambientReflection * 0.75,
            rockColor * (ambientReflection * 0.35 + sunColor * 0.75),
            directSun
          );

          vec3 finalColor = mix(litSnow, litRock, rockFactor);

          vec3 viewDir = normalize(cameraPosition - vWorldPosition);
          vec3 halfVec = normalize(sunDirection + viewDir);
          float spec = pow(max(dot(vNormal, halfVec), 0.0), 32.0) * directSun * (1.0 - rockFactor);
          finalColor += vec3(0.18) * spec;

          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
    });
  }
}
