import * as THREE from 'three';
import { ProceduralTerrain } from './ProceduralTerrain.js';
import { SkierAvatar } from './SkierAvatar.js';
import { SnowParticles } from './SnowParticles.js';
import { SkiAudio } from './SkiAudio.js';
import { RideableLift } from './ProceduralLifts.js';

export interface SkierInputState {
  left: boolean;
  right: boolean;
  tuck: boolean;
  brake: boolean;
}

export type SkierCameraMode = 'third_person' | 'first_person' | 'cinematic';

export interface SkierTelemetry {
  speedKmh: number;
  altitudeMeters: number;
  slopePercent: number;
  cameraMode: SkierCameraMode;
  nearbyLiftName: string | null;
  ridingLiftName: string | null;
  jumpCompleted: { airTimeSec: number; distanceMeters: number } | null;
  sessionDistanceKm: number;
  sessionDropMeters: number;
  sessionMaxSpeedKmh: number;
  sessionRuns: number;
}

/**
 * Controlador físico de esquí y cámara de persecución en 3ª persona:
 * - Aceleración por gravedad proyectada sobre la pendiente real del terreno.
 * - Canteo / Carving con agarre lateral y pérdida de velocidad controlada en giros cerrados.
 * - Frenado derrapado (Hockey Stop) con estela de nieve en polvo.
 * - Cámara cinemática suavizada con inclinación lateral (roll) y FOV dinámico según velocidad.
 */
export class SkierController {
  public avatar: SkierAvatar;
  public particles: SnowParticles;
  public audio: SkiAudio;

  public position = new THREE.Vector3(180, 120, 260);
  public velocity = new THREE.Vector3(0, 0, -4);
  public heading = Math.PI; // Mirando hacia -Z (hacia el valle de Prado Llano)

  private terrain: ProceduralTerrain;
  private input: SkierInputState = { left: false, right: false, tuck: false, brake: false };
  private cameraPos = new THREE.Vector3();
  private cameraLookAt = new THREE.Vector3();
  private currentRoll = 0;
  private currentCrouch = 0;
  private currentSkid = 0;
  private cameraRoll = 0;
  public isGrounded = true;

  private baseAltitudeMeters = 1860;
  private summitAltitudeMeters = 2280;
  private snowFrictionMultiplier = 1.0;
  private powderSprayMultiplier = 1.0;
  // Las pistas van al ras del terreno (+0.06m) para transición fluida con el fuera de pista
  private readonly pisteSurfaceOffset = 0.06;
  private baseSpawnPoint = new THREE.Vector3(240, 14, -400);
  private baseHeading = 0; // Mirando hacia +Z (hacia las pistas/cumbre desde Prado Llano)
  private summitSpawnPoint = new THREE.Vector3(160, 120, 240);
  private summitHeading = Math.PI;

  private rideableLifts: RideableLift[] = [];
  private nearbyLift: RideableLift | null = null;
  private ridingLift: { lift: RideableLift; progress: number; durationSec: number; speedMs: number } | null = null;

  private cameraMode: SkierCameraMode = 'third_person';
  private wasGrounded = true;
  private airTimeSec = 0;
  private jumpStartPos = new THREE.Vector3();

  private sessionDistanceMeters = 0;
  private sessionDropMeters = 0;
  private sessionMaxSpeedKmh = 0;
  private sessionRuns = 0;
  private currentRunDropMeters = 0;
  private runCountedForDescent = false;
  private lastSessionPos = new THREE.Vector3();
  private lastSessionAltMeters: number | null = null;

  constructor(terrain: ProceduralTerrain) {
    this.terrain = terrain;
    this.avatar = new SkierAvatar();
    this.particles = new SnowParticles();
    this.audio = new SkiAudio();

    this.bindKeyboard();
    this.respawnAtBase();
  }

  public setAltitudeRange(baseAlt: number, summitAlt: number) {
    this.baseAltitudeMeters = baseAlt;
    this.summitAltitudeMeters = summitAlt;
  }

