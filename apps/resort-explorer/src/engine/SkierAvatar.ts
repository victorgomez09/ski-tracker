import * as THREE from 'three';
import { ProceduralPBR } from './ProceduralPBR.js';

/**
 * Avatar 3D procedural refinado de esquiador alpino (cero assets externos, materiales PBR):
 * - Esquís de carving con cantos metálicos, espátulas curvadas y fijaciones.
 * - Piernas articuladas (muslo + pantorrilla + bota) con flexión de rodilla realista.
 * - Torso anatómico con chaqueta técnica PBR, cuello alto y mochila de freeride.
 * - Brazos articulados con codos flexionados, guantes y bastones con rosetas.
 * - Casco aerodinámico con cinta trasera y gafas de ventisca reflectantes (clearcoat PBR).
 */
export class SkierAvatar {
  public group: THREE.Group = new THREE.Group();
  private bodyPivot: THREE.Group = new THREE.Group();
  private hipsGroup: THREE.Group = new THREE.Group();
  private torsoGroup: THREE.Group = new THREE.Group();
  private leftThigh: THREE.Group = new THREE.Group();
  private rightThigh: THREE.Group = new THREE.Group();
  private leftShin: THREE.Group = new THREE.Group();
  private rightShin: THREE.Group = new THREE.Group();
  private leftArm: THREE.Group = new THREE.Group();
  private rightArm: THREE.Group = new THREE.Group();

  constructor() {
    this.buildSkier();
  }

