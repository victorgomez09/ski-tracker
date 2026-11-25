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
        snowColor: { value: new THREE.Color(0xffffff) },
        skyColor: { value: new THREE.Color(0xf1f5f9) },
        sunColor: { value: new THREE.Color(0xffffff) },
        rockColor: { value: new THREE.Color(0x646e78) },
        rockDark: { value: new THREE.Color(0x3a424d) },
        sunDirection: { value: new THREE.Vector3(0.45, 0.78, 0.42).normalize() },
        sunIntensity: { value: 1.0 },
        fogColor: { value: new THREE.Color(0xdce8f4) },
        fogDensity: { value: 0.00016 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPosition;

        void main() {
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
        uniform vec3 rockDark;
        uniform vec3 sunDirection;
        uniform float sunIntensity;
        uniform vec3 fogColor;
        uniform float fogDensity;

        varying vec3 vNormal;
        varying vec3 vWorldPosition;

        float hash21(vec2 p) {
          p = fract(p * vec2(127.1, 311.7));
          p += dot(p, p + 34.23);
          return fract(p.x * p.y);
        }

        float noise2D(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash21(i);
          float b = hash21(i + vec2(1.0, 0.0));
          float c = hash21(i + vec2(0.0, 1.0));
          float d = hash21(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        float fbmRock(vec2 p) {
          float v = 0.0;
          v += noise2D(p) * 0.55;
          v += noise2D(p * 2.3 + 4.1) * 0.30;
          v += noise2D(p * 5.7 - 1.9) * 0.15;
          return v;
        }

        void main() {
          float slope = clamp(vNormal.y, 0.0, 1.0);

          // Textura triplanar procedural para roca granítica en cortados y crestas
          vec3 blendW = abs(vNormal);
          blendW = pow(blendW, vec3(4.0));
          blendW /= max(0.001, blendW.x + blendW.y + blendW.z);

          float rx = fbmRock(vWorldPosition.zy * 0.06);
          float ry = fbmRock(vWorldPosition.xz * 0.06);
          float rz = fbmRock(vWorldPosition.xy * 0.06);
          float rockPattern = rx * blendW.x + ry * blendW.y + rz * blendW.z;
          float rockStrata = noise2D(vec2(vWorldPosition.y * 0.18, rockPattern * 3.0));

          float rockFactor = smoothstep(0.62, 0.34, slope + (rockPattern - 0.5) * 0.12);

          // Micro-relieve de nieve polvo virgen (sastrugi / ondas suaves de viento)
          float snowRipples = noise2D(vWorldPosition.xz * 0.16) * 0.6 + noise2D(vWorldPosition.xz * 0.45) * 0.4;
          vec3 snowNormal = normalize(vNormal + vec3((snowRipples - 0.5) * 0.14, 0.0, (snowRipples - 0.5) * 0.14));

          float NdotL = dot(snowNormal, sunDirection);
          float halfLambert = clamp(NdotL * 0.5 + 0.5, 0.0, 1.0);
          float directSun = smoothstep(0.18, 0.74, halfLambert);

          float skyFactor = clamp(vNormal.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 ambientReflection = mix(skyColor * 0.96, vec3(1.0, 1.0, 1.0), skyFactor);

          vec3 snowAlbedo = snowColor * (0.98 + snowRipples * 0.04);
          vec3 litSnow = mix(
            snowAlbedo * ambientReflection * 0.98,
            snowAlbedo * (ambientReflection * 0.44 + sunColor * 0.86 * sunIntensity),
            directSun
          );

          vec3 graniteAlbedo = mix(rockDark, rockColor, rockPattern * 0.75 + rockStrata * 0.25);
          vec3 litRock = mix(
            graniteAlbedo * ambientReflection * 0.65,
            graniteAlbedo * (ambientReflection * 0.28 + sunColor * 0.80 * sunIntensity),
            directSun
          );

          vec3 finalColor = mix(litSnow, litRock, rockFactor);

          // Brillo especular + destellos cristalinos en nieve polvo
          vec3 viewDir = normalize(cameraPosition - vWorldPosition);
          vec3 halfVec = normalize(sunDirection + viewDir);
          float spec = pow(max(dot(snowNormal, halfVec), 0.0), 28.0) * directSun * (1.0 - rockFactor);

          vec2 glintCell = floor(vWorldPosition.xz * 5.0);
          float glintRand = hash21(glintCell + floor(viewDir.xz * 4.0));
          float closeMask = 1.0 - smoothstep(15.0, 90.0, length(cameraPosition - vWorldPosition));
          float glint = smoothstep(0.982, 1.0, glintRand) * directSun * (1.0 - rockFactor) * closeMask * 0.4;

          finalColor += vec3(0.16 * spec + glint);

          // Niebla atmosférica exponencial sincronizada con WeatherAtmosphere
          float dist = length(cameraPosition - vWorldPosition);
          float fogFactor = 1.0 - exp(-fogDensity * fogDensity * dist * dist);
          finalColor = mix(finalColor, fogColor, clamp(fogFactor, 0.0, 1.0));

          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
    });
  }
}
