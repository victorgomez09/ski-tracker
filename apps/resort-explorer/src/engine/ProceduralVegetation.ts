import * as THREE from 'three';
import { ProceduralTerrain } from './ProceduralTerrain.js';
import { ProceduralPistes } from './ProceduralPistes.js';
import { ProceduralLifts } from './ProceduralLifts.js';

interface TreeTier {
  radius: number;
  height: number;
  y: number;
  color: THREE.Color;
  radialSegments?: number;
}

/**
 * Vegetación alpina multicapa estilizada:
 * - Dos especies de coníferas (abeto alpino denso y pino silvestre esbelto) con capas nevadas
 *   y variación tonal por instancia mediante InstancedMesh.
 * - Exclusión estricta de pistas pisadas (incluyendo áreas poligonales OSM) y corredores de remontes.
 * - Rocas graníticas facetadas con capuchón de nieve en alta montaña.
 */
export class ProceduralVegetation {
  public group: THREE.Group = new THREE.Group();
  public instancedMesh: THREE.InstancedMesh;
  public firMesh: THREE.InstancedMesh;
  public rocksMesh: THREE.InstancedMesh;

  private readonly maxSpruce: number;
  private readonly maxFir: number;
  private readonly maxRocks: number;

  constructor(
    terrain: ProceduralTerrain,
    count = 4500,
    rockCount = 650,
    pistes?: ProceduralPistes,
    lifts?: ProceduralLifts
  ) {
    this.maxSpruce = Math.round(count * 0.6);
    this.maxFir = Math.max(1, count - this.maxSpruce);
    this.maxRocks = rockCount;

    const pineMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.82,
      metalness: 0.02,
      flatShading: true,
    });

    // Abeto alpino denso con capas verdes y copete nevado limpio
    const spruceGeom = this.createSnowyConiferGeometry([
      { radius: 0.28, height: 1.5, y: 0.75, color: new THREE.Color(0x4e3626), radialSegments: 6 },
      { radius: 2.05, height: 2.4, y: 2.0, color: new THREE.Color(0x1b4332) },
      { radius: 1.62, height: 2.2, y: 3.2, color: new THREE.Color(0x22543d) },
      { radius: 1.18, height: 1.9, y: 4.3, color: new THREE.Color(0x2b684a) },
      { radius: 0.92, height: 1.45, y: 4.95, color: new THREE.Color(0xf1f5f9) },
    ]);

    // Pino silvestre esbelto con doble capa de nieve superior
    const firGeom = this.createSnowyConiferGeometry([
      { radius: 0.22, height: 1.7, y: 0.85, color: new THREE.Color(0x432e20), radialSegments: 6 },
      { radius: 1.48, height: 2.1, y: 2.2, color: new THREE.Color(0x183c2b) },
      { radius: 1.24, height: 2.0, y: 3.35, color: new THREE.Color(0x214e38) },
      { radius: 0.96, height: 1.8, y: 4.45, color: new THREE.Color(0x2b6548) },
      { radius: 0.74, height: 1.45, y: 5.3, color: new THREE.Color(0xe2e8f0) },
      { radius: 0.48, height: 1.1, y: 5.85, color: new THREE.Color(0xf8fafc) },
    ]);

    this.instancedMesh = new THREE.InstancedMesh(spruceGeom, pineMaterial, this.maxSpruce);
    this.instancedMesh.castShadow = true;
    this.instancedMesh.receiveShadow = true;

    this.firMesh = new THREE.InstancedMesh(firGeom, pineMaterial, this.maxFir);
    this.firMesh.castShadow = true;
    this.firMesh.receiveShadow = true;

    const rockGeom = this.createSnowCappedRockGeometry();
    const rockMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.05,
      flatShading: true,
    });
    this.rocksMesh = new THREE.InstancedMesh(rockGeom, rockMat, rockCount);
    this.rocksMesh.castShadow = true;
    this.rocksMesh.receiveShadow = true;

    this.group.add(this.instancedMesh, this.firMesh, this.rocksMesh);
    this.populateTrees(terrain, pistes, lifts);
    this.populateRocks(terrain, rockCount, pistes, lifts);
  }

  public rebuild(terrain: ProceduralTerrain, pistes?: ProceduralPistes, lifts?: ProceduralLifts) {
    this.populateTrees(terrain, pistes, lifts);
    this.populateRocks(terrain, this.maxRocks, pistes, lifts);
  }

  public setLODCounts(treeCount: number, rockCount: number) {
    const clampedTrees = Math.max(0, Math.min(this.maxSpruce + this.maxFir, treeCount));
    this.instancedMesh.count = Math.min(this.maxSpruce, Math.round(clampedTrees * 0.6));
    this.firMesh.count = Math.min(this.maxFir, clampedTrees - this.instancedMesh.count);
    this.rocksMesh.count = Math.max(0, Math.min(this.maxRocks, rockCount));
  }

  private createSnowyConiferGeometry(tiers: TreeTier[]): THREE.BufferGeometry {
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];

    tiers.forEach((t, idx) => {
      const segs = t.radialSegments ?? 7;
      const geom =
        idx === 0
          ? new THREE.CylinderGeometry(t.radius * 0.7, t.radius, t.height, segs).toNonIndexed()
          : new THREE.ConeGeometry(t.radius, t.height, segs).toNonIndexed();
      geom.translate(0, t.y, 0);
      const posAttr = geom.attributes.position;
      const normAttr = geom.attributes.normal;

      for (let i = 0; i < posAttr.count; i++) {
        positions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
        normals.push(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i));
        colors.push(t.color.r, t.color.g, t.color.b);
      }
      geom.dispose();
    });

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return merged;
  }

  private createSnowCappedRockGeometry(): THREE.BufferGeometry {
    const geom = new THREE.IcosahedronGeometry(1.5, 0).toNonIndexed();
    const pos = geom.attributes.position;
    const colors: number[] = [];
    const rockDark = new THREE.Color(0x4b5563);
    const rockLight = new THREE.Color(0x6b7280);
    const snowCap = new THREE.Color(0xf1f5f9);
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i += 3) {
      const yAvg = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
      if (yAvg > 0.52) {
        tmp.copy(snowCap);
      } else if (yAvg > 0.0) {
        tmp.copy(rockLight);
      } else {
        tmp.copy(rockDark);
      }
      for (let k = 0; k < 3; k++) {
        colors.push(tmp.r, tmp.g, tmp.b);
      }
    }
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geom;
  }

  private isBlockedByInfrastructure(
    x: number,
    z: number,
    pistes?: ProceduralPistes,
    lifts?: ProceduralLifts
  ): boolean {
    if (pistes && pistes.isPointNearPiste(x, z, 6.0)) return true;
    if (lifts && lifts.isPointNearLift(x, z, 8.5)) return true;
    return false;
  }

  private populateTrees(
    terrain: ProceduralTerrain,
    pistes?: ProceduralPistes,
    lifts?: ProceduralLifts
  ) {
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    let placedSpruce = 0;
    let placedFir = 0;
    const totalTarget = this.maxSpruce + this.maxFir;

    const spreadX = terrain.width * 0.72;
    const spreadZ = terrain.depth * 0.72;
    const treeLineMaxY = 14 + terrain.verticalDropMeters * 0.58;

    for (let i = 0; i < totalTarget * 8 && (placedSpruce < this.maxSpruce || placedFir < this.maxFir); i++) {
      const x = (Math.random() - 0.5) * spreadX;
      const z = (Math.random() - 0.5) * spreadZ;

      const groveNoise = Math.sin(x * 0.013) * Math.cos(z * 0.013) + Math.sin((x + z) * 0.0065) * 0.55;
      if (groveNoise < -0.25 && Math.random() < 0.72) continue;

      const y = terrain.getMeshElevationAt(x, z);
      if (y < 10 || y > treeLineMaxY) continue;
      if (this.isBlockedByInfrastructure(x, z, pistes, lifts)) continue;

      dummy.position.set(x, y - 0.22, z);
      const scale = 0.8 + Math.random() * 0.95;
      dummy.scale.set(scale, scale * (0.9 + Math.random() * 0.35), scale);
      dummy.rotation.set((Math.random() - 0.5) * 0.05, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.05);
      dummy.updateMatrix();

      const shade = 0.86 + Math.random() * 0.24;
      tint.setRGB(shade, shade, shade);

      const preferFir = placedFir < this.maxFir && (placedSpruce >= this.maxSpruce || Math.random() < 0.42);
      if (preferFir) {
        this.firMesh.setMatrixAt(placedFir, dummy.matrix);
        this.firMesh.setColorAt(placedFir, tint);
        placedFir++;
      } else if (placedSpruce < this.maxSpruce) {
        this.instancedMesh.setMatrixAt(placedSpruce, dummy.matrix);
        this.instancedMesh.setColorAt(placedSpruce, tint);
        placedSpruce++;
      }
    }

    const hideRest = (mesh: THREE.InstancedMesh, startIdx: number, max: number) => {
      for (let j = startIdx; j < max; j++) {
        dummy.position.set(0, -500, 0);
        dummy.scale.set(0.01, 0.01, 0.01);
        dummy.updateMatrix();
        mesh.setMatrixAt(j, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };

    hideRest(this.instancedMesh, placedSpruce, this.maxSpruce);
    hideRest(this.firMesh, placedFir, this.maxFir);
  }

  private populateRocks(
    terrain: ProceduralTerrain,
    count: number,
    pistes?: ProceduralPistes,
    lifts?: ProceduralLifts
  ) {
    const dummy = new THREE.Object3D();
    let placed = 0;
    const spreadX = terrain.width * 0.68;
    const spreadZ = terrain.depth * 0.68;
    const minRockY = 14 + terrain.verticalDropMeters * 0.42;

    for (let i = 0; i < count * 6 && placed < count; i++) {
      const x = (Math.random() - 0.5) * spreadX;
      const z = (Math.random() - 0.5) * spreadZ;
      const y = terrain.getMeshElevationAt(x, z);

      if (y < minRockY) continue;
      if (this.isBlockedByInfrastructure(x, z, pistes, lifts)) continue;

      dummy.position.set(x, y - 0.35, z);
      dummy.scale.set(0.75 + Math.random() * 1.45, 0.55 + Math.random() * 0.9, 0.75 + Math.random() * 1.45);
      dummy.rotation.set(Math.random() * 0.35, Math.random() * Math.PI * 2, Math.random() * 0.35);
      dummy.updateMatrix();
      this.rocksMesh.setMatrixAt(placed, dummy.matrix);
      placed++;
    }

    for (let j = placed; j < count; j++) {
      dummy.position.set(0, -500, 0);
      dummy.scale.set(0.01, 0.01, 0.01);
      dummy.updateMatrix();
      this.rocksMesh.setMatrixAt(j, dummy.matrix);
    }

    this.rocksMesh.instanceMatrix.needsUpdate = true;
  }
}
