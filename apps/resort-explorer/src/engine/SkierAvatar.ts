import * as THREE from 'three';

/**
 * Avatar 3D procedural de esquiador alpino (cero assets externos).
 * Incluye esquís de carving, botas, piernas flexionables, chaqueta, casco, gafas y bastones.
 * Permite animar inclinación de canteo (roll), posición aerodinámica (tuck) y derrape (hockey stop).
 */
export class SkierAvatar {
  public group: THREE.Group = new THREE.Group();
  private bodyPivot: THREE.Group = new THREE.Group();
  private torsoGroup: THREE.Group = new THREE.Group();
  private leftLeg: THREE.Group = new THREE.Group();
  private rightLeg: THREE.Group = new THREE.Group();

  constructor() {
    this.buildSkier();
  }

  private buildSkier() {
    const skiMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.5 });
    const skiTipMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.4 });
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.75 });
    const jacketMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.6 }); // Chaqueta roja alpina visible
    const helmetMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3, metalness: 0.2 });
    const gogglesMat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.1, metalness: 0.8 });
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.3 });

    // Pivot principal en los pies para inclinar todo el cuerpo al carvear
    this.group.add(this.bodyPivot);

    // 1. Par de esquís (apuntando hacia +Z en espacio local)
    const skiOffsets = [-0.18, 0.18];
    skiOffsets.forEach((ox) => {
      const skiGroup = new THREE.Group();
      skiGroup.position.set(ox, 0.03, 0);

      const skiBody = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.03, 1.75), skiMat);
      skiGroup.add(skiBody);

      // Espátula delantera ligeramente elevada
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.03, 0.22), skiTipMat);
      tip.position.set(0, 0.04, 0.96);
      tip.rotation.x = -0.35;
      skiGroup.add(tip);

      // Bota de esquí
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.22, 0.32), bootMat);
      boot.position.set(0, 0.12, -0.02);
      skiGroup.add(boot);

      this.bodyPivot.add(skiGroup);
    });

    // 2. Piernas
    const legGeom = new THREE.CylinderGeometry(0.085, 0.07, 0.65, 8);
    const leftLegMesh = new THREE.Mesh(legGeom, pantsMat);
    leftLegMesh.position.y = 0.32;
    this.leftLeg.add(leftLegMesh);
    this.leftLeg.position.set(-0.18, 0.22, -0.02);
    this.leftLeg.rotation.x = 0.22; // Ligera flexión de rodillas

    const rightLegMesh = new THREE.Mesh(legGeom, pantsMat);
    rightLegMesh.position.y = 0.32;
    this.rightLeg.add(rightLegMesh);
    this.rightLeg.position.set(0.18, 0.22, -0.02);
    this.rightLeg.rotation.x = 0.22;

    this.bodyPivot.add(this.leftLeg, this.rightLeg);

    // 3. Torso, brazos, bastones y cabeza
    this.torsoGroup.position.set(0, 0.82, 0.08);
    this.bodyPivot.add(this.torsoGroup);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.56, 0.26), jacketMat);
    torso.position.y = 0.28;
    this.torsoGroup.add(torso);

    // Cabeza / Casco
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), helmetMat);
    helmet.position.set(0, 0.72, 0.02);
    this.torsoGroup.add(helmet);

    // Gafas de ventisca
    const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.09, 0.12), gogglesMat);
    goggles.position.set(0, 0.72, 0.13);
    this.torsoGroup.add(goggles);

    // Brazos y bastones en posición de descenso
    [-1, 1].forEach((side) => {
      const armGroup = new THREE.Group();
      armGroup.position.set(side * 0.28, 0.48, 0.02);

      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.48, 8), jacketMat);
      arm.position.set(0, -0.16, 0.14);
      arm.rotation.x = -0.85;
      armGroup.add(arm);

      // Bastón apuntando hacia atrás
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.01, 1.15, 6), poleMat);
      pole.position.set(side * 0.06, -0.34, -0.18);
      pole.rotation.x = 1.05;
      armGroup.add(pole);

      this.torsoGroup.add(armGroup);
    });
  }

  /**
   * Actualiza postura del esquiador según canteo, posición aerodinámica y derrape.
   * @param roll Radianes de inclinación lateral (+ derecha, - izquierda)
   * @param crouch 0..1 flexión aerodinámica (huevo/tuck)
   * @param skidAngle Radianes de giro transversal de los esquís al frenar (hockey stop)
   */
  public updatePose(roll: number, crouch: number, skidAngle: number) {
    // Inclinar lateralmente todo el cuerpo hacia el interior de la curva
    this.bodyPivot.rotation.z = -roll;
    this.bodyPivot.rotation.y = skidAngle;

    // Posición aerodinámica (bajar torso e inclinar hacia delante)
    this.torsoGroup.position.y = 0.82 - crouch * 0.18;
    this.torsoGroup.rotation.x = 0.18 + crouch * 0.48;
  }
}