  private buildSkier() {
    const fabricRoughness = ProceduralPBR.getFabricRoughnessMap();

    const skiTopMat = new THREE.MeshPhysicalMaterial({
      color: 0x0f172a,
      roughness: 0.25,
      metalness: 0.35,
      clearcoat: 0.8,
    });
    const skiAccentMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.35, metalness: 0.2 });
    const steelEdgeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.15 });
    const bootMat = new THREE.MeshPhysicalMaterial({ color: 0x1e293b, roughness: 0.35, clearcoat: 0.4 });
    const pantsMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.8,
      roughnessMap: fabricRoughness,
    });
    const jacketMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      roughness: 0.65,
      roughnessMap: fabricRoughness,
    });
    const jacketTrimMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7 });
    const packMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 });
    const helmetMat = new THREE.MeshPhysicalMaterial({
      color: 0xf8fafc,
      roughness: 0.22,
      metalness: 0.1,
      clearcoat: 0.9,
    });
    const gogglesMat = new THREE.MeshPhysicalMaterial({
      color: 0x0ea5e9,
      roughness: 0.06,
      metalness: 0.92,
      clearcoat: 1.0,
    });
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.88, roughness: 0.22 });

    this.group.add(this.bodyPivot);

    // 1. Esquís de carving con cantos de acero, espátulas y fijaciones
    [-0.17, 0.17].forEach((ox) => {
      const skiGroup = new THREE.Group();
      skiGroup.position.set(ox, 0.025, 0);

      // Cuerpo principal del esquí
      const skiBody = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.024, 1.72), skiTopMat);
      skiGroup.add(skiBody);

      // Cantos metálicos laterales
      const edges = new THREE.Mesh(new THREE.BoxGeometry(0.112, 0.012, 1.70), steelEdgeMat);
      edges.position.y = -0.008;
      skiGroup.add(edges);

      // Espátula delantera curvada y cola
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.02, 0.22), skiAccentMat);
      tip.position.set(0, 0.036, 0.94);
      tip.rotation.x = -0.36;
      skiGroup.add(tip);

      // Fijaciones (puntera y talonera)
      const toeBind = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.05, 0.14), skiAccentMat);
      toeBind.position.set(0, 0.03, 0.14);
      const heelBind = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.06, 0.15), bootMat);
      heelBind.position.set(0, 0.035, -0.18);
      skiGroup.add(toeBind, heelBind);

      // Bota alpina inclinada hacia delante
      const bootLower = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.11, 0.30), bootMat);
      bootLower.position.set(0, 0.08, -0.02);
      const bootCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.068, 0.18, 10), bootMat);
      bootCuff.position.set(0, 0.17, -0.05);
      bootCuff.rotation.x = 0.24;
      skiGroup.add(bootLower, bootCuff);

      this.bodyPivot.add(skiGroup);
    });

    // 2. Piernas articuladas (pantorrilla + muslo)
    const shinGeom = new THREE.CylinderGeometry(0.072, 0.062, 0.38, 10);
    const thighGeom = new THREE.CylinderGeometry(0.092, 0.076, 0.40, 10);

    const buildLeg = (ox: number, shinGroup: THREE.Group, thighGroup: THREE.Group) => {
      shinGroup.position.set(ox, 0.22, -0.04);
      shinGroup.rotation.x = 0.28; // Ángulo natural de apoyo en la lengüeta de la bota

      const shinMesh = new THREE.Mesh(shinGeom, pantsMat);
      shinMesh.position.y = 0.19;
      shinGroup.add(shinMesh);

      // Rodilla + Muslo
      thighGroup.position.set(0, 0.38, 0);
      thighGroup.rotation.x = -0.45;
      const kneeSphere = new THREE.Mesh(new THREE.SphereGeometry(0.074, 8, 8), jacketTrimMat);
      thighGroup.add(kneeSphere);

      const thighMesh = new THREE.Mesh(thighGeom, pantsMat);
      thighMesh.position.y = 0.20;
      thighGroup.add(thighMesh);

      shinGroup.add(thighGroup);
      this.bodyPivot.add(shinGroup);
    };

    buildLeg(-0.17, this.leftShin, this.leftThigh);
    buildLeg(0.17, this.rightShin, this.rightThigh);

    // 3. Cadera y Torso esculpido (hombros anchos, cintura estrecha, mochila y casco)
    this.hipsGroup.position.set(0, 0.84, -0.04);
    this.bodyPivot.add(this.hipsGroup);

    const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.16, 0.18, 12), pantsMat);
    pelvis.scale.set(1.15, 1, 0.85);
    this.hipsGroup.add(pelvis);

    this.torsoGroup.position.set(0, 0.06, 0);
    this.hipsGroup.add(this.torsoGroup);

    // Chaqueta anatómica (trapecio/cilindro estrecho en cintura, ancho en hombros)
    const torsoMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.165, 0.50, 12), jacketMat);
    torsoMesh.scale.set(1.12, 1, 0.72);
    torsoMesh.position.y = 0.25;
    this.torsoGroup.add(torsoMesh);

    // Hombros redondeados y cuello alto
    const shoulders = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.26, 6, 10), jacketMat);
    shoulders.rotation.z = Math.PI / 2;
    shoulders.position.set(0, 0.44, 0);
    this.torsoGroup.add(shoulders);

    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.11, 0.09, 10), jacketTrimMat);
    collar.position.set(0, 0.53, 0.01);
    this.torsoGroup.add(collar);

    // Mochila compacta de freeride en la espalda
    const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.34, 0.12), packMat);
    backpack.position.set(0, 0.28, -0.17);
    this.torsoGroup.add(backpack);

    // Cabeza, casco aerodinámico y gafas reflectantes
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.68, 0.02);
    this.torsoGroup.add(headGroup);

    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.145, 16, 14), helmetMat);
    helmet.scale.set(0.95, 1.02, 1.08);
    headGroup.add(helmet);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.08, 0.11), gogglesMat);
    visor.position.set(0, -0.01, 0.11);
    headGroup.add(visor);

    const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.146, 0.146, 0.04, 14), jacketTrimMat);
    strap.position.set(0, -0.01, -0.01);
    headGroup.add(strap);

    // 4. Brazos articulados con guantes y bastones
    const buildArm = (side: -1 | 1, armGroup: THREE.Group) => {
      armGroup.position.set(side * 0.25, 0.44, 0.01);

      const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.054, 0.26, 8), jacketMat);
      upperArm.position.set(0, -0.11, 0.05);
      upperArm.rotation.x = -0.38;
      armGroup.add(upperArm);

      const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.044, 0.24, 8), jacketMat);
      forearm.position.set(-side * 0.02, -0.22, 0.20);
      forearm.rotation.x = -1.15;
      armGroup.add(forearm);

      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.052, 8, 8), jacketTrimMat);
      glove.position.set(-side * 0.03, -0.24, 0.31);
      armGroup.add(glove);

      // Bastón de aluminio + roseta de nieve
      const poleGroup = new THREE.Group();
      poleGroup.position.set(-side * 0.03, -0.24, 0.31);
      poleGroup.rotation.x = 1.15;
      poleGroup.rotation.z = side * 0.12;

      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.008, 1.12, 6), poleMat);
      shaft.position.y = -0.48;
      poleGroup.add(shaft);

      const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.012, 10), skiAccentMat);
      basket.position.y = -0.98;
      poleGroup.add(basket);

      armGroup.add(poleGroup);
      this.torsoGroup.add(armGroup);
    };

    buildArm(-1, this.leftArm);
    buildArm(1, this.rightArm);
  }

  /**
   * Actualiza postura articulada del esquiador según canteo, posición aerodinámica y derrape.
   */
  public updatePose(roll: number, crouch: number, skidAngle: number) {
    // Inclinación lateral del cuerpo entero hacia el interior de la curva
    this.bodyPivot.rotation.z = -roll;
    this.bodyPivot.rotation.y = skidAngle;

    // Flexión dinámica de rodillas y cadera
    const kneeFlex = crouch * 0.38;
    this.leftShin.rotation.x = 0.28 + kneeFlex;
    this.rightShin.rotation.x = 0.28 + kneeFlex;
    this.leftThigh.rotation.x = -0.45 - kneeFlex * 1.4;
    this.rightThigh.rotation.x = -0.45 - kneeFlex * 1.4;

    // Descenso de cadera y angulación al carvear
    this.hipsGroup.position.y = 0.84 - crouch * 0.18;
    this.hipsGroup.rotation.z = roll * 0.22; // Ligera angulación de cadera hacia el exterior

    // Inclinación del torso hacia delante en posición de huevo/tuck
    this.torsoGroup.rotation.x = 0.18 + crouch * 0.58;

    // Codos pegados al cuerpo en posición aerodinámica
    this.leftArm.rotation.x = crouch * 0.35;
    this.rightArm.rotation.x = crouch * 0.35;
    this.leftArm.rotation.z = -crouch * 0.15;
    this.rightArm.rotation.z = crouch * 0.15;
  }
}
