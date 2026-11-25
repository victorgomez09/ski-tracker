import * as THREE from 'three';
import { ProceduralTerrain } from './ProceduralTerrain.js';
import { GeoProjection } from './GeoProjection.js';
import { OSMResortPOI } from './ResortDataService.js';

/**
 * Generador procedural 3D de Puntos de Interés (POIs):
 * - Cafeterías, restaurantes y refugios: cabañas alpinas de madera y tejado a dos aguas.
 * - Primeros auxilios: puesto sanitario blanco con cruz roja.
 * - Alquiler, taquillas y escuelas: quioscos de servicio alpino.
 * - Miradores y aparcamientos: plataformas y señales con etiqueta flotante legible.
 */
export class ProceduralPOIs {
  public group: THREE.Group = new THREE.Group();

  constructor(terrain: ProceduralTerrain, projection: GeoProjection, pois: OSMResortPOI[] = []) {
    this.buildPOIs(terrain, projection, pois);
  }

  public rebuild(terrain: ProceduralTerrain, projection: GeoProjection, pois: OSMResortPOI[] = []) {
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      this.group.remove(child);
    }
    this.buildPOIs(terrain, projection, pois);
  }

  private buildPOIs(terrain: ProceduralTerrain, projection: GeoProjection, pois: OSMResortPOI[]) {
    // Limitar a 45 POIs relevantes para mantener fluidez y evitar ruido visual
    const list = pois.slice(0, 45);
    list.forEach((poi) => {
      const [x, z] = projection.project(poi.longitude, poi.latitude);
      const y = terrain.getElevationAt(x, z);

      const node = new THREE.Group();
      node.position.set(x, y, z);

      const { icon, labelColor } = this.getCategoryStyle(poi.category);
      this.buildStructureForCategory(node, poi.category);

      // Etiqueta flotante con icono y nombre del POI
      const sprite = this.createLabelSprite(`${icon} ${poi.name}`, labelColor);
      sprite.position.set(0, 7.5, 0);
      node.add(sprite);

      this.group.add(node);
    });
  }

  private getCategoryStyle(category: string): { icon: string; labelColor: string } {
    switch (category) {
      case 'restaurant':
      case 'cafe':
        return { icon: '☕', labelColor: '#d97706' };
      case 'hotel':
        return { icon: '🏔️', labelColor: '#0284c7' };
      case 'first_aid':
        return { icon: '➕', labelColor: '#dc2626' };
      case 'rental':
      case 'ski_school':
        return { icon: '🎿', labelColor: '#2563eb' };
      case 'viewpoint':
        return { icon: '🔭', labelColor: '#059669' };
      case 'parking':
        return { icon: '🅿️', labelColor: '#475569' };
      default:
        return { icon: 'ℹ️', labelColor: '#0284c7' };
    }
  }

  private buildStructureForCategory(group: THREE.Group, category: string) {
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.9 });

    if (category === 'restaurant' || category === 'cafe' || category === 'hotel') {
      // Cabaña / Refugio alpino de madera y tejado oscuro con cimentación enterrada
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(9.0, 2.5, 7.0), baseMat);
      plinth.position.y = -0.8;
      group.add(plinth);

      const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.8 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(8.2, 3.6, 6.2), woodMat);
      body.position.y = 2.2;
      group.add(body);

      const roofMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.55 });
      const roof = new THREE.Mesh(new THREE.BoxGeometry(9.0, 0.45, 7.0), roofMat);
      roof.position.y = 4.2;
      group.add(roof);

      const windowMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
      const win = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.4, 6.3), windowMat);
      win.position.y = 2.2;
      group.add(win);
      return;
    }

    if (category === 'first_aid') {
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(5.5, 2.0, 5.0), baseMat);
      plinth.position.y = -0.7;
      group.add(plinth);

      const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(4.8, 2.8, 4.2), whiteMat);
      cabin.position.y = 1.6;
      group.add(cabin);

      const redMat = new THREE.MeshBasicMaterial({ color: 0xdc2626 });
      const crossH = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 4.3), redMat);
      crossH.position.y = 1.8;
      const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.4, 4.3), redMat);
      crossV.position.y = 1.8;
      group.add(crossH, crossV);
      return;
    }

    if (category === 'parking') {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 3.5, 8),
        new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.7 })
      );
      post.position.y = 1.75;
      group.add(post);
      return;
    }

    if (category === 'viewpoint') {
      const woodMat = new THREE.MeshStandardMaterial({ color: 0x785438, roughness: 0.85 });
      const deck = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.4, 0.5, 12), woodMat);
      deck.position.y = 0.25;
      group.add(deck);
      return;
    }

    // Quiosco de servicio estándar (alquiler, taquillas, escuela, aseos)
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(5.0, 2.0, 4.5), baseMat);
    plinth.position.y = -0.7;
    group.add(plinth);

    const kioskMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 });
    const kiosk = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.6, 3.6), kioskMat);
    kiosk.position.y = 1.5;
    group.add(kiosk);

    const roofMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5 });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.28, 4.1), roofMat);
    roof.position.y = 2.94;
    group.add(roof);
  }

  private createLabelSprite(text: string, accentHex: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.beginPath();
    ctx.roundRect(8, 12, 496, 72, 18);
    ctx.fill();

    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.font = 'bold 30px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const trimmed = text.length > 26 ? `${text.slice(0, 25)}…` : text;
    ctx.fillText(trimmed, 256, 48);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(16, 3, 1);
    return sprite;
  }
}
