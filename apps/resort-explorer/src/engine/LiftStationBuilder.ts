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

    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.24, 28), wheelMat);
    wheel.position.set(0, wheelY, 0);
    station.add(wheel);

    // Radios visibles de la polea motriz para apreciar su giro
    const spokeGeom = new THREE.BoxGeometry(wheelRadius * 1.85, 0.08, 0.14);
    for (let s = 0; s < 3; s++) {
      const spoke = new THREE.Mesh(spokeGeom, steelMat);
      spoke.rotation.y = (s * Math.PI) / 3;
      wheel.add(spoke);
    }
    station.userData.bullwheel = wheel;

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.38, 12), steelMat);
    hub.position.set(0, wheelY + 0.05, 0);
    station.add(hub);

    // Marquesina alpina moderna sobre la polea y puerta de embarque
    if (isChairLift) {
      const canopyMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.35 });
      const accentMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.35 });

      const canopy = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.28, 5.2), canopyMat);
      canopy.position.set(0, wheelY + 1.15, 0);
      station.add(canopy);

      const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.68, 0.12, 5.26), accentMat);
      stripe.position.set(0, wheelY + 1.0, 0);
      station.add(stripe);

      // Puertas de embarque en el lateral derecho (zona de subida)
      const gateMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.4 });
      [-0.6, 0.6].forEach((gz) => {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.15, 6), gateMat);
        post.position.set(1.8, 0.55, gz + 1.8);
        station.add(post);
      });
    }

    // 2. Caseta de operador compacta en el lateral izquierdo con estética alpina (madera + tejado nevado)
    if (isChairLift) {
      const cabinX = -3.4;
      const cabinW = 2.2;
      const cabinH = 2.4;
      const cabinL = 2.9;

      const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.85 });
      const snowRoofMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.65 });

      // Zócalo enterrado propio de la caseta para no flotar en laderas
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(cabinW + 0.4, 2.2, cabinL + 0.4), concreteMat);
      plinth.position.set(cabinX, -0.9, 0);
      station.add(plinth);

      // Cuerpo sólido de la caseta en madera alpina
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(cabinW, cabinH, cabinL), woodMat);
      cabin.position.set(cabinX, 0.2 + cabinH / 2, 0);
      cabin.castShadow = true;
      station.add(cabin);

      // Tejado inclinado oscuro con manto de nieve encima
      const roof = new THREE.Mesh(new THREE.BoxGeometry(cabinW + 0.45, 0.22, cabinL + 0.45), roofMat);
      roof.position.set(cabinX, 0.2 + cabinH + 0.11, 0);
      roof.rotation.z = -0.14;
      station.add(roof);

      const roofSnow = new THREE.Mesh(new THREE.BoxGeometry(cabinW + 0.42, 0.14, cabinL + 0.42), snowRoofMat);
      roofSnow.position.set(cabinX, 0.2 + cabinH + 0.26, 0);
      roofSnow.rotation.z = -0.14;
      station.add(roofSnow);

      // Ventanal panorámico mirando hacia los esquiadores (+X)
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 1.6), glassMat);
      win.position.set(cabinX + cabinW / 2 + 0.04, 0.2 + 1.4, 0);
      station.add(win);
    }

    return station;
  }

  /**
   * Silla de telesilla individual cuatriplaza, simétrica y centrada en X = 0.
   * Color rojo alpino vivo en respaldo/asiento para destacar sobre la nieve.
   */
  public static createChairMesh(riderColors: number[] = []): THREE.Group {
    const chair = new THREE.Group();

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.78, roughness: 0.3 });
    const seatPadMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.48 });
    const seatBaseMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 });

    const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.2), frameMat);
    chair.add(clamp);

    const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.0, 8), frameMat);
    hanger.position.set(0, -1.0, 0);
    chair.add(hanger);

    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.10, 0.50), seatBaseMat);
    bench.position.set(0, -2.0, 0.14);
    chair.add(bench);

    const back = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.48, 0.09), seatPadMat);
    back.position.set(0, -1.72, -0.1);
    chair.add(back);

    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.80, 0.045, 0.44), frameMat);
    bar.position.set(0, -1.72, 0.35);
    chair.add(bar);

    const footrest = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.035, 0.14), frameMat);
    footrest.position.set(0, -2.42, 0.38);
    chair.add(footrest);

    // Esquiadores sentados en la silla
    const seatOffsets = [-0.52, 0.0, 0.52];
    const skiMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.35 });
    const helmetMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25 });

    riderColors.slice(0, 3).forEach((jacketHex, idx) => {
      const ox = seatOffsets[idx % seatOffsets.length];
      const jacketMat = new THREE.MeshStandardMaterial({ color: jacketHex, roughness: 0.65 });
      const rider = new THREE.Group();
      rider.position.set(ox, -1.94, 0.14);

      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.46, 8), jacketMat);
      torso.position.set(0, 0.24, -0.05);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), helmetMat);
      head.position.set(0, 0.55, -0.04);
      const legs = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.38, 0.12), skiMat);
      legs.position.set(0, -0.18, 0.22);
      legs.rotation.x = -0.2;
      const skis = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 1.35), skiMat);
      skis.position.set(0, -0.40, 0.30);

      rider.add(torso, head, legs, skis);
      chair.add(rider);
    });

    return chair;
  }

  /**
   * Cabina panorámica de telecabina (Gondola) cerrada con cristales tintados.
   */
  public static createGondolaMesh(accentColor = 0xdc2626): THREE.Group {
    const cabin = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.3 });
    const shellMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.35, metalness: 0.25 });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x0f172a,
      roughness: 0.1,
      metalness: 0.3,
      transparent: true,
      opacity: 0.72,
    });

    const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.20, 0.26), frameMat);
    cabin.add(clamp);

    const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 8), frameMat);
    hanger.position.set(0, -0.8, 0);
    cabin.add(hanger);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.22, 2.0), shellMat);
    roof.position.set(0, -1.65, 0);
    cabin.add(roof);

    const glassBody = new THREE.Mesh(new THREE.BoxGeometry(1.62, 1.15, 1.92), glassMat);
    glassBody.position.set(0, -2.32, 0);
    cabin.add(glassBody);

    const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.75, 2.02), shellMat);
    lowerBody.position.set(0, -3.25, 0);
    cabin.add(lowerBody);

    return cabin;
  }

  /**
   * Percha de telesquí (T-Bar / Platter).
   */
  public static createTBarMesh(): THREE.Group {
    const tbar = new THREE.Group();
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.3 });
    const barMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7 });

    const box = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.24, 0.18), metalMat);
    tbar.add(box);

    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.4, 6), metalMat);
    rod.position.set(0, -1.2, 0);
    tbar.add(rod);

    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 8), barMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, -2.4, 0);
    tbar.add(bar);

    return tbar;
  }
}