  /**
   * Ajusta la física de deslizamiento y estela de nieve según el parte real de la estación.
   */
  public setSnowCondition(condition: string) {
    if (condition === 'powder') {
      this.snowFrictionMultiplier = 1.15;
      this.powderSprayMultiplier = 1.65;
    } else if (condition === 'hard_packed') {
      this.snowFrictionMultiplier = 0.78;
      this.powderSprayMultiplier = 0.75;
    } else if (condition === 'spring' || condition === 'wet') {
      this.snowFrictionMultiplier = 1.35;
      this.powderSprayMultiplier = 0.85;
    } else {
      this.snowFrictionMultiplier = 1.0;
      this.powderSprayMultiplier = 1.0;
    }
  }

  public setRideableLifts(lifts: RideableLift[]) {
    this.rideableLifts = lifts;
    this.nearbyLift = null;
    this.ridingLift = null;
  }

  private getStandardLiftSpeedMs(liftType: string): number {
    switch (liftType) {
      case 'magic_carpet':
        return 1.8; // ~6.5 km/h (cinta transportadora)
      case 'rope_tow':
        return 2.5; // ~9 km/h (telecuerda)
      case 'drag_lift':
      case 't-bar':
      case 'platter':
        return 4.2; // ~15 km/h (telesquí / arrastre)
      case 'gondola':
      case 'cable_car':
        return 7.0; // ~25 km/h (telecabina)
      case 'chair_lift':
      default:
        return 5.5; // ~20 km/h (telesilla desembragable estándar)
    }
  }

  public boardNearbyLift(): boolean {
    if (this.ridingLift || !this.nearbyLift) return false;
    const dist = this.nearbyLift.startPos.distanceTo(this.nearbyLift.endPos);
    const speedMs = this.getStandardLiftSpeedMs(this.nearbyLift.liftType);
    const durationSec = Math.max(8, dist / speedMs);
    this.ridingLift = { lift: this.nearbyLift, progress: 0, durationSec, speedMs };
    this.velocity.set(0, 0, 0);
    this.input = { left: false, right: false, tuck: false, brake: false };
    return true;
  }

  public skipLiftRide() {
    if (!this.ridingLift) return;
    const { lift } = this.ridingLift;
    this.ridingLift = null;

    // Aparecer justo en el desembarque superior mirando cuesta abajo hacia la base
    const exitHeading = Math.atan2(lift.startPos.x - lift.endPos.x, lift.startPos.z - lift.endPos.z);
    const exitY = this.terrain.getElevationAt(lift.endPos.x, lift.endPos.z) + this.pisteSurfaceOffset;
    this.spawnAt(lift.endPos.x, exitY, lift.endPos.z, exitHeading, 3.0);
  }

  public setSpawnPoints(
    baseX: number,
    baseZ: number,
    baseHeading: number,
    summitX: number,
    summitZ: number,
    summitHeading: number
  ) {
    this.baseSpawnPoint.set(baseX, this.terrain.getElevationAt(baseX, baseZ), baseZ);
    this.baseHeading = baseHeading;
    this.summitSpawnPoint.set(summitX, this.terrain.getElevationAt(summitX, summitZ), summitZ);
    this.summitHeading = summitHeading;
  }

  public setInput(key: keyof SkierInputState, active: boolean) {
    if (this.ridingLift) {
      this.input = { left: false, right: false, tuck: false, brake: false };
      return;
    }
    this.input[key] = active;
  }

  public respawnAtBase() {
    const spawnY = this.terrain.getElevationAt(this.baseSpawnPoint.x, this.baseSpawnPoint.z) + this.pisteSurfaceOffset;
    this.spawnAt(this.baseSpawnPoint.x, spawnY, this.baseSpawnPoint.z, this.baseHeading, 0);
  }

  public respawnAtSummit() {
    const spawnY = this.terrain.getElevationAt(this.summitSpawnPoint.x, this.summitSpawnPoint.z) + this.pisteSurfaceOffset;
    this.spawnAt(this.summitSpawnPoint.x, spawnY, this.summitSpawnPoint.z, this.summitHeading, 5.0);
  }

