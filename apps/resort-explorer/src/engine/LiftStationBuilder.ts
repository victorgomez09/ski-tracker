import * as THREE from 'three';

/**
 * Generador procedural limpio de terminales de remontes (Fase 10.6):
 * - Mástil de soporte y polea motriz (bullwheel) centrada en (0, wheelY, 0).
 * - Caseta de operador compacta y 100% sólida sobre zócalo enterrado en el lateral izquierdo (x = -3.4),
 *   totalmente despejada del paso de las sillas y el cable.
 */
export class LiftStationBuilder {
  public static createTerminalStation(position: THREE.Vector3, direction: THREE.Vector3, isChairLift = true): THREE.Group {
    const station = new THREE.Group();
    station.position.copy(position);

    const yaw = Math.atan2(direction.x, direction.z);
    station.rotation.y = yaw;

    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.9 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.8, roughness: 0.35 });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.75, roughness: 0.35 });
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0x262626, roughness: 0.8 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.15, metalness: 0.6 });

    const wheelY = isChairLift ? 4.3 : 3.5;
    const wheelRadius = isChairLift ? 1.8 : 1.2;

    // 1. Mástil de soporte enterrado 1.5m y polea motriz (Bullwheel) centrada en (0, wheelY, 0)
    const buryDepth = 1.5;
    const mastHeight = wheelY + buryDepth + 0.2;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, mastHeight, 12), steelMat);
    mast.position.set(0, mastHeight / 2 - buryDepth, 0);
    station.add(mast);

    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.22, 28), wheelMat);
    wheel.position.set(0, wheelY, 0);
    station.add(wheel);

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.38, 12), steelMat);
    hub.position.set(0, wheelY + 0.05, 0);
    station.add(hub);

    // 2. Caseta de operador compacta en el lateral izquierdo (totalmente despejada del cable y sillas)
    if (isChairLift) {
      const cabinX = -3.4;
      const cabinW = 2.1;
      const cabinH = 2.4;
      const cabinL = 2.8;

      // Zócalo enterrado propio de la caseta para no flotar en laderas
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(cabinW + 0.4, 2.2, cabinL + 0.4), concreteMat);
      plinth.position.set(cabinX, -0.9, 0);
      station.add(plinth);

      // Cuerpo sólido de la caseta
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(cabinW, cabinH, cabinL), cabinMat);
      cabin.position.set(cabinX, 0.2 + cabinH / 2, 0);
      station.add(cabin);

      // Tejado plano con voladizo limpio
      const roof = new THREE.Mesh(new THREE.BoxGeometry(cabinW + 0.35, 0.18, cabinL + 0.35), roofMat);
      roof.position.set(cabinX, 0.2 + cabinH + 0.09, 0);
      station.add(roof);

      // Ventanal panorámico mirando hacia los esquiadores (+X)
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 1.6), glassMat);
      win.position.set(cabinX + cabinW / 2 + 0.04, 0.2 + 1.4, 0);
      station.add(win);
    }

    return station;
  }

  /**
   * Silla de telesilla individual cuatriplaza, simétrica y centrada en X = 0.
   */
  public static createChairMesh(): THREE.Group {
    const chair = new THREE.Group();

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.3 });
    const seatPadMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7 });

    const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.2), frameMat);
    chair.add(clamp);

    const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.0, 8), frameMat);
    hanger.position.set(0, -1.0, 0);
    chair.add(hanger);

    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.48), seatPadMat);
    bench.position.set(0, -2.0, 0.14);
    chair.add(bench);

    const back = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.42, 0.08), seatPadMat);
    back.position.set(0, -1.74, -0.1);
    chair.add(back);

    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.045, 0.42), frameMat);
    bar.position.set(0, -1.74, 0.35);
    chair.add(bar);

    return chair;
  }
}
