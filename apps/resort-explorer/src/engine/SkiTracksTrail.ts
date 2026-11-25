import * as THREE from 'three';

/**
 * Estela persistente de dos huellas paralelas de esquís sobre la nieve (Fase 10.11).
 * Utiliza un buffer circular fijo para dibujar surcos sin penalizar el rendimiento.
 */
export class SkiTracksTrail {
  public group: THREE.Group = new THREE.Group();
  private readonly maxPoints = 320;
  private leftPositions: Float32Array;
  private rightPositions: Float32Array;
  private leftLine: THREE.Line;
  private rightLine: THREE.Line;

  private count = 0;
  private lastPos = new THREE.Vector3(0, -999, 0);

  constructor() {
    this.leftPositions = new Float32Array(this.maxPoints * 3);
    this.rightPositions = new Float32Array(this.maxPoints * 3);

    const mat = new THREE.LineBasicMaterial({
      color: 0x94a3b8,
      transparent: true,
      opacity: 0.65,
    });

    const leftGeom = new THREE.BufferGeometry();
    leftGeom.setAttribute('position', new THREE.BufferAttribute(this.leftPositions, 3));
    leftGeom.setDrawRange(0, 0);
    this.leftLine = new THREE.Line(leftGeom, mat);
    this.leftLine.frustumCulled = false;

    const rightGeom = new THREE.BufferGeometry();
    rightGeom.setAttribute('position', new THREE.BufferAttribute(this.rightPositions, 3));
    rightGeom.setDrawRange(0, 0);
    this.rightLine = new THREE.Line(rightGeom, mat);
    this.rightLine.frustumCulled = false;

    this.group.add(this.leftLine, this.rightLine);
  }

  public clear() {
    this.count = 0;
    this.lastPos.set(0, -999, 0);
    this.leftLine.geometry.setDrawRange(0, 0);
    this.rightLine.geometry.setDrawRange(0, 0);
  }

  public addPoint(pos: THREE.Vector3, heading: number, isGrounded: boolean) {
    if (!isGrounded) return;
    if (this.lastPos.y > -500 && pos.distanceToSquared(this.lastPos) < 0.85 * 0.85) return;

    this.lastPos.copy(pos);
    const rightX = Math.cos(heading);
    const rightZ = -Math.sin(heading);
    const offset = 0.17;

    if (this.count >= this.maxPoints) {
      // Desplazar buffer circular hacia atrás
      this.leftPositions.copyWithin(0, 3);
      this.rightPositions.copyWithin(0, 3);
      this.count = this.maxPoints - 1;
    }

    const idx = this.count * 3;
    this.leftPositions[idx] = pos.x - rightX * offset;
    this.leftPositions[idx + 1] = pos.y + 0.04;
    this.leftPositions[idx + 2] = pos.z - rightZ * offset;

    this.rightPositions[idx] = pos.x + rightX * offset;
    this.rightPositions[idx + 1] = pos.y + 0.04;
    this.rightPositions[idx + 2] = pos.z + rightZ * offset;

    this.count++;
    this.leftLine.geometry.setDrawRange(0, this.count);
    this.rightLine.geometry.setDrawRange(0, this.count);
    this.leftLine.geometry.attributes.position.needsUpdate = true;
    this.rightLine.geometry.attributes.position.needsUpdate = true;
  }
}