  public teleportTo(x: number, z: number, heading = this.heading) {
    this.ridingLift = null;
    const y = this.terrain.getElevationAt(x, z) + this.pisteSurfaceOffset;
    this.spawnAt(x, y, z, heading, 0);
  }

  public cycleCameraMode(): SkierCameraMode {
    const order: SkierCameraMode[] = ['third_person', 'first_person', 'cinematic'];
    const idx = order.indexOf(this.cameraMode);
    this.cameraMode = order[(idx + 1) % order.length];
    this.avatar.group.visible = this.cameraMode !== 'first_person';
    return this.cameraMode;
  }

  public getCameraMode(): SkierCameraMode {
    return this.cameraMode;
  }

  private spawnAt(x: number, y: number, z: number, heading: number, initialSpeed: number) {
    this.position.set(x, y, z);
    this.heading = heading;
    const forward = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    this.velocity.copy(forward).multiplyScalar(initialSpeed);
    this.currentRoll = 0;
    this.currentCrouch = 0;
    this.currentSkid = 0;
    this.cameraRoll = 0;
    this.isGrounded = true;
    this.wasGrounded = true;
    this.airTimeSec = 0;
    this.lastSessionPos.copy(this.position);
    this.lastSessionAltMeters = null;
    this.currentRunDropMeters = 0;
    this.runCountedForDescent = false;

    this.avatar.group.position.copy(this.position);
    this.avatar.group.rotation.set(0, this.heading, 0);
    this.avatar.group.visible = this.cameraMode !== 'first_person';

    // Inicializar cámara justo detrás del esquiador
    this.cameraPos.copy(this.position).addScaledVector(forward, -11).add(new THREE.Vector3(0, 4.5, 0));
    this.cameraLookAt.copy(this.position).addScaledVector(forward, 7);
  }

