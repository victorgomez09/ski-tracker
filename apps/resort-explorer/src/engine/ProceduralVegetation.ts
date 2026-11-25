import * as THREE from 'three';
import { ProceduralTerrain } from './ProceduralTerrain.js';

/**
 * Vegetación alpina multicapa con nieve en las copas y rocas graníticas (Fase 10.12):
 * - Pinos silvestres de 3 niveles con colores de vértice (verde pino + nieve superior) en 1 draw call.
 * - Rocas graníticas alpinas dispersas en cotas altas mediante InstancedMesh.
 */
export class ProceduralVegetation {
  public group: THREE.Group = new THREE.Group();
  public instancedMesh: THREE.InstancedMesh;
  public rocksMesh: THREE.InstancedMesh;

  private readonly maxTrees: number;
  private readonly maxRocks: number;

  constructor(terrain: ProceduralTerrain, count = 2600, rockCount = 550) {
    this.maxTrees = count;
    this.maxRocks = rockCount;
    const pineGeometry = this.createSnowyPineGeometry();
    const pineMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.82,
      metalness: 0.04,
    });

    this.instancedMesh = new THREE.InstancedMesh(pineGeometry, pineMaterial, count);
    this.instancedMesh.castShadow = true;
    this.instancedMesh.receiveShadow = true;

    const rockGeom = new THREE.DodecahedronGeometry(1.5, 0);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x646e78,
      roughness: 0.9,
      metalness: 0.08,
    });
    this.rocksMesh = new THREE.InstancedMesh(rockGeom, rockMat, rockCount);
    this.rocksMesh.castShadow = true;
    this.rocksMesh.receiveShadow = true;

    this.group.add(this.instancedMesh, this.rocksMesh);
    this.populateTrees(terrain, count);
    this.populateRocks(terrain, rockCount);
  }

  public rebuild(terrain: ProceduralTerrain) {
    this.populateTrees(terrain, this.maxTrees);
    this.populateRocks(terrain, this.maxRocks);
  }

  /**
   * Ajusta al instante el número de árboles y rocas renderizados según el perfil gráfico.
   */
  public setLODCounts(treeCount: number, rockCount: number) {
    this.instancedMesh.count = Math.max(0, Math.min(this.maxTrees, treeCount));
    this.rocksMesh.count = Math.max(0, Math.min(this.maxRocks, rockCount));
  }

  private createSnowyPineGeometry(): THREE.BufferGeometry {
    const tiers = [
      { radius: 1.7, height: 2.2, y: 1.4, color: new THREE.Color(0x1b4325) },
      { radius: 1.35, height: 2.0, y: 2.7, color: new THREE.Color(0x22542e) },
      { radius: 0.95, height: 1.8, y: 3.9, color: new THREE.Color(0x2a6037) },
      { radius: 0.72, height: 1.3, y: 4.35, color: new THREE.Color(0xf1f5f9) }, // Copa nevada
    ];

    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];

    tiers.forEach((t) => {
      const cone = new THREE.ConeGeometry(t.radius, t.height, 6).toNonIndexed();
      cone.translate(0, t.y, 0);
      const posAttr = cone.attributes.position;
      const normAttr = cone.attributes.normal;

      for (let i = 0; i < posAttr.count; i++) {
        positions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
        normals.push(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i));
        colors.push(t.color.r, t.color.g, t.color.b);
      }
      cone.dispose();
    });

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return merged;
  }

  private populateTrees(terrain: ProceduralTerrain, count: number) {
    const dummy = new THREE.Object3D();
    let placed = 0;

    const spreadX = terrain.width * 0.72;
    const spreadZ = terrain.depth * 0.72;
    const treeLineMaxY = 14 + terrain.verticalDropMeters * 0.45;

    for (let i = 0; i < count * 5 && placed < count; i++) {
      const x = (Math.random() - 0.5) * spreadX;
      const z = (Math.random() - 0.5) * spreadZ;
      const y = terrain.getElevationAt(x, z);

      if (y >= 10 && y <= treeLineMaxY) {
        dummy.position.set(x, y, z);
        const scale = 0.75 + Math.random() * 0.75;
        dummy.scale.set(scale, scale * (0.9 + Math.random() * 0.35), scale);
        dummy.rotation.y = Math.random() * Math.PI * 2;
        dummy.updateMatrix();

        this.instancedMesh.setMatrixAt(placed, dummy.matrix);
        placed++;
      }
    }

    for (let j = placed; j < count; j++) {
      dummy.position.set(0, -500, 0);
      dummy.scale.set(0.01, 0.01, 0.01);
      dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(j, dummy.matrix);
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  private populateRocks(terrain: ProceduralTerrain, count: number) {
    const dummy = new THREE.Object3D();
    let placed = 0;
    const spreadX = terrain.width * 0.68;
    const spreadZ = terrain.depth * 0.68;
    const minRockY = 14 + terrain.verticalDropMeters * 0.42;

    for (let i = 0; i < count * 5 && placed < count; i++) {
      const x = (Math.random() - 0.5) * spreadX;
      const z = (Math.random() - 0.5) * spreadZ;
      const y = terrain.getElevationAt(x, z);

      if (y >= minRockY) {
        dummy.position.set(x, y - 0.4, z);
        dummy.scale.set(
          0.7 + Math.random() * 1.4,
          0.5 + Math.random() * 0.9,
          0.7 + Math.random() * 1.4
        );
        dummy.rotation.set(Math.random() * 0.5, Math.random() * Math.PI * 2, Math.random() * 0.5);
        dummy.updateMatrix();
        this.rocksMesh.setMatrixAt(placed, dummy.matrix);
        placed++;
      }
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
