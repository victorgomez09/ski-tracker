import * as THREE from 'three';
import { ProceduralTerrain } from './ProceduralTerrain.js';
import { GeoProjection } from './GeoProjection.js';
import { OSMSkiPiste } from './ResortDataService.js';
import { SkierAvatar } from './SkierAvatar.js';
import { SnowParticles } from './SnowParticles.js';

interface AISkierAgent {
  avatar: SkierAvatar;
  curve: THREE.CatmullRomCurve3;
  progress: number;
  speed: number;
  carvePhase: number;
  carveFreq: number;
  carveWidth: number;
}

interface SnowcatAgent {
  mesh: THREE.Group;
  beacon: THREE.Mesh;
  curve: THREE.CatmullRomCurve3;
  progress: number;
  direction: 1 | -1;
}

/**
 * Tráfico vivo en la montaña:
 * - Hasta 20 riders IA articulados (esquiadores y snowboarders) descendiendo por pistas reales
 *   con giros de carving, flexión de rodillas, contra-rotación y estelas de nieve.
 * - 2-3 Máquinas pisanieves patrullando las pistas principales con faros, rotativo ámbar y estela de fresado.
 */
export class MountainTraffic {
  public group: THREE.Group = new THREE.Group();
  private terrain: ProceduralTerrain;
  private aiSkiers: AISkierAgent[] = [];
  private snowcats: SnowcatAgent[] = [];
  private particles: SnowParticles;
  private elapsed = 0;

  constructor(terrain: ProceduralTerrain, projection: GeoProjection, pistes: OSMSkiPiste[]) {
    this.terrain = terrain;
    this.particles = new SnowParticles();
    this.group.add(this.particles.points);
    this.buildTraffic(terrain, projection, pistes);
  }

