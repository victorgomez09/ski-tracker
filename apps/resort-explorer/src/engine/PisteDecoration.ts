import * as THREE from 'three';

export interface JunctionSignEntry {
  pisteName: string;
  pisteNumber: string;
  color: number;
  arrow: '◀' | '▲' | '▶';
}

/**
 * Balizas oficiales de pista (Normativa ATUDEM / FIS) con número de pista,
 * redes de seguridad en curvas y carteles direccionales 3D en intersecciones.
 */
export class PisteDecoration {
  private static discMatCache = new Map<string, THREE.MeshStandardMaterial>();
  private static readonly poleDarkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
  private static readonly orangeCapMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.3 });

  private static getNumberedDiscMaterial(pisteNumber: string, colorHex: number): THREE.MeshStandardMaterial {
    const key = `${pisteNumber}_${colorHex}`;
    const cached = this.discMatCache.get(key);
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    const hexStr = `#${colorHex.toString(16).padStart(6, '0')}`;
    ctx.fillStyle = hexStr;
    ctx.beginPath();
    ctx.arc(64, 64, 62, 0, Math.PI * 2);
    ctx.fill();

    // Borde blanco fino reglamentario
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.stroke();

    // Número de pista centrado y legible
    ctx.fillStyle = colorHex === 0x0f172a ? '#ffffff' : '#ffffff';
    ctx.font = pisteNumber.length > 2 ? 'bold 44px sans-serif' : 'bold 58px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pisteNumber, 64, 67);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.35,
      metalness: 0.08,
    });
    this.discMatCache.set(key, mat);
    return mat;
  }

  public static createMarker(
    position: THREE.Vector3,
    direction: THREE.Vector3,
    color: number,
    isRightSide: boolean,
    pisteNumber = '1'
  ): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(position);

    const postHeight = 2.15;
    const postRadius = 0.055; // Palo PVC realista (~11 cm diámetro)

    if (isRightSide) {
      const lowerHeight = postHeight * 0.60;
      const upperHeight = postHeight * 0.40;

      const lowerMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(postRadius, postRadius, lowerHeight, 8),
        new THREE.MeshStandardMaterial({ color, roughness: 0.45 })
      );
      lowerMesh.position.y = lowerHeight / 2;
      group.add(lowerMesh);

      const upperMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(postRadius * 1.05, postRadius * 1.05, upperHeight, 8),
        this.orangeCapMat
      );
      upperMesh.position.y = lowerHeight + upperHeight / 2;
      group.add(upperMesh);

      // Disco circular numerado montado ENCIMA del palo derecho (normativa ATUDEM/FIS)
      // Sin ser atravesado por el tubo
      const discRadius = 0.36;
      const rimGeom = new THREE.CylinderGeometry(discRadius, discRadius, 0.06, 20);
      rimGeom.rotateX(Math.PI / 2);

      const sideEdgeMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
      const faceMat = this.getNumberedDiscMaterial(pisteNumber, color);

      const discHolder = new THREE.Group();
      discHolder.position.y = postHeight + discRadius - 0.04;
      discHolder.rotation.y = Math.atan2(direction.x, direction.z);

      const rimMesh = new THREE.Mesh(rimGeom, sideEdgeMat);
      const faceGeom = new THREE.CircleGeometry(discRadius, 20);

      const frontFace = new THREE.Mesh(faceGeom, faceMat);
      frontFace.position.z = 0.032;

      const backFace = new THREE.Mesh(faceGeom, faceMat);
      backFace.position.z = -0.032;
      backFace.rotation.y = Math.PI;

      discHolder.add(rimMesh, frontFace, backFace);
      group.add(discHolder);
    } else {
      // Lado izquierdo bajando: únicamente el palo liso del color de dificultad (sin disco)
      const postMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(postRadius, postRadius, postHeight, 8),
        new THREE.MeshStandardMaterial({ color, roughness: 0.45 })
      );
      postMesh.position.y = postHeight / 2;
      group.add(postMesh);
    }

    return group;
  }

  /**
   * Poste alpino de madera con lamas direccionales en intersecciones de pistas.
   */
  public static createJunctionSignpost(
    position: THREE.Vector3,
    facingYaw: number,
    entries: JunctionSignEntry[]
  ): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(position);
    group.rotation.y = facingYaw;

    const timberMat = new THREE.MeshStandardMaterial({ color: 0x4b3621, roughness: 0.85 });
    const postHeight = 3.4;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, postHeight + 1.0, 8), timberMat);
    post.position.y = postHeight / 2 - 0.5;
    group.add(post);

    const shown = entries.slice(0, 4);
    shown.forEach((entry, idx) => {
      const slatCanvas = document.createElement('canvas');
      slatCanvas.width = 512;
      slatCanvas.height = 112;
      const ctx = slatCanvas.getContext('2d')!;

      // Fondo crema/madera clara de cartel alpino con borde oscuro
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, 512, 112);
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, 504, 104);

      // Círculo de dificultad + número
      const hexStr = `#${entry.color.toString(16).padStart(6, '0')}`;
      ctx.fillStyle = hexStr;
      ctx.beginPath();
      ctx.arc(58, 56, 34, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = entry.pisteNumber.length > 2 ? 'bold 26px sans-serif' : 'bold 34px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(entry.pisteNumber, 58, 58);

      // Nombre de la pista
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 34px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'left';
      const label = entry.pisteName.length > 17 ? `${entry.pisteName.slice(0, 16)}…` : entry.pisteName;
      ctx.fillText(label, 110, 58);

      // Flecha direccional a la derecha
      ctx.fillStyle = '#0284c7';
      ctx.font = 'bold 46px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(entry.arrow, 488, 58);

      const tex = new THREE.CanvasTexture(slatCanvas);
      const frontMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 });
      const slatGeom = new THREE.BoxGeometry(2.6, 0.52, 0.08);
      const slat = new THREE.Mesh(slatGeom, [timberMat, timberMat, timberMat, timberMat, frontMat, frontMat]);
      slat.position.set(0, postHeight - 0.35 - idx * 0.62, 0.14);
      group.add(slat);
    });

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
    const poleMat = this.poleDarkMat;

    const p1 = new THREE.Mesh(poleGeom, poleMat);
    p1.position.set(-length / 2, (netHeight + 0.35) / 2, 0);
    const p2 = new THREE.Mesh(poleGeom, poleMat);
    p2.position.set(length / 2, (netHeight + 0.35) / 2, 0);

    group.add(p1, p2);

    return group;
  }
}
