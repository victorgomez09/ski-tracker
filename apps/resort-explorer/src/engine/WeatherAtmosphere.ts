import * as THREE from 'three';
import { LiveWeatherInfo } from './ResortDataService.js';

export type WeatherPreset = 'sunny' | 'sunset' | 'snow' | 'night';
export type WeatherMode = 'live' | 'dry' | 'snow' | 'random';

interface WeatherState {
  bgColor: THREE.Color;
  fogColor: THREE.Color;
  fogDensity: number;
  ambientColor: THREE.Color;
  ambientIntensity: number;
  sunColor: THREE.Color;
  sunIntensity: number;
  sunPos: THREE.Vector3;
  bounceColor: THREE.Color;
  bounceIntensity: number;
  headlampIntensity: number;
  snowOpacity: number;
}

/**
 * Sistema de atmósfera viva y clima dinámico ultra-suave (Fase 10.11):
 * - Modos seleccionables: Tiempo Real (live), Seco (dry), Nevada (snow) y Aleatorio Dinámico (random).
 * - Todas las transiciones de cielo, niebla, sol, foco nocturno y densidad de nevada
 *   se interpolan exponencialmente de forma gradual (~12–15 segundos) sin cambios bruscos.
 */
export class WeatherAtmosphere {
  private scene: THREE.Scene;
  private ambientLight: THREE.AmbientLight;
  private sunLight: THREE.DirectionalLight;
  private bounceLight: THREE.DirectionalLight;
  private headlamp: THREE.SpotLight;
  private headlampTarget: THREE.Object3D;

  private snowPoints: THREE.Points;
  private snowMaterial: THREE.PointsMaterial;
  private snowPositions: Float32Array;
  private readonly snowCount = 1500;

  private terrainMaterial: THREE.ShaderMaterial | null = null;
  private pisteMaterials: THREE.ShaderMaterial[] = [];
  private isAerialView = false;

  private currentPreset: WeatherPreset = 'sunny';
  private randomActive = false;
  private randomTimer = 0;
  private randomInterval = 32;

  private currentState: WeatherState;
  private targetState: WeatherState;

