import * as THREE from 'three';
import { ProceduralPBR } from './ProceduralPBR.js';

export type RiderMode = 'ski' | 'snowboard';
export type SnowboardStance = 'regular' | 'goofy';

export interface AvatarPoseInput {
  roll: number;
  crouch: number;
  skidAngle: number;
  steerInput: number;
  speedMs: number;
  isGrounded: boolean;
  landingImpact: number;
  isPushing: boolean;
  timeSec: number;
}

/**
 * Avatar 3D procedural refinado de esquiador alpino y snowboarder (cero assets externos, materiales PBR):
 * - Modo Esquí: esquís de carving con cantos metálicos, espátulas curvadas, fijaciones y bastones.
 * - Modo Snowboard: tabla twin-tip con cantos, fijaciones anguladas y postura lateral (Regular / Goofy).
 * - Animación articulada realista: flexión asimétrica de rodillas en giro, contra-rotación de torso/cadera,
 *   equilibrio de brazos, amortiguación de aterrizaje y postura aérea.
 */
export class SkierAvatar {
  public group: THREE.Group = new THREE.Group();
  private bodyPivot: THREE.Group = new THREE.Group();
  private hipsGroup: THREE.Group = new THREE.Group();
  private torsoGroup: THREE.Group = new THREE.Group();
  private headGroup: THREE.Group = new THREE.Group();
  private leftThigh: THREE.Group = new THREE.Group();
  private rightThigh: THREE.Group = new THREE.Group();
  private leftShin: THREE.Group = new THREE.Group();
  private rightShin: THREE.Group = new THREE.Group();
  private leftArm: THREE.Group = new THREE.Group();
  private rightArm: THREE.Group = new THREE.Group();
  private leftPoleGroup: THREE.Group = new THREE.Group();
  private rightPoleGroup: THREE.Group = new THREE.Group();
  private skiGroupNodes: THREE.Group[] = [];
  private snowboardGroup: THREE.Group = new THREE.Group();

  private riderMode: RiderMode = 'ski';
  private stance: SnowboardStance = 'regular';

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

