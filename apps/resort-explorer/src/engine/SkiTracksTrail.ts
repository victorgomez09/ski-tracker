import * as THREE from 'three';

/**
 * Surcos permanentes de esquí sobre la nieve (InstancedMesh de 1 solo draw call):
 * - Dibuja dos huellas paralelas con anchura real (0.14 m, más anchas al derrapar/frenar).
 * - Soporta hasta 24.000 segmentos (~20 km de bajadas continuas) sin perder rendimiento.
 * - No conecta saltos, teletransportes ni viajes en remonte.
 * - Permanece en toda la montaña durante tu estancia y solo se resetea al cambiar de estación.
 */
export class SkiTracksTrail {
  public group: THREE.Group = new THREE.Group();
  private readonly maxGrooves = 24000;
  private mesh: THREE.InstancedMesh;
  private count = 0;
  private lastPos = new THREE.Vector3(0, -999, 0);
  private dummy = new THREE.Object3D();

  constructor() {
    const geom = new THREE.PlaneGeometry(0.14, 1.05);
    geom.rotateX(-Math.PI / 2);

    const mat = new THREE.MeshBasicMaterial({
      color: 0xc2ccd9, // Sombra nival neutra sutil del surco prensado
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -14.0,
      polygonOffsetUnits: -14.0,
    });

    this.mesh = new THREE.InstancedMesh(geom, mat, this.maxGrooves);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
  }

  /**
   * Resetea todos los surcos (únicamente al salir o cambiar de estación).
   */
  public clear() {
    this.count = 0;
    this.mesh.count = 0;
    this.lastPos.set(0, -999, 0);
  }

  /**
   * Rompe la continuidad del trazo (ej. al embarcar en remonte o teletransportarse).
   */
  public breakStroke() {
    this.lastPos.set(0, -999, 0);
  }

  public addPoint(pos: THREE.Vector3, heading: number, isGrounded: boolean, skidIntensity = 0) {
    if (!isGrounded) {
      this.lastPos.set(0, -999, 0);
      return;
    }

    if (this.lastPos.y < -500) {
      this.lastPos.copy(pos);
      return;
    }

    const dx = pos.x - this.lastPos.x;
    const dy = pos.y - this.lastPos.y;
    const dz = pos.z - this.lastPos.z;
    const distSq = dx * dx + dy * dy + dz * dz;

    if (distSq < 0.75 * 0.75) return;

    // Si hubo teletransporte o salto brusco, no unir con un trazo largo
    if (distSq > 8.0 * 8.0) {
      this.lastPos.copy(pos);
      return;
    }

    if (this.count + 2 > this.maxGrooves) return;

    const segLen = Math.sqrt(distSq);
    const midX = (this.lastPos.x + pos.x) * 0.5;
    const midY = (this.lastPos.y + pos.y) * 0.5 + 0.03;
    const midZ = (this.lastPos.z + pos.z) * 0.5;

    const yaw = Math.atan2(dx, dz);
    const pitch = -Math.asin(Math.max(-0.9, Math.min(0.9, dy / segLen)));

    const rightX = Math.cos(heading);
    const rightZ = -Math.sin(heading);
    const skiOffset = 0.17;
    const widthScale = 1.0 + Math.min(1.5, skidIntensity * 1.4);

    [-1, 1].forEach((side) => {
      this.dummy.position.set(
        midX + side * rightX * skiOffset,
        midY,
        midZ + side * rightZ * skiOffset
      );
      this.dummy.rotation.set(pitch, yaw, 0, 'YXZ');
      this.dummy.scale.set(widthScale, 1, segLen * 1.15);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(this.count, this.dummy.matrix);
      this.count++;
    });

    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.lastPos.copy(pos);
  }
}