  constructor(
    scene: THREE.Scene,
    ambientLight: THREE.AmbientLight,
    sunLight: THREE.DirectionalLight,
    bounceLight: THREE.DirectionalLight
  ) {
    this.scene = scene;
    this.ambientLight = ambientLight;
    this.sunLight = sunLight;
    this.bounceLight = bounceLight;

    this.headlamp = new THREE.SpotLight(0xfffbeb, 0, 95, Math.PI / 4.5, 0.45, 1.2);
    this.headlampTarget = new THREE.Object3D();
    this.scene.add(this.headlamp);
    this.scene.add(this.headlampTarget);
    this.headlamp.target = this.headlampTarget;

    this.snowPositions = new Float32Array(this.snowCount * 3);
    for (let i = 0; i < this.snowCount; i++) {
      this.snowPositions[i * 3] = (Math.random() - 0.5) * 140;
      this.snowPositions[i * 3 + 1] = Math.random() * 60;
      this.snowPositions[i * 3 + 2] = (Math.random() - 0.5) * 140;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(this.snowPositions, 3));
    this.snowMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.45,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });

    this.snowPoints = new THREE.Points(geom, this.snowMaterial);
    this.snowPoints.visible = false;
    this.snowPoints.frustumCulled = false;
    this.scene.add(this.snowPoints);

    this.currentState = this.buildPresetState('sunny');
    this.targetState = this.buildPresetState('sunny');
    this.applyStateToScene(this.currentState);
  }

  public bindTerrainMaterial(material: THREE.ShaderMaterial) {
    this.terrainMaterial = material;
  }

  public bindPisteMaterials(materials: THREE.ShaderMaterial[]) {
    this.pisteMaterials = materials;
  }

  public setAerialView(enabled: boolean) {
    this.isAerialView = enabled;
    this.applyStateToScene(this.currentState);
  }

  private buildPresetState(preset: WeatherPreset): WeatherState {
    if (preset === 'sunset') {
      return {
        bgColor: new THREE.Color(0xf4a261),
        fogColor: new THREE.Color(0xf6bd8f),
        fogDensity: 0.00028,
        ambientColor: new THREE.Color(0xfde68a),
        ambientIntensity: 0.78,
        sunColor: new THREE.Color(0xff7b54),
        sunIntensity: 1.55,
        sunPos: new THREE.Vector3(-700, 180, 420),
        bounceColor: new THREE.Color(0xd8b4fe),
        bounceIntensity: 0.45,
        headlampIntensity: 0,
        snowOpacity: 0,
      };
    }

    if (preset === 'snow') {
      return {
        bgColor: new THREE.Color(0xcbd5e1),
        fogColor: new THREE.Color(0xdbe3ed),
        fogDensity: 0.0011,
        ambientColor: new THREE.Color(0xf1f5f9),
        ambientIntensity: 1.15,
        sunColor: new THREE.Color(0xf8fafc),
        sunIntensity: 1.05,
        sunPos: new THREE.Vector3(250, 500, 200),
        bounceColor: new THREE.Color(0xe2e8f0),
        bounceIntensity: 0.5,
        headlampIntensity: 0,
        snowOpacity: 0.88,
      };
    }

    if (preset === 'night') {
      return {
        bgColor: new THREE.Color(0x070d1d),
        fogColor: new THREE.Color(0x0b152d),
        fogDensity: 0.00085,
        ambientColor: new THREE.Color(0x3b5998),
        ambientIntensity: 0.48,
        sunColor: new THREE.Color(0x93c5fd),
        sunIntensity: 0.55,
        sunPos: new THREE.Vector3(250, 600, -300),
        bounceColor: new THREE.Color(0x1e3a8a),
        bounceIntensity: 0.25,
        headlampIntensity: 4.5,
        snowOpacity: 0,
      };
    }

    // 'sunny' (Seco)
    return {
      bgColor: new THREE.Color(0xbce0fd),
      fogColor: new THREE.Color(0xdce8f4),
      fogDensity: 0.00016,
      ambientColor: new THREE.Color(0xf1f5f9),
      ambientIntensity: 1.05,
      sunColor: new THREE.Color(0xfffcf5),
      sunIntensity: 1.45,
      sunPos: new THREE.Vector3(450, 800, 350),
      bounceColor: new THREE.Color(0xf8fafc),
      bounceIntensity: 0.5,
      headlampIntensity: 0,
      snowOpacity: 0,
    };
  }

  private applyStateToScene(s: WeatherState) {
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.copy(s.bgColor);
    } else {
      this.scene.background = s.bgColor.clone();
    }

    // En Vista Aérea lejana, atenuar la niebla para ver toda la montaña nítida y sin velo gris
    const effectiveFogDensity = this.isAerialView ? Math.min(0.00012, s.fogDensity * 0.16) : s.fogDensity;

    const fog = this.scene.fog as THREE.FogExp2 | null;
    if (fog) {
      fog.color.copy(s.fogColor);
      fog.density = effectiveFogDensity;
    }

    this.ambientLight.color.copy(s.ambientColor);
    this.ambientLight.intensity = s.ambientIntensity;
    this.sunLight.color.copy(s.sunColor);
    this.sunLight.intensity = s.sunIntensity;
    this.sunLight.position.copy(s.sunPos);
    this.bounceLight.color.copy(s.bounceColor);
    this.bounceLight.intensity = s.bounceIntensity;
    this.headlamp.intensity = s.headlampIntensity;

    this.snowMaterial.opacity = s.snowOpacity;
    this.snowPoints.visible = s.snowOpacity > 0.01;

    // Sincronizar shader del terreno y de todas las pistas con sol, cielo y niebla en vivo
    const syncMaterials = this.terrainMaterial
      ? [this.terrainMaterial, ...this.pisteMaterials]
      : this.pisteMaterials;

    syncMaterials.forEach((mat) => {
      if (!mat.uniforms) return;
      const u = mat.uniforms;
      if (u.sunColor) u.sunColor.value.copy(s.sunColor);
      if (u.skyColor) u.skyColor.value.copy(s.ambientColor);
      if (u.sunDirection) u.sunDirection.value.copy(s.sunPos).normalize();
      if (u.sunIntensity) u.sunIntensity.value = Math.max(0.25, s.sunIntensity / 1.45);
      if (u.fogColor) u.fogColor.value.copy(s.fogColor);
      if (u.fogDensity) u.fogDensity.value = effectiveFogDensity;
    });
  }

  public setRandomDynamic(enabled: boolean) {
    this.randomActive = enabled;
    this.randomTimer = 0;
    if (enabled) {
      this.pickNextRandomWeather();
    }
  }

  private pickNextRandomWeather() {
    const options: WeatherPreset[] = ['sunny', 'sunset', 'snow', 'night'];
    const filtered = options.filter((o) => o !== this.currentPreset);
    const next = filtered[Math.floor(Math.random() * filtered.length)];
    this.setPreset(next);
    this.randomInterval = 28 + Math.random() * 14; // Transición suave cada ~28-42s
  }

  public setPreset(preset: WeatherPreset) {
    this.currentPreset = preset;
    this.targetState = this.buildPresetState(preset);
  }

  /**
   * Adapta la escena 3D automáticamente al clima real y hora actual de la estación.
   */
  public applyLiveWeather(info: LiveWeatherInfo) {
    const hour = new Date().getHours();
    const isNight = hour < 7 || hour >= 21;
    const isSunset = (hour >= 18 && hour < 21) || (hour >= 7 && hour < 9);
    const code = info.weatherCode;

    const isSnowing = info.snowfallTodayCm > 0.3 || (code >= 71 && code <= 77) || code === 85 || code === 86;
    const isFoggy = code === 45 || code === 48;
    const isOvercast = code === 3 || (code >= 51 && code <= 67) || (code >= 80 && code <= 82);

    if (isNight) {
      this.setPreset('night');
      if (isSnowing) this.targetState.snowOpacity = 0.75;
      return;
    }

    if (isSnowing) {
      this.setPreset('snow');
      return;
    }

    if (isSunset) {
      this.setPreset('sunset');
      return;
    }

    this.setPreset('sunny');
    if (isFoggy) {
      this.targetState.bgColor.setHex(0xcbd5e1);
      this.targetState.fogColor.setHex(0xdbe3ed);
      this.targetState.fogDensity = 0.0014;
      this.targetState.sunIntensity = 1.05;
    } else if (isOvercast) {
      this.targetState.bgColor.setHex(0xc4d4e4);
      this.targetState.fogColor.setHex(0xd6e1ed);
      this.targetState.fogDensity = 0.00045;
      this.targetState.sunIntensity = 1.15;
    }
  }

  public update(dt: number, skierPos: THREE.Vector3, skierHeading: number) {
    const clampedDt = Math.min(dt, 0.05);

    if (this.randomActive) {
      this.randomTimer += clampedDt;
      if (this.randomTimer >= this.randomInterval) {
        this.randomTimer = 0;
        this.pickNextRandomWeather();
      }
    }

    // Interpolación ultra-suave hacia targetState (más lenta aún en modo aleatorio)
    const speed = this.randomActive ? 0.22 : 1.8;
    const alpha = 1 - Math.exp(-speed * clampedDt);

    const c = this.currentState;
    const t = this.targetState;
    c.bgColor.lerp(t.bgColor, alpha);
    c.fogColor.lerp(t.fogColor, alpha);
    c.fogDensity = THREE.MathUtils.lerp(c.fogDensity, t.fogDensity, alpha);
    c.ambientColor.lerp(t.ambientColor, alpha);
    c.ambientIntensity = THREE.MathUtils.lerp(c.ambientIntensity, t.ambientIntensity, alpha);
    c.sunColor.lerp(t.sunColor, alpha);
    c.sunIntensity = THREE.MathUtils.lerp(c.sunIntensity, t.sunIntensity, alpha);
    c.sunPos.lerp(t.sunPos, alpha);
    c.bounceColor.lerp(t.bounceColor, alpha);
    c.bounceIntensity = THREE.MathUtils.lerp(c.bounceIntensity, t.bounceIntensity, alpha);
    c.headlampIntensity = THREE.MathUtils.lerp(c.headlampIntensity, t.headlampIntensity, alpha);
    c.snowOpacity = THREE.MathUtils.lerp(c.snowOpacity, t.snowOpacity, alpha);

    this.applyStateToScene(c);

    // Actualizar foco nocturno delante del esquiador
    if (c.headlampIntensity > 0.05) {
      const fwdX = Math.sin(skierHeading);
      const fwdZ = Math.cos(skierHeading);
      this.headlamp.position.set(skierPos.x, skierPos.y + 1.85, skierPos.z);
      this.headlampTarget.position.set(
        skierPos.x + fwdX * 22,
        skierPos.y - 1.5,
        skierPos.z + fwdZ * 22
      );
    }

    // Actualizar copos de nieve alrededor de la posición actual
    if (this.snowPoints.visible) {
      const box = 140;
      const half = box / 2;
      for (let i = 0; i < this.snowCount; i++) {
        const ix = i * 3;
        let x = this.snowPositions[ix] - clampedDt * 2.5;
        let y = this.snowPositions[ix + 1] - clampedDt * 9.5;
        let z = this.snowPositions[ix + 2] + Math.sin(i + y * 0.1) * clampedDt * 1.5;

        if (x < skierPos.x - half) x += box;
        if (x > skierPos.x + half) x -= box;
        if (z < skierPos.z - half) z += box;
        if (z > skierPos.z + half) z -= box;
        if (y < skierPos.y - 10) y = skierPos.y + 42;

        this.snowPositions[ix] = x;
        this.snowPositions[ix + 1] = y;
        this.snowPositions[ix + 2] = z;
      }
      this.snowPoints.geometry.attributes.position.needsUpdate = true;
    }
  }
}