  private bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyC') {
        this.cycleCameraMode();
        return;
      }
      if (this.ridingLift) {
        if (e.code === 'Space') {
          this.skipLiftRide();
        }
        return; // Bloquear giro, impulso, frenada y respawn mientras se sube en cualquier remonte
      }
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.input.left = true;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.input.right = true;
      if (e.code === 'ArrowUp' || e.code === 'KeyW') this.input.tuck = true;
      if (e.code === 'ArrowDown' || e.code === 'KeyS' || e.code === 'Space') this.input.brake = true;
      if (e.code === 'KeyE') this.boardNearbyLift();
      if (e.code === 'KeyR') this.respawnAtBase();
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.input.left = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.input.right = false;
      if (e.code === 'ArrowUp' || e.code === 'KeyW') this.input.tuck = false;
      if (e.code === 'ArrowDown' || e.code === 'KeyS' || e.code === 'Space') this.input.brake = false;
    });
  }

  public update(dt: number, camera: THREE.PerspectiveCamera): SkierTelemetry {
    const clampedDt = Math.min(dt, 0.05);

    // MODO REMONTANDO: el esquiador viaja en el telesilla/remonte hacia la cumbre
    if (this.ridingLift) {
      this.ridingLift.progress += clampedDt / this.ridingLift.durationSec;
      if (this.ridingLift.progress >= 1) {
        this.skipLiftRide();
      } else {
        const pt = this.ridingLift.lift.uphillCurve.getPointAt(this.ridingLift.progress);
        const tangent = this.ridingLift.lift.uphillCurve.getTangentAt(this.ridingLift.progress);
        // En remontes de superficie (telesquí, telecuerda, cinta), mantener los esquís al ras de la nieve
        if (!this.ridingLift.lift.isChair) {
          pt.y = this.terrain.getElevationAt(pt.x, pt.z) + this.pisteSurfaceOffset;
        }
        this.position.copy(pt);
        this.heading = Math.atan2(tangent.x, tangent.z);

        this.avatar.group.position.copy(pt);
        this.avatar.group.rotation.set(0, this.heading, 0);
        this.avatar.updatePose(0, this.ridingLift.lift.isChair ? 0.28 : 0.05, 0);

        this.particles.update(clampedDt);
        this.audio.update(4, 0, false);

        const forward = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
        const desiredCam = pt.clone().addScaledVector(forward, -12).add(new THREE.Vector3(0, 4.5, 0));
        const desiredLook = pt.clone().addScaledVector(forward, 10);
        this.cameraPos.lerp(desiredCam, 1 - Math.exp(-6 * clampedDt));
        this.cameraLookAt.lerp(desiredLook, 1 - Math.exp(-8 * clampedDt));
        camera.position.copy(this.cameraPos);
        camera.lookAt(this.cameraLookAt);

        const verticalRange = Math.max(1, this.terrain.verticalDropMeters || 420);
        const normElev = Math.max(0, Math.min(1, (this.position.y - 14) / verticalRange));
        const altitudeMeters = Math.round(
          this.baseAltitudeMeters + normElev * (this.summitAltitudeMeters - this.baseAltitudeMeters)
        );
        this.lastSessionPos.copy(this.position);
        this.lastSessionAltMeters = null;
        this.currentRunDropMeters = 0;
        this.runCountedForDescent = false;
        return {
          speedKmh: Math.round(this.ridingLift.speedMs * 3.6),
          altitudeMeters,
          slopePercent: 0,
          cameraMode: this.cameraMode,
          nearbyLiftName: null,
          ridingLiftName: `${this.ridingLift.lift.name} (${Math.round(this.ridingLift.progress * 100)}%)`,
          jumpCompleted: null,
          sessionDistanceKm: Number((this.sessionDistanceMeters / 1000).toFixed(2)),
          sessionDropMeters: Math.round(this.sessionDropMeters),
          sessionMaxSpeedKmh: Math.round(this.sessionMaxSpeedKmh),
          sessionRuns: this.sessionRuns,
        };
      }
    }

    // Detectar si está cerca de la base de algún remonte (radio 28m)
    this.nearbyLift = null;
    let bestDistSq = 28 * 28;
    for (let i = 0; i < this.rideableLifts.length; i++) {
      const l = this.rideableLifts[i];
      const dx = this.position.x - l.startPos.x;
      const dz = this.position.z - l.startPos.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        this.nearbyLift = l;
      }
    }

    // 1. Calcular pendiente del terreno mediante diferencias finitas
    const eps = 1.2;
    const hRight = this.terrain.getElevationAt(this.position.x + eps, this.position.z);
    const hLeft = this.terrain.getElevationAt(this.position.x - eps, this.position.z);
    const hFwd = this.terrain.getElevationAt(this.position.x, this.position.z + eps);
    const hBack = this.terrain.getElevationAt(this.position.x, this.position.z - eps);

    const gradX = (hRight - hLeft) / (2 * eps);
    const gradZ = (hFwd - hBack) / (2 * eps);

    // Normal de la superficie y vector caída de pendiente (fall line)
    const normal = new THREE.Vector3(-gradX, 1, -gradZ).normalize();

    // 2. Dirección de giro (steering)
    const steerInput = (this.input.left ? 1 : 0) - (this.input.right ? 1 : 0);
    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const turnRate = (1.55 + Math.min(1.0, horizSpeed / 18) * 0.45) * (this.input.brake ? 1.25 : 1.0);
    this.heading += steerInput * turnRate * clampedDt;

    const forward = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);

    // 3. Física de gravedad, agarre de cantos y resistencia aerodinámica
    if (this.isGrounded) {
      // Aceleración gravitatoria proyectada sobre la pendiente (g = 11.5 m/s² ajustada a escala jugable)
      const gravity = 11.5;
      const slopeAccelX = -gradX * gravity;
      const slopeAccelZ = -gradZ * gravity;

      this.velocity.x += slopeAccelX * clampedDt;
      this.velocity.z += slopeAccelZ * clampedDt;

      // Descomponer velocidad en componente longitudinal (deslizamiento) y lateral (derrape)
      const vForward = this.velocity.x * forward.x + this.velocity.z * forward.z;
      const vRight = this.velocity.x * right.x + this.velocity.z * right.z;

      // Agarre lateral de cantos (carving grip): redirige energía lateral hacia adelante
      const edgeGrip = this.input.brake ? 2.8 : 7.5;
      const retainedRight = vRight * Math.exp(-edgeGrip * clampedDt);
      const redirectedForward = vForward + Math.abs(vRight - retainedRight) * (this.input.brake ? 0.05 : 0.45);

      // Fricción de nieve modulada por el parte meteorológico real + resistencia aerodinámica
      const snowDrag = (this.input.brake ? 2.4 : this.input.tuck ? 0.04 : 0.08) * this.snowFrictionMultiplier;
      const aeroDrag = (this.input.tuck ? 0.008 : 0.015) * horizSpeed;
      const totalFriction = snowDrag + aeroDrag;

      const finalForward = redirectedForward * Math.exp(-totalFriction * clampedDt);
      this.velocity.x = forward.x * finalForward + right.x * retainedRight;
      this.velocity.z = forward.z * finalForward + right.z * retainedRight;

      // Empuje suave inicial si está parado en llano y pulsa avanzar (W/Up)
      if (this.input.tuck && horizSpeed < 6) {
        this.velocity.x += forward.x * 5.0 * clampedDt;
        this.velocity.z += forward.z * 5.0 * clampedDt;
      }
    } else {
      // En el aire: gravedad vertical y mínima resistencia
      this.velocity.y -= 16.0 * clampedDt;
      this.velocity.x *= Math.exp(-0.02 * clampedDt);
      this.velocity.z *= Math.exp(-0.02 * clampedDt);
    }

    // Limitar velocidad máxima realista (~95 km/h = 26.4 m/s)
    const maxSpeed = this.input.tuck ? 26.5 : 22.0;
    const newHorizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (newHorizSpeed > maxSpeed) {
      const scale = maxSpeed / newHorizSpeed;
      this.velocity.x *= scale;
      this.velocity.z *= scale;
    }

    // 4. Integrar posición y colisión con el terreno
    this.position.x += this.velocity.x * clampedDt;
    this.position.z += this.velocity.z * clampedDt;
    this.position.y += this.velocity.y * clampedDt;

    // Mantener dentro de los límites dinámicos de la estación completa
    const boundX = this.terrain.width * 0.47;
    const boundZ = this.terrain.depth * 0.47;
    if (Math.abs(this.position.x) > boundX) {
      this.position.x = Math.sign(this.position.x) * boundX;
      this.velocity.x *= -0.3;
    }
    if (Math.abs(this.position.z) > boundZ) {
      this.position.z = Math.sign(this.position.z) * boundZ;
      this.velocity.z *= -0.3;
    }

    const surfaceY = this.terrain.getElevationAt(this.position.x, this.position.z) + this.pisteSurfaceOffset;
    if (this.position.y <= surfaceY + 0.12) {
      this.position.y = surfaceY;
      this.velocity.y = (this.velocity.x * gradX + this.velocity.z * gradZ);
      this.isGrounded = true;
    } else {
      this.isGrounded = false;
    }

    // Detección de saltos y tiempo en el aire (Air Time)
    let jumpCompleted: { airTimeSec: number; distanceMeters: number } | null = null;
    if (this.wasGrounded && !this.isGrounded) {
      this.airTimeSec = 0;
      this.jumpStartPos.copy(this.position);
    } else if (!this.isGrounded) {
      this.airTimeSec += clampedDt;
    } else if (!this.wasGrounded && this.isGrounded) {
      if (this.airTimeSec >= 0.45) {
        const dist = Math.hypot(this.position.x - this.jumpStartPos.x, this.position.z - this.jumpStartPos.z);
        if (dist >= 3) {
          jumpCompleted = {
            airTimeSec: Number(this.airTimeSec.toFixed(1)),
            distanceMeters: Math.round(dist),
          };
        }
      }
      this.airTimeSec = 0;
    }
    this.wasGrounded = this.isGrounded;

    // 5. Animar avatar (orientación a la pendiente, canteo, huevo y hockey stop)
    const targetRoll = -steerInput * Math.min(0.55, newHorizSpeed * 0.035);
    const targetCrouch = this.input.tuck ? 1.0 : this.input.brake ? 0.35 : 0.1;
    const targetSkid = this.input.brake ? (steerInput !== 0 ? steerInput * 0.95 : 0.85) : 0;

    const poseLerp = 1 - Math.exp(-10 * clampedDt);
    this.currentRoll = THREE.MathUtils.lerp(this.currentRoll, targetRoll, poseLerp);
    this.currentCrouch = THREE.MathUtils.lerp(this.currentCrouch, targetCrouch, poseLerp);
    this.currentSkid = THREE.MathUtils.lerp(this.currentSkid, targetSkid, poseLerp);

    this.avatar.group.position.copy(this.position);

    // Alinear el avatar suavemente con el vector forward y la normal del terreno
    const slopeForward = forward.clone().projectOnPlane(normal).normalize();
    const slopeRight = new THREE.Vector3().crossVectors(normal, slopeForward).normalize();
    const rotMatrix = new THREE.Matrix4().makeBasis(slopeRight, normal, slopeForward);
    const targetQuat = new THREE.Quaternion().setFromRotationMatrix(rotMatrix);
    this.avatar.group.quaternion.slerp(targetQuat, 1 - Math.exp(-12 * clampedDt));
    this.avatar.updatePose(this.currentRoll, this.currentCrouch, this.currentSkid);

    // 6. Partículas de nieve en polvo al carvear o frenar (intensificadas en nieve polvo)
    const carveIntensity = Math.min(1, (Math.abs(steerInput) * 0.65 + (this.input.brake ? 1.0 : 0)) * (newHorizSpeed / 12));
    if (this.isGrounded && newHorizSpeed > 2.5 && carveIntensity > 0.15) {
      const sprayDir = right.clone().multiplyScalar(steerInput >= 0 ? 1 : -1);
      const emitCount = Math.min(8, Math.ceil(carveIntensity * 5 * this.powderSprayMultiplier));
      this.particles.emit(this.position, sprayDir, carveIntensity * this.powderSprayMultiplier, emitCount);
    }
    this.particles.update(clampedDt);

    // 7. Audio procedural
    this.audio.update(newHorizSpeed, carveIntensity, this.isGrounded);

    // 8. Cámara dinámica multi-modo (3ª Persona / 1ª Persona Casco / Cinematográfica)
    const velDir = newHorizSpeed > 1.5
      ? new THREE.Vector3(this.velocity.x, 0, this.velocity.z).normalize()
      : forward;
    const camDir = forward.clone().lerp(velDir, 0.5).normalize();

    const camSmooth = 1 - Math.exp(-7.5 * clampedDt);
    let desiredCamPos: THREE.Vector3;
    let desiredLookAt: THREE.Vector3;
    let targetFov = 45 + (newHorizSpeed / 26) * 14;

    if (this.cameraMode === 'first_person') {
      desiredCamPos = this.position.clone().add(new THREE.Vector3(0, 1.62, 0)).addScaledVector(camDir, 0.25);
      desiredLookAt = desiredCamPos.clone().addScaledVector(slopeForward, 14.0).add(new THREE.Vector3(0, -0.35, 0));
      targetFov = 68 + (newHorizSpeed / 26) * 12;
      this.cameraPos.copy(desiredCamPos);
      this.cameraLookAt.lerp(desiredLookAt, 1 - Math.exp(-16 * clampedDt));
    } else if (this.cameraMode === 'cinematic') {
      const camDistance = 7.4 + (newHorizSpeed / 25) * 2.2;
      desiredCamPos = this.position.clone()
        .addScaledVector(camDir, -camDistance)
        .addScaledVector(right, 3.6)
        .add(new THREE.Vector3(0, 2.0, 0));
      const camGroundY = this.terrain.getElevationAt(desiredCamPos.x, desiredCamPos.z);
      if (desiredCamPos.y < camGroundY + 1.4) {
        desiredCamPos.y = camGroundY + 1.4;
      }
      desiredLookAt = this.position.clone()
        .addScaledVector(camDir, 4.5)
        .add(new THREE.Vector3(0, 1.15, 0));
      this.cameraPos.lerp(desiredCamPos, camSmooth);
      this.cameraLookAt.lerp(desiredLookAt, 1 - Math.exp(-10 * clampedDt));
    } else {
      const camDistance = 9.5 + (newHorizSpeed / 25) * 3.5;
      const camHeight = 3.8 + (newHorizSpeed / 25) * 0.8;
      desiredCamPos = this.position.clone()
        .addScaledVector(camDir, -camDistance)
        .add(new THREE.Vector3(0, camHeight, 0));

      const camGroundY = this.terrain.getElevationAt(desiredCamPos.x, desiredCamPos.z);
      if (desiredCamPos.y < camGroundY + 2.0) {
        desiredCamPos.y = camGroundY + 2.0;
      }
      const lookHeight = newHorizSpeed < 2.0 ? 2.4 : 1.3;
      desiredLookAt = this.position.clone()
        .addScaledVector(camDir, 7.0)
        .add(new THREE.Vector3(0, lookHeight, 0));
      this.cameraPos.lerp(desiredCamPos, camSmooth);
      this.cameraLookAt.lerp(desiredLookAt, 1 - Math.exp(-10 * clampedDt));
    }

    camera.position.copy(this.cameraPos);
    camera.lookAt(this.cameraLookAt);

    // Inclinación sutil (roll) de cámara al carvear y FOV dinámico con la velocidad
    const rollScale = this.cameraMode === 'first_person' ? 0.32 : 0.22;
    this.cameraRoll = THREE.MathUtils.lerp(this.cameraRoll, this.currentRoll * rollScale, camSmooth);
    camera.rotateZ(this.cameraRoll);

    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, camSmooth);
      camera.updateProjectionMatrix();
    }

    // Calcular altitud real en metros (escala 1:1 respecto al terreno)
    const verticalRange = Math.max(1, this.terrain.verticalDropMeters || 420);
    const normElev = Math.max(0, Math.min(1, (this.position.y - 14) / verticalRange));
    const altitudeMeters = Math.round(this.baseAltitudeMeters + normElev * (this.summitAltitudeMeters - this.baseAltitudeMeters));

    // Acumular métricas de sesión en vivo (distancia, desnivel bajado, vel. máx y bajadas)
    const speedKmh = Math.round(newHorizSpeed * 3.6);
    const stepDist = this.position.distanceTo(this.lastSessionPos);
    if (stepDist > 0.05 && stepDist < 40) {
      this.sessionDistanceMeters += stepDist;
    }
    this.lastSessionPos.copy(this.position);

    if (speedKmh > this.sessionMaxSpeedKmh) {
      this.sessionMaxSpeedKmh = speedKmh;
    }

    if (this.lastSessionAltMeters !== null) {
      const altDelta = this.lastSessionAltMeters - altitudeMeters;
      if (altDelta > 0 && altDelta < 25) {
        this.sessionDropMeters += altDelta;
        this.currentRunDropMeters += altDelta;
        if (!this.runCountedForDescent && this.currentRunDropMeters >= 35) {
          this.sessionRuns += 1;
          this.runCountedForDescent = true;
        }
      }
    }
    this.lastSessionAltMeters = altitudeMeters;

    const slopePercent = Math.round(Math.hypot(gradX, gradZ) * 100);

    return {
      speedKmh,
      altitudeMeters,
      slopePercent,
      cameraMode: this.cameraMode,
      nearbyLiftName: this.nearbyLift ? this.nearbyLift.name : null,
      ridingLiftName: null,
      jumpCompleted,
      sessionDistanceKm: Number((this.sessionDistanceMeters / 1000).toFixed(2)),
      sessionDropMeters: Math.round(this.sessionDropMeters),
      sessionMaxSpeedKmh: Math.round(this.sessionMaxSpeedKmh),
      sessionRuns: this.sessionRuns,
    };
  }
}
