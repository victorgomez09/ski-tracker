import * as THREE from 'three';
import { ProceduralTerrain } from './ProceduralTerrain.js';
import { GeoProjection } from './GeoProjection.js';
import { OSMSkiLift } from './ResortDataService.js';
import { LiftStationBuilder } from './LiftStationBuilder.js';

export interface RideableLift {
  id: string;
  name: string;
  liftType: string;
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  uphillCurve: THREE.CatmullRomCurve3;
  isChair: boolean;
}

interface AnimatedLift {
  curve: THREE.CatmullRomCurve3;
  loopLength: number;
  speedMs: number;
  chairs: Array<{ mesh: THREE.Group; progress: number }>;
}

/**
 * Remontes mecánicos con alineación geométrica precisa:
 * - Clasificación real según tipo de remonte (telesilla, telesquí, cinta transportadora, etc.).
 * - Estaciones terminales alpinas para telesillas y telesquís mayores.
 * - Cintas transportadoras (tapiz) a nivel de suelo para debutantes (sin armaduras gigantes).
 * - Bucle de cable cerrado continuo en los telesillas con movimiento suave de sillas.
 * - Antenas de telecomunicaciones de la cumbre de Bola del Mundo.
 */
export class ProceduralLifts {
  public group: THREE.Group = new THREE.Group();
  private animatedLifts: AnimatedLift[] = [];
  private rideableLifts: RideableLift[] = [];

  constructor(terrain: ProceduralTerrain, projection: GeoProjection, lifts: OSMSkiLift[], includeBolaAntennas = true) {
    this.buildLiftsFromOSM(terrain, projection, lifts);
    if (includeBolaAntennas) {
      this.generateBolaDelMundoAntennas(terrain);
    }
  }

  public getRideableLifts(): RideableLift[] {
    return this.rideableLifts;
  }

  public rebuild(terrain: ProceduralTerrain, projection: GeoProjection, lifts: OSMSkiLift[], includeBolaAntennas = false) {
    while (this.group.children.length > 0) {
      const child = this.group.children[0] as THREE.Mesh;
      this.group.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    }
    this.animatedLifts = [];
    this.rideableLifts = [];

    this.buildLiftsFromOSM(terrain, projection, lifts);
    if (includeBolaAntennas) {
      this.generateBolaDelMundoAntennas(terrain);
    }
  }

  public update(deltaTime: number) {
    this.animatedLifts.forEach((lift) => {
      const progressStep = (lift.speedMs * deltaTime) / Math.max(100, lift.loopLength);
      lift.chairs.forEach((chairData) => {
        chairData.progress = (chairData.progress + progressStep) % 1.0;
        const pt = lift.curve.getPointAt(chairData.progress);
        chairData.mesh.position.copy(pt);

        const tangent = lift.curve.getTangentAt(chairData.progress);
        const yaw = Math.atan2(tangent.x, tangent.z);
        chairData.mesh.rotation.y = yaw;
      });
    });
  }