  public rebuild(terrain: ProceduralTerrain, projection: GeoProjection, pistes: OSMSkiPiste[]) {
    this.terrain = terrain;
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]);
    }
    this.aiSkiers = [];
    this.snowcats = [];
    this.group.add(this.particles.points);
    this.buildTraffic(terrain, projection, pistes);
  }

  private buildTraffic(terrain: ProceduralTerrain, projection: GeoProjection, pistes: OSMSkiPiste[]) {
    const validCurves: THREE.CatmullRomCurve3[] = [];
    const fallbackPolygonCurves: THREE.CatmullRomCurve3[] = [];

    pistes.forEach((piste) => {
      const coords = piste.geometry_geojson?.coordinates;
      if (!coords || coords.length < 3) return;
      const pts: THREE.Vector3[] = coords.map((pt) => {
        const [x, z] = projection.project(pt[0], pt[1]);
        const y = terrain.getMeshElevationAt(x, z) + 0.04;
        return new THREE.Vector3(x, y, z);
      });

      const isClosedPolygon = pts[0].distanceTo(pts[pts.length - 1]) < 6.0;
      if (isClosedPolygon) {
        // Para áreas poligonales OSM, extraer eje de descenso entre el punto más alto y el más bajo
        let highest = pts[0];
        let lowest = pts[0];
        for (const p of pts) {
          if (p.y > highest.y) highest = p;
          if (p.y < lowest.y) lowest = p;
        }
        if (highest.distanceTo(lowest) > 35) {
          const mid = highest.clone().lerp(lowest, 0.5);
          mid.y = terrain.getMeshElevationAt(mid.x, mid.z) + 0.04;
          fallbackPolygonCurves.push(new THREE.CatmullRomCurve3([highest.clone(), mid, lowest.clone()]));
        }
        return;
      }

      // Orientar siempre cuesta abajo (del punto más alto al más bajo)
      if (pts[0].y < pts[pts.length - 1].y) {
        pts.reverse();
      }
      validCurves.push(new THREE.CatmullRomCurve3(pts));
    });

    const curvesToUse = validCurves.length > 0 ? validCurves : fallbackPolygonCurves;
    if (curvesToUse.length === 0) return;

    // 1. Riders IA articulados en pistas (70% esquí, 30% snowboard)
    const jacketColors = [0x0284c7, 0xf59e0b, 0x10b981, 0x8b5cf6, 0xec4899, 0xef4444, 0x06b6d4];
    const skierCount = Math.min(20, Math.max(6, curvesToUse.length));

    for (let i = 0; i < skierCount; i++) {
      const curve = curvesToUse[(i * 3) % curvesToUse.length];
      const color = jacketColors[i % jacketColors.length];
      const avatar = new SkierAvatar(color);
      if (i % 3 === 1) {
        avatar.setRiderMode('snowboard', i % 2 === 0 ? 'regular' : 'goofy');
      }
      avatar.group.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) obj.castShadow = true;
      });
      this.group.add(avatar.group);

      this.aiSkiers.push({
        avatar,
        curve,
        progress: Math.random(),
        speed: 0.014 + Math.random() * 0.020,
        carvePhase: Math.random() * Math.PI * 2,
        carveFreq: 1.8 + Math.random() * 1.1,
        carveWidth: 2.8 + Math.random() * 2.8,
      });
    }

    // 2. Máquinas pisanieves en las pistas más largas
    const sortedCurves = [...curvesToUse].sort((a, b) => b.getLength() - a.getLength());
    const catCount = Math.min(3, sortedCurves.length);
    for (let c = 0; c < catCount; c++) {
      const { mesh, beacon } = this.createSnowcatMesh();
      this.group.add(mesh);
      this.snowcats.push({
        mesh,
        beacon,
        curve: sortedCurves[c],
        progress: c * 0.32 + 0.08,
        direction: c % 2 === 0 ? 1 : -1,
      });
    }
  }

  private createSnowcatMesh(): { mesh: THREE.Group; beacon: THREE.Mesh } {
    const cat = new THREE.Group();
    const redMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.45, metalness: 0.2 });
    const trackMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, metalness: 0.8, roughness: 0.15 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.85, roughness: 0.3 });

    [-1.35, 1.35].forEach((ox) => {
      const track = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.75, 4.2), trackMat);
      track.position.set(ox, 0.38, 0);
      cat.add(track);
    });

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 3.8), redMat);
    chassis.position.set(0, 0.8, 0);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.35, 2.0), redMat);
    cabin.position.set(0, 1.75, 0.4);
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.85, 2.06), glassMat);
    windshield.position.set(0, 1.82, 0.4);

    const blade = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.9, 0.25), steelMat);
    blade.position.set(0, 0.5, 2.35);
    const tiller = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.45, 0.8), redMat);
    tiller.position.set(0, 0.32, -2.35);

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
    const clampedDt = Math.min(dt, 0.05);
    this.elapsed += clampedDt;

    const up = new THREE.Vector3(0, 1, 0);

    // Animar riders IA con slalom articulado y estela de nieve
    this.aiSkiers.forEach((agent, idx) => {
      agent.progress = (agent.progress + agent.speed * clampedDt) % 1.0;
      const pt = agent.curve.getPointAt(agent.progress);
      const tangent = agent.curve.getTangentAt(agent.progress);
      const flatForward = new THREE.Vector3(tangent.x, 0, tangent.z).normalize();
      const right = new THREE.Vector3(-flatForward.z, 0, flatForward.x).normalize();

      const phase = this.elapsed * agent.carveFreq + agent.carvePhase;
      const carveOffset = Math.sin(phase) * agent.carveWidth;
      const carveSlope = Math.cos(phase);

      const pos = pt.clone().addScaledVector(right, carveOffset);
      pos.y = this.terrain.getMeshElevationAt(pos.x, pos.z) + 0.02;
      agent.avatar.group.position.copy(pos);

      const steer = carveSlope * 0.85;
      const yaw = Math.atan2(flatForward.x, flatForward.z) + carveSlope * 0.36;
      const slopePitch = -Math.asin(Math.max(-0.6, Math.min(0.6, tangent.y)));
      agent.avatar.group.rotation.set(slopePitch, yaw, 0, 'YXZ');

      const roll = -carveSlope * 0.42;
      agent.avatar.updatePose({
        roll,
        crouch: 0.22 + Math.abs(carveSlope) * 0.25,
        skidAngle: carveSlope * 0.12,
        steerInput: steer,
        speedMs: 14,
        isGrounded: true,
        landingImpact: 0,
        isPushing: false,
        timeSec: this.elapsed + idx,
      });

      // Emitir sutil spray de nieve en el ápice de cada giro
      if (Math.abs(carveSlope) > 0.72 && Math.random() < 0.35) {
        const sprayDir = right.clone().multiplyScalar(carveSlope > 0 ? -1 : 1);
        this.particles.emit(pos, sprayDir, 0.55, 1);
      }
    });

    // Animar pisanieves ida y vuelta con estela de fresado
    const blinkOn = Math.sin(this.elapsed * 10) > 0;
    this.snowcats.forEach((cat) => {
      cat.progress += cat.direction * 0.004 * clampedDt;
      if (cat.progress >= 0.96) {
        cat.progress = 0.96;
        cat.direction = -1;
      } else if (cat.progress <= 0.04) {
        cat.progress = 0.04;
        cat.direction = 1;
      }

      const pt = cat.curve.getPointAt(cat.progress);
      pt.y = this.terrain.getMeshElevationAt(pt.x, pt.z) + 0.02;
      const tangent = cat.curve.getTangentAt(cat.progress).multiplyScalar(cat.direction);
      cat.mesh.position.copy(pt);
      const pitch = -Math.asin(Math.max(-0.5, Math.min(0.5, tangent.y)));
      cat.mesh.rotation.set(pitch, Math.atan2(tangent.x, tangent.z), 0, 'YXZ');
      cat.beacon.visible = blinkOn;

      if (Math.random() < 0.4) {
        const rearPos = pt.clone().addScaledVector(tangent, -2.4);
        this.particles.emit(rearPos, up, 0.35, 1);
      }
    });

    this.particles.update(clampedDt);
  }
}
