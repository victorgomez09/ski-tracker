import * as THREE from 'three';
import { ProceduralTerrain } from './ProceduralTerrain.js';
import { GeoProjection } from './GeoProjection.js';
import { OSMSkiPiste } from './ResortDataService.js';

interface AISkierAgent {
  mesh: THREE.Group;
  curve: THREE.CatmullRomCurve3;
  progress: number;
  speed: number;
  carvePhase: number;
}

interface SnowcatAgent {
  mesh: THREE.Group;
  beacon: THREE.Mesh;
  curve: THREE.CatmullRomCurve3;
  progress: number;
  direction: 1 | -1;
}

/**
 * Tráfico vivo en la montaña (Fase 10.11):
 * - Hasta 18 esquiadores IA descendiendo por pistas reales con giros de carving.
 * - 2 Máquinas pisanieves patrullando las pistas principales con faros y rotativo ámbar.
 */
export class MountainTraffic {
  public group: THREE.Group = new THREE.Group();
  private aiSkiers: AISkierAgent[] = [];
  private snowcats: SnowcatAgent[] = [];
  private elapsed = 0;

  constructor(terrain: ProceduralTerrain, projection: GeoProjection, pistes: OSMSkiPiste[]) {
    this.buildTraffic(terrain, projection, pistes);
  }

  public rebuild(terrain: ProceduralTerrain, projection: GeoProjection, pistes: OSMSkiPiste[]) {
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]);
    }
    this.aiSkiers = [];
    this.snowcats = [];
    this.buildTraffic(terrain, projection, pistes);
  }

  private buildTraffic(terrain: ProceduralTerrain, projection: GeoProjection, pistes: OSMSkiPiste[]) {
    const validCurves: THREE.CatmullRomCurve3[] = [];

    pistes.forEach((piste) => {
      const coords = piste.geometry_geojson?.coordinates;
      if (!coords || coords.length < 3) return;
      const pts: THREE.Vector3[] = coords.map((pt) => {
        const [x, z] = projection.project(pt[0], pt[1]);
        const y = terrain.getElevationAt(x, z) + 0.06;
        return new THREE.Vector3(x, y, z);
      });
      validCurves.push(new THREE.CatmullRomCurve3(pts));
    });

    if (validCurves.length === 0) return;

    // 1. Esquiadores IA en pistas
    const jacketColors = [0x0284c7, 0xf59e0b, 0x10b981, 0x8b5cf6, 0xec4899, 0xef4444];
    const skierCount = Math.min(18, Math.max(4, validCurves.length));

    for (let i = 0; i < skierCount; i++) {
      const curve = validCurves[(i * 3) % validCurves.length];
      const color = jacketColors[i % jacketColors.length];
      const mesh = this.createSimpleAISkier(color);
      this.group.add(mesh);

      this.aiSkiers.push({
        mesh,
        curve,
        progress: Math.random(),
        speed: 0.015 + Math.random() * 0.018,
        carvePhase: Math.random() * Math.PI * 2,
      });
    }

    // 2. Máquinas pisanieves en las 2 pistas más largas
    const sortedCurves = [...validCurves].sort((a, b) => b.getLength() - a.getLength());
    const catCount = Math.min(2, sortedCurves.length);
    for (let c = 0; c < catCount; c++) {
      const { mesh, beacon } = this.createSnowcatMesh();
      this.group.add(mesh);
      this.snowcats.push({
        mesh,
        beacon,
        curve: sortedCurves[c],
        progress: c * 0.45 + 0.1,
        direction: c % 2 === 0 ? 1 : -1,
      });
    }
  }

  private createSimpleAISkier(jacketColor: number): THREE.Group {
    const g = new THREE.Group();
    const skiMat = new THREE.MeshStandardMaterial({ color: 0x0f172a });
    const bodyMat = new THREE.MeshStandardMaterial({ color: jacketColor, roughness: 0.65 });
    const helmetMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 });

    const skis = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.04, 1.5), skiMat);
    skis.position.y = 0.02;
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.7, 6), skiMat);
    legs.position.y = 0.4;
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.6, 8), bodyMat);
    torso.position.y = 1.05;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), helmetMat);
    head.position.y = 1.48;

    g.add(skis, legs, torso, head);
    return g;
  }

  private createSnowcatMesh(): { mesh: THREE.Group; beacon: THREE.Mesh } {
    const cat = new THREE.Group();
    const redMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.45, metalness: 0.2 });
    const trackMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, metalness: 0.8, roughness: 0.15 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.85, roughness: 0.3 });

    // Orugas anchas
    [-1.35, 1.35].forEach((ox) => {
      const track = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.75, 4.2), trackMat);
      track.position.set(ox, 0.38, 0);
      cat.add(track);
    });

    // Chasis y cabina roja
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 3.8), redMat);
    chassis.position.set(0, 0.8, 0);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.35, 2.0), redMat);
    cabin.position.set(0, 1.75, 0.4);
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.85, 2.06), glassMat);
    windshield.position.set(0, 1.82, 0.4);

    // Pala delantera y fresadora trasera
    const blade = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.9, 0.25), steelMat);
    blade.position.set(0, 0.5, 2.35);
    const tiller = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.45, 0.8), redMat);
    tiller.position.set(0, 0.32, -2.35);

    // Faros cálidos frontales + rotativo ámbar
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    [-0.7, 0.7].forEach((lx) => {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.1), lightMat);
      lamp.position.set(lx, 2.3, 1.42);
      cat.add(lamp);
    });

    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xf97316 });
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.22, 8), beaconMat);
    beacon.position.set(0, 2.55, 0.4);

    cat.add(chassis, cabin, windshield, blade, tiller, beacon);
    return { mesh: cat, beacon };
  }

  public update(dt: number) {
    this.elapsed += dt;

    // Animar esquiadores IA con slalom suave
    this.aiSkiers.forEach((agent) => {
      agent.progress = (agent.progress + agent.speed * dt) % 1.0;
      const pt = agent.curve.getPointAt(agent.progress);
      const tangent = agent.curve.getTangentAt(agent.progress);
      const right = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

      const carveOffset = Math.sin(this.elapsed * 2.2 + agent.carvePhase) * 3.5;
      agent.mesh.position.copy(pt).addScaledVector(right, carveOffset);
      const yaw = Math.atan2(tangent.x, tangent.z) + Math.cos(this.elapsed * 2.2 + agent.carvePhase) * 0.28;
      agent.mesh.rotation.y = yaw;
      agent.mesh.rotation.z = -Math.cos(this.elapsed * 2.2 + agent.carvePhase) * 0.22;
    });

    // Animar pisanieves ida y vuelta
    const blinkOn = Math.sin(this.elapsed * 10) > 0;
    this.snowcats.forEach((cat) => {
      cat.progress += cat.direction * 0.004 * dt;
      if (cat.progress >= 0.96) {
        cat.progress = 0.96;
        cat.direction = -1;
      } else if (cat.progress <= 0.04) {
        cat.progress = 0.04;
        cat.direction = 1;
      }

      const pt = cat.curve.getPointAt(cat.progress);
      const tangent = cat.curve.getTangentAt(cat.progress).multiplyScalar(cat.direction);
      cat.mesh.position.copy(pt);
      cat.mesh.rotation.y = Math.atan2(tangent.x, tangent.z);
      cat.beacon.visible = blinkOn;
    });
  }
}