  private buildLiftsFromOSM(terrain: ProceduralTerrain, projection: GeoProjection, lifts: OSMSkiLift[]) {
    lifts.forEach((lift) => {
      if (!lift.geometry_geojson || !Array.isArray(lift.geometry_geojson.coordinates)) return;
      const coords = lift.geometry_geojson.coordinates;
      if (coords.length < 2) return;

      const firstPt = coords[0];
      const lastPt = coords[coords.length - 1];

      const [startX, startZ] = projection.project(firstPt[0], firstPt[1]);
      const [endX, endZ] = projection.project(lastPt[0], lastPt[1]);

      const startY = terrain.getElevationAt(startX, startZ);
      const endY = terrain.getElevationAt(endX, endZ);

      const startPos = new THREE.Vector3(startX, startY, startZ);
      const endPos = new THREE.Vector3(endX, endY, endZ);

      const horizDelta = new THREE.Vector3(endPos.x - startPos.x, 0, endPos.z - startPos.z);
      const totalDistance = horizDelta.length();
      if (totalDistance < 30) return;

      const liftDir = horizDelta.clone().normalize();
      const rightVec = new THREE.Vector3(-liftDir.z, 0, liftDir.x);

      // CASO 1: Cinta transportadora de debutantes (Magic Carpet)
      if (lift.lift_type === 'magic_carpet') {
        this.buildMagicCarpet(startPos, endPos, terrain, totalDistance);
        this.rideableLifts.push({
          id: lift.id,
          name: lift.name || 'Cinta',
          liftType: lift.lift_type,
          startPos: startPos.clone(),
          endPos: endPos.clone(),
          uphillCurve: new THREE.CatmullRomCurve3([
            startPos.clone().add(new THREE.Vector3(0, 0.4, 0)),
            endPos.clone().add(new THREE.Vector3(0, 0.4, 0)),
          ]),
          isChair: false,
        });
        return;
      }

      // CASO 2: Telecuerda de debutantes (Rope Tow) o remonte muy corto (< 65m)
      if (lift.lift_type === 'rope_tow' || totalDistance < 65) {
        this.buildRopeTow(startPos, endPos, terrain);
        this.rideableLifts.push({
          id: lift.id,
          name: lift.name || 'Telecuerda',
          liftType: lift.lift_type,
          startPos: startPos.clone(),
          endPos: endPos.clone(),
          uphillCurve: new THREE.CatmullRomCurve3([
            startPos.clone().add(new THREE.Vector3(0, 0.06, 0)),
            endPos.clone().add(new THREE.Vector3(0, 0.06, 0)),
          ]),
          isChair: false,
        });
        return;
      }

      // CASO 3: Telesillas y Telesquís principales
      const isChair = lift.lift_type === 'chair_lift' || lift.lift_type === 'gondola' || lift.lift_type === 'cable_car';
      const cableOffset = isChair ? 1.8 : 1.2;
      const terminalCableHeight = isChair ? 4.3 : 3.5;
      const pylonHeight = 8.5;

      // 1. Estaciones terminales alineadas
      const baseStation = LiftStationBuilder.createTerminalStation(startPos, liftDir, isChair);
      const summitStation = LiftStationBuilder.createTerminalStation(endPos, liftDir.clone().negate(), isChair);
      this.group.add(baseStation);
      this.group.add(summitStation);

      // 2. Pilonas intermedias (con margen de seguridad de 28m para no solaparse con estaciones)
      const bufferDist = 28;
      const usableDistance = totalDistance - bufferDist * 2;
      const pylonCount = Math.max(2, Math.round(usableDistance / 55));
      const pylonPositions: THREE.Vector3[] = [];

      for (let i = 0; i < pylonCount; i++) {
        const distAlong = bufferDist + (i / Math.max(1, pylonCount - 1)) * usableDistance;
        const alpha = distAlong / totalDistance;
        const px = THREE.MathUtils.lerp(startPos.x, endPos.x, alpha);
        const pz = THREE.MathUtils.lerp(startPos.z, endPos.z, alpha);
        const py = terrain.getElevationAt(px, pz);

        const pylonPos = new THREE.Vector3(px, py, pz);
        pylonPositions.push(pylonPos);

        const pylonMesh = this.createPylonMesh(pylonHeight, cableOffset);
        pylonMesh.position.copy(pylonPos);
        pylonMesh.rotation.y = Math.atan2(liftDir.x, liftDir.z);
        this.group.add(pylonMesh);
      }

      // 3. Circuito cerrado de cable de acero centrado en las poleas terminales
      const baseWheelCenter = startPos.clone()
        .add(new THREE.Vector3(0, terminalCableHeight, 0));

      const summitWheelCenter = endPos.clone()
        .add(new THREE.Vector3(0, terminalCableHeight, 0));

      const loopPoints: THREE.Vector3[] = [];
      const diag = cableOffset * Math.SQRT1_2;

      // Tramo de subida (derecha)
      loopPoints.push(baseWheelCenter.clone().addScaledVector(rightVec, cableOffset));
      for (let i = 0; i < pylonPositions.length; i++) {
        const pylon = pylonPositions[i];
        loopPoints.push(pylon.clone().addScaledVector(rightVec, cableOffset).add(new THREE.Vector3(0, pylonHeight - 0.25, 0)));
      }
      // Giro alrededor de la polea de cumbre
      loopPoints.push(summitWheelCenter.clone().addScaledVector(rightVec, cableOffset));
      loopPoints.push(summitWheelCenter.clone().addScaledVector(rightVec, diag).addScaledVector(liftDir, diag));
      loopPoints.push(summitWheelCenter.clone().addScaledVector(liftDir, cableOffset));
      loopPoints.push(summitWheelCenter.clone().addScaledVector(rightVec, -diag).addScaledVector(liftDir, diag));

      // Tramo de bajada (izquierda)
      loopPoints.push(summitWheelCenter.clone().addScaledVector(rightVec, -cableOffset));
      for (let i = pylonPositions.length - 1; i >= 0; i--) {
        const pylon = pylonPositions[i];
        loopPoints.push(pylon.clone().addScaledVector(rightVec, -cableOffset).add(new THREE.Vector3(0, pylonHeight - 0.25, 0)));
      }
      // Giro alrededor de la polea base
      loopPoints.push(baseWheelCenter.clone().addScaledVector(rightVec, -cableOffset));
      loopPoints.push(baseWheelCenter.clone().addScaledVector(rightVec, -diag).addScaledVector(liftDir, -diag));
      loopPoints.push(baseWheelCenter.clone().addScaledVector(liftDir, -cableOffset));
      loopPoints.push(baseWheelCenter.clone().addScaledVector(rightVec, diag).addScaledVector(liftDir, -diag));

      const cableCurve = new THREE.CatmullRomCurve3(loopPoints, true, 'catmullrom', 0.2);
      const tubeSegments = Math.max(80, (pylonCount + 2) * 16);
      const cableGeom = new THREE.TubeGeometry(cableCurve, tubeSegments, 0.04, 6, true);
      const cableMat = new THREE.MeshBasicMaterial({ color: 0x1e293b });
      const cableMesh = new THREE.Mesh(cableGeom, cableMat);
      this.group.add(cableMesh);

      // Registrar trayectoria de subida para poder embarcar en el remonte (Fase 10.6)
      const uphillPoints: THREE.Vector3[] = [];
      uphillPoints.push(baseWheelCenter.clone().addScaledVector(rightVec, cableOffset).add(new THREE.Vector3(0, -2.1, 0)));
      for (let i = 0; i < pylonPositions.length; i++) {
        uphillPoints.push(
          pylonPositions[i].clone().addScaledVector(rightVec, cableOffset).add(new THREE.Vector3(0, pylonHeight - 2.35, 0))
        );
      }
      uphillPoints.push(summitWheelCenter.clone().addScaledVector(rightVec, cableOffset).add(new THREE.Vector3(0, -2.1, 0)));

      this.rideableLifts.push({
        id: lift.id,
        name: lift.name || 'Remonte',
        liftType: lift.lift_type,
        startPos: startPos.clone(),
        endPos: endPos.clone(),
        uphillCurve: new THREE.CatmullRomCurve3(uphillPoints),
        isChair,
      });

      // 4. Sillas cuatriplaza en movimiento
      if (isChair) {
        const chairsCount = Math.max(4, Math.round(totalDistance / 42));
        const liftChairs: Array<{ mesh: THREE.Group; progress: number }> = [];

        for (let c = 0; c < chairsCount; c++) {
          const progress = c / chairsCount;
          const chairMesh = LiftStationBuilder.createChairMesh();
          const chairPt = cableCurve.getPointAt(progress);
          chairMesh.position.copy(chairPt);

          const tangent = cableCurve.getTangentAt(progress);
          chairMesh.rotation.y = Math.atan2(tangent.x, tangent.z);

          this.group.add(chairMesh);
          liftChairs.push({ mesh: chairMesh, progress });
        }

        this.animatedLifts.push({
          curve: cableCurve,
          loopLength: cableCurve.getLength(),
          speedMs: lift.lift_type === 'gondola' || lift.lift_type === 'cable_car' ? 7.0 : 5.5,
          chairs: liftChairs,
        });
      }
    });
  }

