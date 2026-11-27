import * as THREE from 'three';
import { GeoProjection } from './GeoProjection.js';
import { ResortDataPayload } from './ResortDataService.js';
import { TerrariumDEM } from './TerrainTileLoader.js';
import { PisteSurfaceMap } from './ProceduralPistes.js';

interface ElevationAnchor {
  x: number;
  z: number;
  h: number;
}

/**
 * Topografía 3D en escala real 1:1 (1 unidad = 1 metro) con material PBR real:
 * - Recibe sombras reales PCFSoftShadowMap de árboles, esquiadores, pilonas y refugios.
 * - Integra directamente la máscara de pistas pisadas y su campo direccional en el shader
 *   para dibujar corduroy nítido, pasadas paralelas de pisanieves y talud de borde sin z-fighting.
 * - Prioriza DEM satelital real (AWS Terrarium) con respaldo orográfico suave.
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

  private terrainUniforms: {
    uPisteTex: { value: THREE.DataTexture };
    uPisteBounds: { value: THREE.Vector4 };
    uAerialHighlight: { value: number };
  };

  constructor(width = 2600, depth = 2600, segments = 280) {
    this.width = width;
    this.depth = depth;
    this.segments = segments;

    const dummyData = new Uint8Array([0, 128, 255, 0]);
    const dummyTex = new THREE.DataTexture(dummyData, 1, 1, THREE.RGBAFormat);
    dummyTex.needsUpdate = true;

    this.terrainUniforms = {
      uPisteTex: { value: dummyTex },
      uPisteBounds: { value: new THREE.Vector4(-width * 0.5, -depth * 0.5, 1 / width, 1 / depth) },
      uAerialHighlight: { value: 0.0 },
    };

    const geometry = new THREE.PlaneGeometry(width, depth, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    this.deformTerrain(geometry);

    const material = this.createMountainMaterial();
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
  }

  public setPisteSurfaceMap(surfaceMap: PisteSurfaceMap | null) {
    if (!surfaceMap) return;
    this.terrainUniforms.uPisteTex.value = surfaceMap.texture;
    this.terrainUniforms.uPisteBounds.value.copy(surfaceMap.bounds);
  }

  public setAerialHighlight(enabled: boolean) {
    this.terrainUniforms.uAerialHighlight.value = enabled ? 1.0 : 0.0;
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

  public getMeshElevationAt(x: number, z: number): number {
    const pos = this.mesh?.geometry?.attributes?.position;
    if (!pos) return this.getElevationAt(x, z);

    const seg = this.segments;
    const stride = seg + 1;
    const u = ((x + this.width * 0.5) / this.width) * seg;
    const v = ((z + this.depth * 0.5) / this.depth) * seg;

    if (u < 0 || u >= seg || v < 0 || v >= seg) {
      return this.getElevationAt(x, z);
    }

    const ix = Math.floor(u);
    const iz = Math.floor(v);
    const fx = u - ix;
    const fz = v - iz;

    const ha = pos.getY(iz * stride + ix);
    const hd = pos.getY(iz * stride + ix + 1);
    const hb = pos.getY((iz + 1) * stride + ix);
    const hc = pos.getY((iz + 1) * stride + ix + 1);

    if (fx + fz <= 1.0) {
      return ha + fx * (hd - ha) + fz * (hb - ha);
    }
    return hc + (1.0 - fx) * (hb - hc) + (1.0 - fz) * (hd - hc);
  }

  private calculateDataDrivenElevation(x: number, z: number): number {
    let weightedSum = 0;
    let weightTotal = 0;
    const smoothingSq = 180 * 180;

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

    const nx = x * 0.0035;
    const nz = z * 0.0035;
    const ridgeNoise =
      (Math.sin(nx * 2.1 + nz * 1.7) * 0.6 + Math.cos(nx * 4.3 - nz * 3.1) * 0.4) *
      (this.customVerticalDrop * 0.06);

    const distCenter = Math.hypot(x, z);
    const boundsFalloff = Math.max(0.15, 1.0 - Math.pow(distCenter / (this.width * 0.65), 3.0));

    return Math.max(14, (baseHeight + ridgeNoise) * boundsFalloff);
  }

  private calculateElevation(x: number, z: number): number {
    const zSlopeProgress = (z + 150) / 450;
    const generalSlope = Math.max(0, zSlopeProgress) * 98;

    const dxBola = x - 220;
    const dzBola = z - 290;
    const distBola = Math.sqrt(dxBola * dxBola + dzBola * dzBola);
    const domeBola = Math.max(0, 1.0 - distBola / 240);
    const hBola = Math.pow(domeBola, 1.7) * 88;

    const dxValde = x - (-210);
    const dzValde = z - 320;
    const distValde = Math.sqrt(dxValde * dxValde + dzValde * dzValde);
    const domeValde = Math.max(0, 1.0 - distValde / 260);
    const hValde = Math.pow(domeValde, 1.7) * 95;

    const lomaDist = Math.abs(x * 0.009);
    const lomaFactor = Math.exp(-lomaDist * lomaDist * 3.5);
    const lomaRidge = lomaFactor * Math.max(0, (z + 180) * 0.10);

    const distCenter = Math.sqrt(x * x + z * z);
    const boundsFalloff = Math.max(0, 1.0 - Math.pow(distCenter / (this.width * 0.72), 3.0));

    const nx = x * 0.004;
    const nz = z * 0.004;
    let micro = Math.sin(nx * 2.2 + nz * 1.8) * 8;
    micro += Math.cos(nx * 4.5 - nz * 3.2) * 4;

    const totalHeight = (generalSlope + hBola + hValde + lomaRidge + micro) * boundsFalloff;

    return Math.max(14, totalHeight + 14);
  }

  private createMountainMaterial(): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.85,
      metalness: 0.02,
      envMapIntensity: 0.65,
    });

    material.customProgramCacheKey = () => 'alpine-terrain-piste-v2';

    material.onBeforeCompile = (shader) => {
      shader.uniforms.uPisteTex = this.terrainUniforms.uPisteTex;
      shader.uniforms.uPisteBounds = this.terrainUniforms.uPisteBounds;
      shader.uniforms.uAerialHighlight = this.terrainUniforms.uAerialHighlight;

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vTerrainWPos;
          varying vec3 vTerrainWNorm;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vTerrainWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vTerrainWNorm = normalize(mat3(modelMatrix) * objectNormal);`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform sampler2D uPisteTex;
          uniform vec4 uPisteBounds;
          uniform float uAerialHighlight;

          varying vec3 vTerrainWPos;
          varying vec3 vTerrainWNorm;

          float terrainHash21(vec2 p) {
            p = fract(p * vec2(127.1, 311.7));
            p += dot(p, p + 34.23);
            return fract(p.x * p.y);
          }

          float terrainNoise2D(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float a = terrainHash21(i);
            float b = terrainHash21(i + vec2(1.0, 0.0));
            float c = terrainHash21(i + vec2(0.0, 1.0));
            float d = terrainHash21(i + vec2(1.0, 1.0));
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
          }

          float terrainFbm(vec2 p) {
            float v = 0.0;
            v += terrainNoise2D(p) * 0.55;
            v += terrainNoise2D(p * 2.3 + 4.1) * 0.30;
            v += terrainNoise2D(p * 5.7 - 1.9) * 0.15;
            return v;
          }

          vec3 decodeDifficultyColor(float code) {
            if (code < 0.38) return vec3(0.02, 0.48, 0.25);      // Verde
            if (code < 0.62) return vec3(0.01, 0.25, 0.62);      // Azul
            if (code < 0.88) return vec3(0.75, 0.06, 0.06);      // Roja
            return vec3(0.06, 0.07, 0.11);                       // Negra
          }`
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          float terrainRoughnessVal = 0.86;
          vec3 terrainWorldPerturb = vec3(0.0);

          vec3 wNorm = normalize(vTerrainWNorm);
          float slope = clamp(wNorm.y, 0.0, 1.0);

          // 1. Roca granítica triplanar en cortados fuertes
          vec3 blendW = pow(abs(wNorm), vec3(4.0));
          blendW /= max(0.001, blendW.x + blendW.y + blendW.z);
          float rx = terrainFbm(vTerrainWPos.zy * 0.065);
          float ry = terrainFbm(vTerrainWPos.xz * 0.065);
          float rz = terrainFbm(vTerrainWPos.xy * 0.065);
          float rockPattern = rx * blendW.x + ry * blendW.y + rz * blendW.z;
          float rockStrata = terrainNoise2D(vec2(vTerrainWPos.y * 0.22, rockPattern * 3.5));

          // 2. Máscara y dirección de pistas pisadas desde textura mundial
          vec2 pUv = vec2(
            (vTerrainWPos.x - uPisteBounds.x) * uPisteBounds.z,
            (vTerrainWPos.z - uPisteBounds.y) * uPisteBounds.w
          );
          float inBounds = step(0.001, pUv.x) * step(pUv.x, 0.999) * step(0.001, pUv.y) * step(pUv.y, 0.999);
          vec4 pSample = texture2D(uPisteTex, clamp(pUv, 0.0, 1.0)) * inBounds;

          float rawMask = pSample.r;
          float pisteMask = smoothstep(0.45, 0.57, rawMask);
          // Borde de talud / montículo donde acaba la fresa de la máquina pisanieves
          float bermBand = smoothstep(0.10, 0.34, rawMask) * (1.0 - smoothstep(0.45, 0.58, rawMask));

          // Suprimir roca dentro de pistas pisadas (la nieve cubre la pista)
          float rockFactor = smoothstep(0.60, 0.34, slope + (rockPattern - 0.5) * 0.12) * (1.0 - pisteMask * 0.92);

          // 3. Nieve virgen fuera de pista: nieve natural más mate/granular con ventisqueros
          float windDrifts = terrainNoise2D(vTerrainWPos.xz * 0.032) * 0.65 + terrainNoise2D(vTerrainWPos.xz * 0.11) * 0.35;
          float powderGrain = terrainNoise2D(vTerrainWPos.xz * 0.65);
          vec3 offPisteAlbedo = mix(vec3(0.68, 0.72, 0.76), vec3(0.84, 0.85, 0.87), windDrifts);
          offPisteAlbedo *= (0.93 + powderGrain * 0.08);
          offPisteAlbedo *= (1.0 - bermBand * 0.28);

          vec3 offPistePerturb = vec3((windDrifts - 0.5) * 0.20 + (powderGrain - 0.5) * 0.07, 0.0, (windDrifts - 0.5) * 0.20);

          // 4. Nieve pisada en pista: corduroy + franjas paralelas de pisanieves
          vec2 flowDir = (pSample.gb - 0.5) * 2.0;
          float flowLen = length(flowDir);
          flowDir = flowLen > 0.05 ? flowDir / flowLen : vec2(0.0, 1.0);
          vec2 perpDir = vec2(-flowDir.y, flowDir.x);

          // Wobble orgánico sutil en las pasadas de máquina
          float alongCoord = dot(vTerrainWPos.xz, flowDir);
          float acrossCoord = dot(vTerrainWPos.xz, perpDir);
          float passWobble = (terrainNoise2D(vec2(alongCoord * 0.018, acrossCoord * 0.03)) - 0.5) * 0.45;
          float acrossW = acrossCoord + passWobble;

          // Carriles de ~4.4m alternando tono de fresado (icónico visto desde lejos y cerca)
          float laneIdx = floor(acrossW / 4.4);
          float laneParity = mod(laneIdx, 2.0);
          float laneLocal = fract(acrossW / 4.4);
          float laneSeam = smoothstep(0.04, 0.0, min(laneLocal, 1.0 - laneLocal));

          // Estrías de corduroy cada ~0.34m con filtrado fwidth anti-moiré
          float cordFreq = 2.95;
          float cordPhase = acrossW * cordFreq;
          float cordFw = fwidth(cordPhase);
          float cordFade = 1.0 - smoothstep(0.25, 1.15, cordFw);
          float cordSaw = abs(fract(cordPhase) * 2.0 - 1.0);
          float cordSmooth = mix(0.62, cordSaw, cordFade);

          // Paleta nítida pista pisada: blanco-hielo limpio en cresta, azul glaciar marcado en surco
          vec3 groomCrest = vec3(0.96, 0.98, 1.00);
          vec3 groomGroove = vec3(0.50, 0.66, 0.88);
          vec3 pisteAlbedo = mix(groomGroove, groomCrest, cordSmooth);
          pisteAlbedo *= (1.0 - laneParity * 0.075);
          pisteAlbedo *= (1.0 - laneSeam * 0.18);

          // Perturbación de normales perpendicular al sentido de bajada (da reflejo solar en estrías)
          float cordSlope = (fract(cordPhase) < 0.5 ? -1.0 : 1.0) * 0.24 * cordFade;
          vec3 pistePerturb = vec3(perpDir.x * cordSlope, 0.0, perpDir.y * cordSlope);

          // 5. Vista aérea opcional: tintar pistas por dificultad
          if (uAerialHighlight > 0.01 && pSample.a > 0.05) {
            vec3 dCol = decodeDifficultyColor(pSample.a);
            float edgeBand = 1.0 - smoothstep(0.55, 0.78, rawMask);
            pisteAlbedo = mix(pisteAlbedo, dCol, uAerialHighlight * (0.42 + edgeBand * 0.55));
          }

          // 6. Mezcla final Nieve Virgen + Pista Pisada + Roca Granítica
          vec3 snowFinal = mix(offPisteAlbedo, pisteAlbedo, pisteMask);
          vec3 graniteAlbedo = mix(vec3(0.11, 0.13, 0.17), vec3(0.26, 0.29, 0.34), rockPattern * 0.75 + rockStrata * 0.25);
          diffuseColor.rgb = mix(snowFinal, graniteAlbedo, rockFactor);

          float pisteRough = 0.34 + laneParity * 0.06;
          terrainRoughnessVal = mix(mix(0.86, pisteRough, pisteMask), 0.94, rockFactor);
          terrainWorldPerturb = mix(mix(offPistePerturb, pistePerturb, pisteMask), vec3((rockPattern - 0.5) * 0.35, 0.0, (rockStrata - 0.5) * 0.35), rockFactor);`
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          roughnessFactor = terrainRoughnessVal;`
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          normal = normalize(normal + (viewMatrix * vec4(terrainWorldPerturb, 0.0)).xyz);`
        );
    };

    return material;
  }
}
