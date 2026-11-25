import * as THREE from 'three';

/**
 * Generador ligero de mapas PBR procedurales (Normal / Roughness) en memoria
 * mediante CanvasTexture (cero archivos externos).
 */
export class ProceduralPBR {
  private static fabricRoughness: THREE.CanvasTexture | null = null;
  private static snowNormal: THREE.CanvasTexture | null = null;

  public static getFabricRoughnessMap(): THREE.CanvasTexture {
    if (this.fabricRoughness) return this.fabricRoughness;

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(128, 128);

    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 128; x++) {
        const weave = ((x % 4 < 2) !== (y % 4 < 2)) ? 185 : 145;
        const jitter = (Math.random() - 0.5) * 18;
        const val = Math.max(0, Math.min(255, weave + jitter));
        const idx = (y * 128 + x) * 4;
        img.data[idx] = val;
        img.data[idx + 1] = val;
        img.data[idx + 2] = val;
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 4);
    this.fabricRoughness = tex;
    return tex;
  }

  public static getSnowNormalMap(): THREE.CanvasTexture {
    if (this.snowNormal) return this.snowNormal;

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(128, 128);

    for (let i = 0; i < 128 * 128; i++) {
      const idx = i * 4;
      img.data[idx] = 128 + (Math.random() - 0.5) * 28;
      img.data[idx + 1] = 128 + (Math.random() - 0.5) * 28;
      img.data[idx + 2] = 255;
      img.data[idx + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(16, 16);
    this.snowNormal = tex;
    return tex;
  }
}
