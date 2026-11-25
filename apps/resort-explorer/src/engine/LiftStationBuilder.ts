import * as THREE from 'three';

/**
 * Generador procedural minimalista de terminales de remontes:
 * Únicamente un mástil metálico anclado al terreno y la polea motriz (bullwheel)
 * de retorno en el principio y fin de cada remonte, sin casetas ni capotas.
 */
export class LiftStationBuilder {
  /**
   * Crea una polea terminal simple (mástil + bullwheel) centrada en (0, 0, 0).
   */
  public static createTerminalStation(position: THREE.Vector3, direction: THREE.Vector3, isChairLift = true): THREE.Group {
    const station = new THREE.Group();
    station.position.copy(position);

    const yaw = Math.atan2(direction.x, direction.z);
    station.rotation.y = yaw;

    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.8,
      roughness: 0.35,
    });
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.75,
      roughness: 0.35,
    });

    const wheelY = isChairLift ? 4.3 : 3.5;
    const wheelRadius = isChairLift ? 1.8 : 1.2;

    // 1. Mástil de soporte enterrado 1.5m en el suelo para evitar huecos en pendiente
    const buryDepth = 1.5;
    const mastHeight = wheelY + buryDepth + 0.2;
    const mastGeom = new THREE.CylinderGeometry(0.28, 0.38, mastHeight, 12);
    const mast = new THREE.Mesh(mastGeom, steelMat);
    mast.position.set(0, mastHeight / 2 - buryDepth, 0);
    station.add(mast);

    // 2. Polea horizontal de retorno (Bullwheel) centrada en el eje del cable
    const wheelGeom = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.22, 28);
    const wheel = new THREE.Mesh(wheelGeom, wheelMat);
    wheel.position.set(0, wheelY, 0);
    station.add(wheel);

    // Cubo central superior de la polea
    const hubGeom = new THREE.CylinderGeometry(0.42, 0.42, 0.38, 12);
    const hub = new THREE.Mesh(hubGeom, steelMat);
    hub.position.set(0, wheelY + 0.05, 0);
    station.add(hub);

    return station;
  }

  /**
   * Silla de telesilla individual cuatriplaza, simétrica y centrada en X = 0.
   */
  public static createChairMesh(): THREE.Group {
    const chair = new THREE.Group();

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.3 });
    const seatPadMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7 });

    // 1. Pinza de agarre al cable
    const clampGeom = new THREE.BoxGeometry(0.16, 0.18, 0.2);
    const clamp = new THREE.Mesh(clampGeom, frameMat);
    chair.add(clamp);

    // 2. Mástil de suspensión
    const hangerGeom = new THREE.CylinderGeometry(0.035, 0.035, 2.0, 8);
    const hanger = new THREE.Mesh(hangerGeom, frameMat);
    hanger.position.set(0, -1.0, 0);
    chair.add(hanger);

    // 3. Banco y respaldo cuatriplaza
    const benchGeom = new THREE.BoxGeometry(1.6, 0.08, 0.48);
    const bench = new THREE.Mesh(benchGeom, seatPadMat);
    bench.position.set(0, -2.0, 0.14);
    chair.add(bench);

    const backGeom = new THREE.BoxGeometry(1.6, 0.42, 0.08);
    const back = new THREE.Mesh(backGeom, seatPadMat);
    back.position.set(0, -1.74, -0.1);
    chair.add(back);

    // Barra de seguridad
    const barGeom = new THREE.BoxGeometry(1.65, 0.045, 0.42);
    const bar = new THREE.Mesh(barGeom, frameMat);
    bar.position.set(0, -1.74, 0.35);
    chair.add(bar);

    return chair;
  }
}