  /**
   * Cinta transportadora de debutantes (Magic Carpet):
   * Estructura a nivel de suelo sin pórticos ni cables altos.
   */
  private buildMagicCarpet(startPos: THREE.Vector3, endPos: THREE.Vector3, terrain: ProceduralTerrain, distance: number) {
    const samples = Math.max(10, Math.round(distance / 6));
    const beltMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9 }); // Goma negra
    const railMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.3 }); // Pasamanos de aluminio

    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= samples; i++) {
      const alpha = i / samples;
      const x = THREE.MathUtils.lerp(startPos.x, endPos.x, alpha);
      const z = THREE.MathUtils.lerp(startPos.z, endPos.z, alpha);
      const y = terrain.getElevationAt(x, z) + 0.35;
      points.push(new THREE.Vector3(x, y, z));
    }

    const curve = new THREE.CatmullRomCurve3(points);
    // Cinta de goma ancha
    const beltGeom = new THREE.TubeGeometry(curve, samples * 4, 0.9, 4, false);
    const beltMesh = new THREE.Mesh(beltGeom, beltMat);
    this.group.add(beltMesh);

    // Pequeños arcos de entrada y salida
    const archGeom = new THREE.TorusGeometry(1.2, 0.08, 6, 12, Math.PI);
    const startArch = new THREE.Mesh(archGeom, railMat);
    startArch.position.copy(points[0]);
    startArch.position.y += 0.5;

    const endArch = new THREE.Mesh(archGeom, railMat);
    endArch.position.copy(points[points.length - 1]);
    endArch.position.y += 0.5;

    this.group.add(startArch, endArch);
  }

  /**
   * Telecuerda básico (Rope Tow)
   */
  private buildRopeTow(startPos: THREE.Vector3, endPos: THREE.Vector3, terrain: ProceduralTerrain) {
    const postMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.8, roughness: 0.3 });
    const ropeMat = new THREE.MeshBasicMaterial({ color: 0x1e293b });

    const postGeom = new THREE.CylinderGeometry(0.12, 0.15, 2.2, 8);

    const startPost = new THREE.Mesh(postGeom, postMat);
    startPost.position.set(startPos.x, startPos.y + 1.1, startPos.z);

    const endPost = new THREE.Mesh(postGeom, postMat);
    endPost.position.set(endPos.x, endPos.y + 1.1, endPos.z);

    this.group.add(startPost, endPost);

    // Cable simple tensado a 1.2m de altura
    const midY = terrain.getElevationAt((startPos.x + endPos.x) / 2, (startPos.z + endPos.z) / 2);
    const ropeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(startPos.x, startPos.y + 1.2, startPos.z),
      new THREE.Vector3((startPos.x + endPos.x) / 2, midY + 1.3, (startPos.z + endPos.z) / 2),
      new THREE.Vector3(endPos.x, endPos.y + 1.2, endPos.z),
    ]);
    const ropeGeom = new THREE.TubeGeometry(ropeCurve, 20, 0.03, 4, false);
    const ropeMesh = new THREE.Mesh(ropeGeom, ropeMat);
    this.group.add(ropeMesh);
  }

  private createPylonMesh(height: number, cableOffset: number): THREE.Group {
    const group = new THREE.Group();

    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.8,
      roughness: 0.3,
    });
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.5,
      roughness: 0.4,
    });

    const mastGeom = new THREE.CylinderGeometry(0.3, 0.45, height, 10);
    const mast = new THREE.Mesh(mastGeom, metalMat);
    mast.position.y = height / 2;
    group.add(mast);

    const crossbarWidth = cableOffset * 2 + 0.8;
    const crossbarGeom = new THREE.BoxGeometry(crossbarWidth, 0.35, 0.4);
    const crossbar = new THREE.Mesh(crossbarGeom, metalMat);
    crossbar.position.y = height;
    group.add(crossbar);

    const wheelRadius = 0.35;
    const wheelGeom = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.22, 12);
    wheelGeom.rotateZ(Math.PI / 2);

    const wheelLeft = new THREE.Mesh(wheelGeom, wheelMat);
    wheelLeft.position.set(-cableOffset, height - 0.25, 0);

    const wheelRight = new THREE.Mesh(wheelGeom, wheelMat);
    wheelRight.position.set(cableOffset, height - 0.25, 0);

    group.add(wheelLeft, wheelRight);

    return group;
  }

  private generateBolaDelMundoAntennas(terrain: ProceduralTerrain) {
    const bolaX = 220;
    const bolaZ = 290;
    const groundY = terrain.getElevationAt(bolaX, bolaZ);

    const antennaPositions = [
      [0, 0],
      [-5, -4],
      [5, -3],
    ];

    const antennaGroup = new THREE.Group();
    antennaGroup.position.set(bolaX, groundY, bolaZ);

    antennaPositions.forEach(([ox, oz]) => {
      const tower = this.createAntennaTower();
      tower.position.set(ox, 0, oz);
      antennaGroup.add(tower);
    });

    this.group.add(antennaGroup);
  }

  private createAntennaTower(): THREE.Group {
    const tower = new THREE.Group();
    const sectionHeight = 4.0;
    const radius = 0.75;
    const colors = [0xdc2626, 0xffffff, 0xdc2626, 0xffffff, 0xdc2626];

    colors.forEach((color, i) => {
      const geom = new THREE.CylinderGeometry(radius, radius, sectionHeight, 8);
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.y = i * sectionHeight + sectionHeight / 2;
      tower.add(mesh);
    });

    const coneGeom = new THREE.ConeGeometry(radius, 3.5, 8);
    const coneMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.3 });
    const cone = new THREE.Mesh(coneGeom, coneMat);
    cone.position.y = colors.length * sectionHeight + 1.75;
    tower.add(cone);

    return tower;
  }
}
