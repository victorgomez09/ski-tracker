import * as THREE from 'three';

/**
 * Balizas oficiales de pista (Normativa ATUDEM / FIS) y redes de seguridad en curvas.
 */
export class PisteDecoration {
  public static createMarker(
    position: THREE.Vector3,
    direction: THREE.Vector3,
    color: number,
    isRightSide: boolean
  ): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(position);

    const postHeight = 2.4;
    const postRadius = 0.10;

    if (isRightSide) {
      // Poste derecho con el color de la pista abajo y capuchón naranja fluorescente arriba
      const lowerHeight = postHeight * 0.60;
      const upperHeight = postHeight * 0.40;

      const lowerGeom = new THREE.CylinderGeometry(postRadius, postRadius, lowerHeight, 8);
      const lowerMat = new THREE.MeshStandardMaterial({ color, roughness: 0.45 });
      const lowerMesh = new THREE.Mesh(lowerGeom, lowerMat);
      lowerMesh.position.y = lowerHeight / 2;
      group.add(lowerMesh);

      const upperGeom = new THREE.CylinderGeometry(postRadius * 1.05, postRadius * 1.05, upperHeight, 8);
      const upperMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.3 }); // Naranja brillante
      const upperMesh = new THREE.Mesh(upperGeom, upperMat);
      upperMesh.position.y = lowerHeight + upperHeight / 2;
      group.add(upperMesh);
    } else {
      const postGeom = new THREE.CylinderGeometry(postRadius, postRadius, postHeight, 8);
      const postMat = new THREE.MeshStandardMaterial({ color, roughness: 0.45 });
      const postMesh = new THREE.Mesh(postGeom, postMat);
      postMesh.position.y = postHeight / 2;
      group.add(postMesh);
    }

    // Disco circular superior visible y bien dimensionado (diámetro ~0.8m)
    const discRadius = 0.40;
    const discGeom = new THREE.CylinderGeometry(discRadius, discRadius, 0.06, 16);
    discGeom.rotateX(Math.PI / 2);

    const discMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.3,
      metalness: 0.1,
    });
    const discMesh = new THREE.Mesh(discGeom, discMat);
    discMesh.position.y = postHeight - 0.25;

    // Orientar el disco perpendicular a la dirección de descenso
    const yaw = Math.atan2(direction.x, direction.z);
    discMesh.rotation.y = yaw;

    group.add(discMesh);

    return group;
  }

  public static createSafetyNetSection(
    startPos: THREE.Vector3,
    endPos: THREE.Vector3
  ): THREE.Group {
    const group = new THREE.Group();
    const netHeight = 1.2;

    const dir = new THREE.Vector3().subVectors(endPos, startPos);
    const length = dir.length();
    if (length < 1.5 || length > 14.0) return group;

    const midPoint = new THREE.Vector3().addVectors(startPos, endPos).multiplyScalar(0.5);
    group.position.copy(midPoint);

    const yaw = Math.atan2(dir.x, dir.z);
    group.rotation.y = yaw - Math.PI / 2;

    const netGeom = new THREE.PlaneGeometry(length, netHeight);
    const netMat = new THREE.MeshBasicMaterial({
      color: 0xff6b00,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const netMesh = new THREE.Mesh(netGeom, netMat);
    netMesh.position.y = netHeight / 2 + 0.15;
    group.add(netMesh);

    const poleGeom = new THREE.CylinderGeometry(0.05, 0.05, netHeight + 0.35, 6);
    const poleMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });

    const p1 = new THREE.Mesh(poleGeom, poleMat);
    p1.position.set(-length / 2, (netHeight + 0.35) / 2, 0);
    const p2 = new THREE.Mesh(poleGeom, poleMat);
    p2.position.set(length / 2, (netHeight + 0.35) / 2, 0);

    group.add(p1, p2);

    return group;
  }
}
