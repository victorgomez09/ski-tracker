import * as THREE from 'three';
import { ProceduralTerrain } from './ProceduralTerrain.js';

/**
 * Pinos silvestres de Guadarrama (Pinus sylvestris) con InstancedMesh.
 * Crecen densamente en la cota baja (fondo del valle / Prado Llano) y
 * se despejan en las lomas superiores (> 2.050 m).
 */
export class ProceduralVegetation {
  public instancedMesh: THREE.InstancedMesh;

  constructor(terrain: ProceduralTerrain, count = 2200) {
    const pineGeometry = this.createPineGeometry();
    const pineMaterial = new THREE.MeshStandardMaterial({
      color: 0x1e3a1e, // Verde pino albar de Guadarrama
      roughness: 0.85,
      metalness: 0.05,
    });

    this.instancedMesh = new THREE.InstancedMesh(pineGeometry, pineMaterial, count);
    this.instancedMesh.castShadow = true;
    this.instancedMesh.receiveShadow = true;

    this.populateTrees(terrain, count);
  }

  public rebuild(terrain: ProceduralTerrain) {
    this.populateTrees(terrain, this.instancedMesh.count);
  }

  private createPineGeometry(): THREE.BufferGeometry {
    const treeCone = new THREE.ConeGeometry(1.6, 4.5, 5);
    treeCone.translate(0, 2.25, 0);
    return treeCone;
  }

  private populateTrees(terrain: ProceduralTerrain, count: number) {
    const dummy = new THREE.Object3D();
    let placed = 0;

    const spreadX = terrain.width * 0.72;
    const spreadZ = terrain.depth * 0.72;
    const treeLineMaxY = 14 + terrain.verticalDropMeters * 0.45;

    for (let i = 0; i < count * 5 && placed < count; i++) {
      // Dispersión en el piso forestal bajo de cualquier estación
      const x = (Math.random() - 0.5) * spreadX;
      const z = (Math.random() - 0.5) * spreadZ;

      const y = terrain.getElevationAt(x, z);

      // Cota forestal baja-media (evitando cumbres rocosas altas)
      if (y >= 10 && y <= treeLineMaxY) {
        dummy.position.set(x, y, z);
        const scale = 0.75 + Math.random() * 0.7;
        dummy.scale.set(scale, scale * (0.9 + Math.random() * 0.3), scale);
        dummy.rotation.y = Math.random() * Math.PI * 2;
        dummy.updateMatrix();

        this.instancedMesh.setMatrixAt(placed, dummy.matrix);
        placed++;
      }
    }

    // Ocultar instancias sobrantes si hubiera menos huecos válidos
    for (let j = placed; j < count; j++) {
      dummy.position.set(0, -500, 0);
      dummy.scale.set(0.01, 0.01, 0.01);
      dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(j, dummy.matrix);
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }
}