      this.skiGroupNodes.push(skiGroup);
      this.bodyPivot.add(skiGroup);
    });

    // 1b. Tabla de Snowboard twin-tip con cantos de acero, espátulas y fijaciones
    this.snowboardGroup.position.set(0, 0.025, 0);
    const boardMat = new THREE.MeshPhysicalMaterial({
      color: 0x0284c7,
      roughness: 0.22,
      metalness: 0.25,
      clearcoat: 0.85,
    });
    const boardBody = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.022, 1.38), boardMat);
    const boardEdges = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.012, 1.36), steelEdgeMat);
    boardEdges.position.y = -0.007;
    const noseTip = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.018, 0.20), skiAccentMat);
    noseTip.position.set(0, 0.032, 0.77);
    noseTip.rotation.x = -0.35;
    const tailTip = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.018, 0.20), skiAccentMat);
    tailTip.position.set(0, 0.032, -0.77);
    tailTip.rotation.x = 0.35;
    this.snowboardGroup.add(boardBody, boardEdges, noseTip, tailTip);

    [0.27, -0.27].forEach((fz) => {
      const sbBind = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.045, 0.14), bootMat);
      sbBind.position.set(0, 0.032, fz);
      sbBind.rotation.y = fz > 0 ? 0.26 : -0.18;
      const sbBoot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.14, 0.24), bootMat);
      sbBoot.position.set(0, 0.10, fz);
      sbBoot.rotation.y = Math.PI / 2 + (fz > 0 ? 0.22 : -0.15);
      this.snowboardGroup.add(sbBind, sbBoot);
    });
    this.snowboardGroup.visible = false;
    this.bodyPivot.add(this.snowboardGroup);

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
    this.headGroup.position.set(0, 0.68, 0.02);
    this.torsoGroup.add(this.headGroup);

    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.145, 16, 14), helmetMat);
    helmet.scale.set(0.95, 1.02, 1.08);
    this.headGroup.add(helmet);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.08, 0.11), gogglesMat);
    visor.position.set(0, -0.01, 0.11);
    this.headGroup.add(visor);

    const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.146, 0.146, 0.04, 14), jacketTrimMat);
    strap.position.set(0, -0.01, -0.01);
    this.headGroup.add(strap);

    // 4. Brazos articulados con guantes y bastones
    const buildArm = (side: -1 | 1, armGroup: THREE.Group, poleGroup: THREE.Group) => {
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

    buildArm(-1, this.leftArm, this.leftPoleGroup);
    buildArm(1, this.rightArm, this.rightPoleGroup);
  }

  public setRiderMode(mode: RiderMode, stance: SnowboardStance = 'regular') {
    this.riderMode = mode;
    this.stance = stance;

    const isBoard = mode === 'snowboard';
    this.skiGroupNodes.forEach((n) => {
      n.visible = !isBoard;
    });
    this.leftPoleGroup.visible = !isBoard;
    this.rightPoleGroup.visible = !isBoard;
    this.snowboardGroup.visible = isBoard;

    if (!isBoard) {
      this.leftShin.position.set(-0.17, 0.22, -0.04);
      this.rightShin.position.set(0.17, 0.22, -0.04);
      this.leftShin.rotation.y = 0;
      this.rightShin.rotation.y = 0;
      this.hipsGroup.rotation.y = 0;
      this.torsoGroup.rotation.y = 0;
      this.headGroup.rotation.y = 0;
    } else {
      const sign = stance === 'regular' ? 1 : -1;
      // En snowboard los pies van alineados a lo largo de la tabla y orientados lateralmente
      const frontZ = 0.27;
      const backZ = -0.27;
      if (stance === 'regular') {
        this.leftShin.position.set(0, 0.19, frontZ);
        this.rightShin.position.set(0, 0.19, backZ);
      } else {
        this.rightShin.position.set(0, 0.19, frontZ);
        this.leftShin.position.set(0, 0.19, backZ);
      }
      this.leftShin.rotation.y = sign * (Math.PI / 2);
      this.rightShin.rotation.y = sign * (Math.PI / 2);
    }
  }

  /**
   * Actualiza postura articulada realista según canteo, contra-rotación, aire, aterrizaje y modalidad.
   */
  public updatePose(pose: AvatarPoseInput) {
    const { roll, crouch, skidAngle, steerInput, speedMs, isGrounded, landingImpact, isPushing, timeSec } = pose;
    const airTuck = isGrounded ? 0 : 0.34;
    const speedFactor = Math.min(1, speedMs / 18);
    const turnCompress = Math.abs(roll) * 0.22;
    const microBounce = isGrounded
      ? (speedMs > 1.2 ? Math.sin(timeSec * 12.0) * 0.014 * speedFactor : Math.sin(timeSec * 2.2) * 0.01)
      : 0;
    const totalCrouch = Math.min(1.25, crouch + landingImpact * 0.55 + airTuck * 0.45 + turnCompress);

    // Elevar ligeramente el pivote al cantear para que el esquí/tabla interior no se hunda bajo la pista
    this.bodyPivot.position.y = Math.abs(roll) * 0.11;

    if (this.riderMode === 'snowboard') {
      const sign = this.stance === 'regular' ? 1 : -1;

      // Inclinación lateral en cantos (toe-side / heel-side) y derrape fluido
      this.bodyPivot.rotation.z = -roll * 0.88;
      this.bodyPivot.rotation.y = skidAngle * 0.95;
      this.snowboardGroup.rotation.z = -roll * 0.35;

      // Rodillas flexionadas absorbiendo el terreno y los giros (más peso delante al iniciar giro)
      const frontBias = steerInput * 0.08;
      const kneeFlex = 0.18 + totalCrouch * 0.42;
      this.leftShin.rotation.x = 0.24 + kneeFlex + frontBias;
      this.rightShin.rotation.x = 0.24 + kneeFlex - frontBias;
      this.leftThigh.rotation.x = -0.44 - (kneeFlex + frontBias) * 1.35;
      this.rightThigh.rotation.x = -0.44 - (kneeFlex - frontBias) * 1.35;

      // Cadera lateral con contra-rotación dinámica en curvas y mirada hacia la bajada
      this.hipsGroup.position.y = 0.80 - totalCrouch * 0.16 + microBounce;
      this.hipsGroup.position.x = roll * 0.18;
      this.hipsGroup.rotation.y = sign * 1.18 + steerInput * 0.22;
      this.hipsGroup.rotation.z = roll * 0.24;

      this.torsoGroup.rotation.y = steerInput * 0.28;
      this.torsoGroup.rotation.x = 0.12 + totalCrouch * 0.30;
      this.torsoGroup.rotation.z = roll * 0.18;

      this.headGroup.rotation.y = -sign * 0.96 + steerInput * 0.20;
      this.headGroup.rotation.z = roll * 0.32;

      // Brazos equilibrando sobre nose & tail con balanceo orgánico
      const airSpread = isGrounded ? 0 : 0.45;
      const armSway = Math.sin(timeSec * 3.5) * 0.05 * speedFactor;
      this.leftArm.rotation.x = 0.12 + totalCrouch * 0.18 + steerInput * 0.18 + armSway;
      this.rightArm.rotation.x = 0.12 + totalCrouch * 0.18 - steerInput * 0.18 - armSway;
      this.leftArm.rotation.z = -0.48 - airSpread - roll * 0.38;
      this.rightArm.rotation.z = 0.48 + airSpread - roll * 0.38;
      return;
    }

    // MODO ESQUÍ: carving dinámico con angulación, bombeo en curva y esquís siempre sobre la nieve
    this.bodyPivot.rotation.z = -roll * 0.78;
    this.bodyPivot.rotation.y = skidAngle;
    this.skiGroupNodes.forEach((ski) => {
      ski.rotation.z = -roll * 0.42;
    });

    // Flexión asimétrica: la pierna interior del giro flexiona más mientras la exterior sostiene el canto
    const baseKnee = totalCrouch * 0.38 + speedFactor * 0.08;
    const innerExtraLeft = roll > 0 ? roll * 0.44 : 0;
    const innerExtraRight = roll < 0 ? -roll * 0.44 : 0;

    this.leftShin.rotation.x = 0.28 + baseKnee + innerExtraLeft;
    this.rightShin.rotation.x = 0.28 + baseKnee + innerExtraRight;
    this.leftThigh.rotation.x = -0.45 - (baseKnee + innerExtraLeft) * 1.42;
    this.rightThigh.rotation.x = -0.45 - (baseKnee + innerExtraRight) * 1.42;

    // Desplazamiento lateral y angulación de cadera/torso hacia el interior de la curva
    this.hipsGroup.position.y = 0.84 - totalCrouch * 0.17 - Math.abs(roll) * 0.05 + microBounce;
    this.hipsGroup.position.x = roll * 0.22;
    this.hipsGroup.rotation.z = roll * 0.38;
    this.hipsGroup.rotation.y = -steerInput * 0.18;

    this.torsoGroup.rotation.x = 0.18 + totalCrouch * 0.54;
    this.torsoGroup.rotation.z = roll * 0.28;
    this.torsoGroup.rotation.y = steerInput * 0.30;

    this.headGroup.rotation.y = steerInput * 0.24;
    this.headGroup.rotation.z = roll * 0.32;

    // Brazos y bastones: clavado de bastón sutil en giros, impulso en llano y apertura aérea
    const pushSwing = isPushing ? Math.sin(timeSec * 8.5) * 0.48 : 0;
    const airArms = isGrounded ? 0 : 0.42;
    const leftTurnReach = steerInput > 0 ? 0.24 : -0.10;
    const rightTurnReach = steerInput < 0 ? 0.24 : -0.10;
    this.leftArm.rotation.x = crouch * 0.35 + pushSwing + Math.abs(steerInput) * leftTurnReach;
    this.rightArm.rotation.x = crouch * 0.35 + pushSwing + Math.abs(steerInput) * rightTurnReach;
    this.leftArm.rotation.z = -crouch * 0.15 - 0.14 - airArms - roll * 0.32;
    this.rightArm.rotation.z = crouch * 0.15 + 0.14 + airArms - roll * 0.32;
  }
}
