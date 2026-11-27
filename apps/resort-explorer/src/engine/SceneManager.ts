import * as THREE from 'three';
import { ProceduralTerrain } from './ProceduralTerrain.js';
import { ProceduralPistes } from './ProceduralPistes.js';
import { ProceduralLifts } from './ProceduralLifts.js';
import { ProceduralVegetation } from './ProceduralVegetation.js';
import { ProceduralPOIs } from './ProceduralPOIs.js';
import { GeoProjection } from './GeoProjection.js';
import { LiveWeatherInfo, ResortDataService, ResortDataPayload } from './ResortDataService.js';
import { ResortConfig } from './Bridge.js';
import { SkierController, SkierInputState } from './SkierController.js';
import { TerrainTileLoader } from './TerrainTileLoader.js';
import { TacticalMinimap } from './TacticalMinimap.js';
import { WeatherAtmosphere, WeatherMode } from './WeatherAtmosphere.js';
import { MountainTraffic } from './MountainTraffic.js';
import { SkiTracksTrail } from './SkiTracksTrail.js';
import { GraphicsConfig, GraphicsSettings, QualityPreset } from './GraphicsSettings.js';
import { MultiplayerManager, MultiplayerSessionConfig, PeerSummary } from './MultiplayerManager.js';

export class SceneManager {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private terrain!: ProceduralTerrain;
  private pistes!: ProceduralPistes;
  private lifts!: ProceduralLifts;
  private vegetation!: ProceduralVegetation;
  private pois!: ProceduralPOIs;
  private projection!: GeoProjection;
  private skier!: SkierController;
  private minimap!: TacticalMinimap;
  private multiplayer!: MultiplayerManager;
  private activeResortId = 'valdesqui';
  private activeResortName = 'Valdesquí';
  private weather!: WeatherAtmosphere;
  private traffic!: MountainTraffic;
  private tracks!: SkiTracksTrail;
  private sunLight!: THREE.DirectionalLight;
  private skyDomeMesh: THREE.Mesh | null = null;
  private skyDomeMat: THREE.ShaderMaterial | null = null;
  private graphicsSettings: GraphicsSettings = new GraphicsSettings();
  private activeLiveWeather: LiveWeatherInfo | null = null;
  private fpsFrames = 0;
  private fpsAccum = 0;
  private currentFps = 60;
  private isPaused = false;
  private jumpToastTimer: number | null = null;
  private clock = new THREE.Clock();

  // Modo por defecto: esquiar; permite alternar a Vista Aérea para inspeccionar el terreno
  private mode: 'skier' | 'orbit' = 'skier';
  private orbitAngle = Math.PI;
  private orbitDistance = 1400;
  private orbitHeight = 650;
  private isPointerDown = false;
  private prevPointerX = 0;
  private prevPointerY = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    // Proyección geoespacial inicial en escala real 1:1
    const resortData = ResortDataService.getActiveResort();
    this.projection = new GeoProjection(resortData.longitude, resortData.latitude, 1.0);
    if (resortData.bbox) {
      this.projection.setBounds(resortData.bbox[0], resortData.bbox[1], resortData.bbox[2], resortData.bbox[3]);
    }

    // Renderer con sombras suaves PCFSoftShadowMap (Fase 10.12)
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    // Scene — cúpula de cielo procedural (scene.background = null para que siempre sea visible)
    this.scene = new THREE.Scene();
    this.scene.background = null;
    this.scene.fog = new THREE.FogExp2(0xddeeff, 0.00014);

    // Entorno PBR procedural (reflejos reales del cielo y sol en visera, esquís, pilonas y casetas)
    this.setupPBREnvironment();

    // Camera con plano lejano amplio (25 km) para dominios de hasta 270+ pistas
    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.5, 25000);

    // Iluminación
    this.setupLighting();

    // Desbloquear audio al interactuar con teclado o puntero + controles de cámara aérea
    const unlockAudio = () => {
      if (this.skier && this.mode === 'skier') this.skier.audio.start();
    };
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    this.setupOrbitInputs();
    window.addEventListener('resize', this.onResize.bind(this));

    // Inicializar mundo
    this.initWorld();

    // Si viene ?resortId=, ?resort=, o ?estacion= desde la URL, cargar estación + DEM real
    const urlParams = new URLSearchParams(window.location.search);
    const resortParam = urlParams.get('resortId') || urlParams.get('resort') || urlParams.get('estacion');
    if (resortParam) {
      ResortDataService.fetchFromBackend(resortParam).then((liveData) => {
        if (liveData) {
          this.applyResortData(liveData);
        } else {
          this.applyResortData(resortData);
        }
      });
    }

    // Animación
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  private setupPBREnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x4a90d9);

    const skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(50, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x3b82f6, side: THREE.BackSide })
    );
    const groundBounce = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshBasicMaterial({ color: 0xf0f4f8 })
    );
    groundBounce.rotation.x = -Math.PI / 2;
    groundBounce.position.y = -5;

    const sunOrb = new THREE.Mesh(
      new THREE.SphereGeometry(5, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xfffde7 })
    );
    sunOrb.position.set(20, 32, 15);

    envScene.add(skyDome, groundBounce, sunOrb);
    this.scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    this.scene.environmentIntensity = 0.80;
    pmrem.dispose();

    // Cúpula de cielo con gradiente procedural tipo Endless Peaks
    this.addSkyDome();
  }

  private addSkyDome() {
    const skyGeom = new THREE.SphereGeometry(14000, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x1c6fd6) },
        horizonColor: { value: new THREE.Color(0xd2ebfc) },
        sunDir: { value: new THREE.Vector3(0.7, 0.55, 0.42).normalize() },
        sunColor: { value: new THREE.Color(0xfff9ed) },
      },
      vertexShader: `
        varying vec3 vLocalDir;
        void main() {
          vLocalDir = normalize(position);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 sunDir;
        uniform vec3 sunColor;
        varying vec3 vLocalDir;
        void main() {
          vec3 dir = normalize(vLocalDir);
          float h = dir.y;
          float t = smoothstep(0.0, 0.42, max(0.0, h));
          vec3 sky = mix(horizonColor, topColor, pow(t, 0.78));
          float sunDot = max(0.0, dot(dir, normalize(sunDir)));
          float glow = pow(sunDot, 24.0) * 0.35;
          float disc = smoothstep(0.9975, 0.9992, sunDot) * 1.1;
          sky += sunColor * (glow + disc);
          gl_FragColor = vec4(sky, 1.0);
        }
      `,
    });
    const skyMesh = new THREE.Mesh(skyGeom, skyMat);
    skyMesh.renderOrder = -1;
    skyMesh.frustumCulled = false;
    this.skyDomeMat = skyMat;
    this.skyDomeMesh = skyMesh;
    this.scene.add(skyMesh);
  }

  private setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xf1f5f9, 0.42);
    this.scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0x88ccf8, 0x8ea6be, 0.92);
    this.scene.add(hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff9ed, 1.65);
    this.sunLight.position.set(540, 420, 320);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 2500;
    this.sunLight.shadow.camera.left = -120;
    this.sunLight.shadow.camera.right = 120;
    this.sunLight.shadow.camera.top = 120;
    this.sunLight.shadow.camera.bottom = -120;
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.03;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    const bounceSnowLight = new THREE.DirectionalLight(0xdbeafe, 0.45);
    bounceSnowLight.position.set(-400, 120, -400);
    this.scene.add(bounceSnowLight);

    this.weather = new WeatherAtmosphere(this.scene, ambientLight, this.sunLight, bounceSnowLight);
    this.weather.bindHemisphereLight(hemiLight);
    if (this.skyDomeMat) {
      this.weather.bindSkyDomeMaterial(this.skyDomeMat);
    }
  }

  private initWorld() {
    const resortData = ResortDataService.getActiveResort();

    this.terrain = new ProceduralTerrain(2600, 2600, 280);
    this.scene.add(this.terrain.mesh);

    this.pistes = new ProceduralPistes(this.terrain, this.projection, resortData.pistes, resortData.lifts, resortData.pois || []);
    this.terrain.setPisteSurfaceMap(this.pistes.getSurfaceMap());
    this.scene.add(this.pistes.group);

    this.lifts = new ProceduralLifts(this.terrain, this.projection, resortData.lifts, true);
    this.scene.add(this.lifts.group);

    this.vegetation = new ProceduralVegetation(this.terrain, 4500, 650, this.pistes, this.lifts);
    this.scene.add(this.vegetation.group);

    this.pois = new ProceduralPOIs(this.terrain, this.projection, resortData.pois || []);
    this.scene.add(this.pois.group);

    this.traffic = new MountainTraffic(this.terrain, this.projection, resortData.pistes);
    this.scene.add(this.traffic.group);

    // Aplicar perfil gráfico inicial detectado según dispositivo
    this.applyGraphicsConfig(this.graphicsSettings.getConfig());

    this.tracks = new SkiTracksTrail();
    this.scene.add(this.tracks.group);

    this.multiplayer = new MultiplayerManager((status, peerCount) => {
      const badge = document.getElementById('mp-status-badge');
      if (badge) {
        if (status === 'connected') {
          badge.textContent = peerCount > 0 ? `👥 ${peerCount + 1} en sala` : '🟢 Sala activa';
          badge.style.color = '#34d399';
        } else if (status === 'connecting') {
          badge.textContent = '⏳ Conectando...';
          badge.style.color = '#fbbf24';
        } else {
          badge.textContent = '👥 Amigos';
          badge.style.color = '#bae6fd';
        }
      }
    });
    this.scene.add(this.multiplayer.group);
    this.activeResortId = resortData.id;
    this.activeResortName = resortData.name;

    // Controlador del esquiador siempre activo para empezar a esquiar al llegar a la estación
    this.skier = new SkierController(this.terrain, this.pistes);
    this.skier.setAltitudeRange(resortData.base_altitude, resortData.summit_altitude);
    this.skier.setRideableLifts(this.lifts.getRideableLifts());
    const initSpawns = this.computeResortSpawns(resortData);
    this.skier.setSpawnPoints(
      initSpawns.baseX,
      initSpawns.baseZ,
      initSpawns.baseHeading,
      initSpawns.summitX,
      initSpawns.summitZ,
      initSpawns.summitHeading
    );
    this.skier.respawnAtBase();
    this.skier.avatar.group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true;
      }
    });
    this.scene.add(this.skier.avatar.group);
    this.scene.add(this.skier.particles.points);

    this.minimap = new TacticalMinimap((tx, tz, heading) => {
      if (this.tracks) this.tracks.breakStroke();
      this.skier.teleportTo(tx, tz, heading);
      if (this.mode === 'orbit') {
        this.setMode('skier');
      }
    });
    this.minimap.setResortData(resortData, this.projection, this.terrain);

    const hint = document.getElementById('controls-hint');
    if (hint) {
      hint.textContent = 'WASD / Flechas carvear · Shift/J saltar · Espacio frenar · R base';
    }

    const loader = document.getElementById('loading-screen');
    if (loader) {
      loader.style.opacity = '0';
      setTimeout(() => loader.remove(), 500);
    }
  }

  public async applyResortData(data: ResortDataPayload) {
    ResortDataService.setActiveResort(data);
    this.activeResortId = data.id;
    this.activeResortName = data.name;

    // 1. Calcular el bounding box geográfico completo de TODA la estación (pistas + remontes)
    const bounds = this.computeFullGeoBounds(data);
    this.projection.setBounds(bounds.minLon, bounds.minLat, bounds.maxLon, bounds.maxLat);

    // 2. Cargar DEM real (primero desde caché PostgreSQL, si no existe desde AWS Terrarium)
    const padLon = Math.max(0.01, (bounds.maxLon - bounds.minLon) * 0.25);
    const padLat = Math.max(0.01, (bounds.maxLat - bounds.minLat) * 0.25);
    const awsDem = await TerrainTileLoader.loadForResort(
      data.id,
      bounds.minLon - padLon,
      bounds.minLat - padLat,
      bounds.maxLon + padLon,
      bounds.maxLat + padLat,
      ResortDataService.getApiBaseUrl()
    );

    const isValdesqui = data.id === 'valdesqui' || data.name.toLowerCase().includes('valdesqu');

    // 3. Reconstruir montaña real abarcando toda la estación completa
    if (this.terrain) {
      this.terrain.rebuildFromResort(this.projection, data, awsDem);
      this.orbitDistance = Math.max(900, this.terrain.width * 0.62);
      this.orbitHeight = Math.max(450, this.terrain.verticalDropMeters + this.terrain.width * 0.25);
    }

    // 4. Reconstruir pistas, remontes, POIs y vegetación sobre la topografía real
    if (this.pistes && data.pistes) {
      this.pistes.rebuild(this.terrain, this.projection, data.pistes, data.lifts || [], data.pois || []);
      this.terrain?.setPisteSurfaceMap(this.pistes.getSurfaceMap());
    }
    if (this.lifts && data.lifts) {
      this.lifts.rebuild(this.terrain, this.projection, data.lifts, isValdesqui);
    }
    if (this.pois) {
      this.pois.rebuild(this.terrain, this.projection, data.pois || []);
    }
    if (this.traffic && data.pistes) {
      this.traffic.rebuild(this.terrain, this.projection, data.pistes);
    }
    if (this.tracks) {
      this.tracks.clear();
    }
    if (this.vegetation && this.terrain) {
      this.vegetation.rebuild(this.terrain, this.pistes, this.lifts);
    }

    // 5. Colocar al esquiador directamente en la base de la estación listo para esquiar
    if (this.skier) {
      this.skier.setAltitudeRange(data.base_altitude, data.summit_altitude);
      this.skier.setRideableLifts(this.lifts ? this.lifts.getRideableLifts() : []);
      const { baseX, baseZ, baseHeading, summitX, summitZ, summitHeading } = this.computeResortSpawns(data);
      this.skier.setSpawnPoints(baseX, baseZ, baseHeading, summitX, summitZ, summitHeading);
      this.skier.respawnAtBase();
    }

    if (this.minimap) {
      this.minimap.setResortData(data, this.projection, this.terrain);
    }

    this.applyResortConfig({
      name: data.name,
      summitAltitude: data.summit_altitude,
      baseAltitude: data.base_altitude,
      pistesCount: data.pistes?.length,
    });

    // 6. Consultar clima en tiempo real y parte de nieve de la estación
    ResortDataService.fetchLiveWeather(data.id, data.latitude, data.longitude).then((liveWeather) => {
      if (liveWeather) {
        this.activeLiveWeather = liveWeather;
        this.weather?.applyLiveWeather(liveWeather);
        this.skier?.setSnowCondition(liveWeather.snowCondition);
        this.updateLiveWeatherBadge(liveWeather);
      }
    });
  }

  private updateLiveWeatherBadge(info: LiveWeatherInfo) {
    const badge = document.getElementById('live-weather-badge');
    if (!badge) return;
    const depthStr = info.snowDepthCm > 0 ? ` · ${info.snowDepthCm} cm` : '';
    const freshStr = info.snowfallTodayCm > 0.5 ? ` (+${info.snowfallTodayCm.toFixed(0)} cm hoy)` : '';
    badge.textContent = `🌡️ ${info.temperatureC}°C · ❄️ ${info.snowConditionLabel}${depthStr}${freshStr} · 💨 ${info.windSpeedKmh} km/h`;
    badge.style.display = 'inline-block';
  }

  private computeFullGeoBounds(data: ResortDataPayload) {
    if (data.bbox) {
      return {
        minLon: data.bbox[0],
        minLat: data.bbox[1],
        maxLon: data.bbox[2],
        maxLat: data.bbox[3],
      };
    }

    let minLon = Infinity;
    let maxLon = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;

    const scan = (lon: number, lat: number) => {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    };

    (data.pistes || []).forEach((p) => (p.geometry_geojson?.coordinates || []).forEach((pt) => scan(pt[0], pt[1])));
    (data.lifts || []).forEach((l) => (l.geometry_geojson?.coordinates || []).forEach((pt) => scan(pt[0], pt[1])));

    if (!isFinite(minLon)) {
      return {
        minLon: data.longitude - 0.015,
        minLat: data.latitude - 0.015,
        maxLon: data.longitude + 0.015,
        maxLat: data.latitude + 0.015,
      };
    }

    return { minLon, minLat, maxLon, maxLat };
  }

  private computeResortSpawns(data: ResortDataPayload) {
    let baseX = 0;
    let baseZ = 0;
    let summitX = 0;
    let summitZ = 200;

    let lowestLiftY = Infinity;
    let highestY = -Infinity;
    let mainLiftTopX = 0;
    let mainLiftTopZ = 0;
    const liftBases: Array<{ x: number; z: number; y: number; isChair: boolean }> = [];

    // 1. Localizar la base del remonte principal y su dirección de subida hacia el corazón de la montaña
    (data.lifts || []).forEach((lift) => {
      const coords = lift.geometry_geojson?.coordinates;
      if (!coords || coords.length < 2) return;
      const [sx, sz] = this.projection.project(coords[0][0], coords[0][1]);
      const [ex, ez] = this.projection.project(coords[coords.length - 1][0], coords[coords.length - 1][1]);
      const sy = this.terrain.getElevationAt(sx, sz);
      const ey = this.terrain.getElevationAt(ex, ez);
      const isChair = lift.lift_type === 'chair_lift' || lift.lift_type === 'gondola' || lift.lift_type === 'cable_car';

      liftBases.push({ x: sx, z: sz, y: sy, isChair });

      // Priorizar la base de un remonte principal en cota baja (zona de llegada/taquillas)
      const effectiveY = isChair ? sy - 8 : sy;
      if (effectiveY < lowestLiftY) {
        lowestLiftY = effectiveY;
        baseX = sx;
        baseZ = sz;
        mainLiftTopX = ex;
        mainLiftTopZ = ez;
      }
      if (ey > highestY) {
        highestY = ey;
        summitX = ex;
        summitZ = ez;
      }
    });

    // Si no hay remontes, usar pistas
    if (liftBases.length === 0) {
      let lowestPisteY = Infinity;
      (data.pistes || []).forEach((piste) => {
        const coords = piste.geometry_geojson?.coordinates;
        if (!coords || coords.length < 2) return;
        coords.forEach((pt) => {
          const [px, pz] = this.projection.project(pt[0], pt[1]);
          const py = this.terrain.getElevationAt(px, pz);
          if (py < lowestPisteY) {
            lowestPisteY = py;
            baseX = px;
            baseZ = pz;
          }
          if (py > highestY) {
            highestY = py;
            summitX = px;
            summitZ = pz;
          }
        });
      });
    }

    // 2. Si hay POIs de llegada en la base (taquillas, alquiler, cafetería), situar el spawn entre ellos y el remonte
    const baseServicePOIs = (data.pois || []).filter((poi) =>
      ['info', 'rental', 'cafe', 'restaurant', 'ski_school'].includes(poi.category)
    );
    if (baseServicePOIs.length > 0 && liftBases.length > 0) {
      let bestPoi: { x: number; z: number } | null = null;
      let bestDist = 140; // Radio máximo de plaza base (140 m desde el remonte principal)
      baseServicePOIs.forEach((poi) => {
        const [px, pz] = this.projection.project(poi.longitude, poi.latitude);
        const d = Math.hypot(px - baseX, pz - baseZ);
        if (d < bestDist) {
          bestDist = d;
          bestPoi = { x: px, z: pz };
        }
      });
      if (bestPoi) {
        // Punto intermedio en la explanada entre los servicios y el primer remonte
        baseX = baseX * 0.6 + (bestPoi as { x: number; z: number }).x * 0.4;
        baseZ = baseZ * 0.6 + (bestPoi as { x: number; z: number }).z * 0.4;
      }
    }

    // 3. Asegurar que el esquiador aparezca en nieve despejada (~22 m frente/lateral al remonte, sin solaparse)
    const dirX = summitX - baseX;
    const dirZ = summitZ - baseZ;
    const len = Math.hypot(dirX, dirZ) || 1;
    const fwdX = dirX / len;
    const fwdZ = dirZ / len;
    const rightX = -fwdZ;
    const rightZ = fwdX;

    const isTooCloseToLift = (x: number, z: number) =>
      liftBases.some((lb) => Math.hypot(x - lb.x, z - lb.z) < 20);

    if (isTooCloseToLift(baseX, baseZ)) {
      const candidates = [
        { x: baseX + rightX * 22, z: baseZ + rightZ * 22 },
        { x: baseX - rightX * 22, z: baseZ - rightZ * 22 },
        { x: baseX - fwdX * 24, z: baseZ - fwdZ * 24 },
        { x: baseX + rightX * 30 - fwdX * 14, z: baseZ + rightZ * 30 - fwdZ * 14 },
      ];
      const safe = candidates.find((c) => !isTooCloseToLift(c.x, c.z));
      if (safe) {
        baseX = safe.x;
        baseZ = safe.z;
      }
    }

    // Orientar la vista desde la explanada de llegada directamente hacia el centro de la montaña / remonte principal
    const focusX = liftBases.length > 0 ? mainLiftTopX * 0.65 : summitX * 0.65;
    const focusZ = liftBases.length > 0 ? mainLiftTopZ * 0.65 : summitZ * 0.65;
    const toMountain = Math.atan2(focusX - baseX, focusZ - baseZ);
    const toBase = Math.atan2(baseX - summitX, baseZ - summitZ);

    return {
      baseX,
      baseZ,
      baseHeading: toMountain,
      summitX,
      summitZ,
      summitHeading: toBase,
    };
  }

  public applyResortConfig(config: ResortConfig) {
    const titleEl = document.getElementById('resort-name');
    const summitEl = document.getElementById('stat-summit');
    const baseEl = document.getElementById('stat-base');
    const pistesEl = document.getElementById('stat-pistes');

    if (titleEl) titleEl.textContent = config.name;
    if (summitEl) summitEl.textContent = `${config.summitAltitude.toLocaleString()} m`;
    if (baseEl) baseEl.textContent = `${config.baseAltitude.toLocaleString()} m`;
    if (pistesEl && config.pistesCount) pistesEl.textContent = `${config.pistesCount} trazados`;
  }

  public setSkierInput(key: keyof SkierInputState, active: boolean) {
    if (this.skier) {
      this.skier.setInput(key, active);
    }
  }

  public respawnSkier(target: 'base' | 'summit' = 'base') {
    if (this.tracks) this.tracks.breakStroke();
    if (this.skier) {
      if (target === 'summit') {
        this.skier.respawnAtSummit();
      } else {
        this.skier.respawnAtBase();
      }
    }
  }

  public getGraphicsConfig(): GraphicsConfig {
    return this.graphicsSettings.getConfig();
  }

  public getCurrentFps(): number {
    return this.currentFps;
  }

  public setGraphicsPreset(preset: QualityPreset): GraphicsConfig {
    const cfg = this.graphicsSettings.applyPreset(preset);
    this.applyGraphicsConfig(cfg);
    return cfg;
  }

  public updateGraphicsOption(partial: Partial<GraphicsConfig>): GraphicsConfig {
    const cfg = this.graphicsSettings.updatePartial(partial);
    this.applyGraphicsConfig(cfg);
    return cfg;
  }

  private applyGraphicsConfig(cfg: GraphicsConfig) {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.pixelRatioMax));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.renderer.shadowMap.enabled = cfg.shadowsEnabled;
    if (this.sunLight) {
      this.sunLight.castShadow = cfg.shadowsEnabled;
      if (this.sunLight.shadow.mapSize.width !== cfg.shadowMapSize) {
        this.sunLight.shadow.mapSize.width = cfg.shadowMapSize;
        this.sunLight.shadow.mapSize.height = cfg.shadowMapSize;
        if (this.sunLight.shadow.map) {
          this.sunLight.shadow.map.dispose();
          this.sunLight.shadow.map = null;
        }
      }
    }

    if (this.camera.far !== cfg.drawDistance) {
      this.camera.far = cfg.drawDistance;
      this.camera.updateProjectionMatrix();
    }

    if (this.vegetation) {
      this.vegetation.setLODCounts(cfg.treeCount, cfg.rockCount);
    }

    if (this.traffic) {
      this.traffic.group.visible = cfg.trafficEnabled;
    }

    const trackerEnabled = cfg.sessionTrackerEnabled !== false;
    if (this.minimap) {
      this.minimap.setSessionTrailEnabled(trackerEnabled);
    }
    document.querySelectorAll('.session-stat-item').forEach((el) => {
      (el as HTMLElement).style.display = trackerEnabled ? 'flex' : 'none';
    });

    if (this.skier) {
      this.skier.setRiderMode(cfg.riderMode || 'ski', cfg.snowboardStance || 'regular');
    }
  }

  public setWeatherMode(mode: WeatherMode) {
    if (!this.weather) return;
    this.weather.setRandomDynamic(mode === 'random');

    if (mode === 'live') {
      if (this.activeLiveWeather) {
        this.weather.applyLiveWeather(this.activeLiveWeather);
      } else {
        this.weather.setPreset('sunny');
      }
    } else if (mode === 'dry') {
      this.weather.setPreset('sunny');
    } else if (mode === 'snow') {
      this.weather.setPreset('snow');
    }
  }

  public boardNearbyLift() {
    if (this.skier) this.skier.boardNearbyLift();
  }

  public skipLiftRide() {
    if (this.skier) this.skier.skipLiftRide();
  }

  public cycleCameraMode() {
    return this.skier ? this.skier.cycleCameraMode() : 'third_person';
  }

  public setPaused(paused: boolean) {
    this.isPaused = paused;
    if (paused) {
      this.skier?.audio.stop();
    } else {
      this.clock.getDelta();
    }
  }

  public getPaused(): boolean {
    return this.isPaused;
  }

  public getActiveResortInfo(): { id: string; name: string } {
    return { id: this.activeResortId, name: this.activeResortName };
  }

  public connectMultiplayer(cfg: MultiplayerSessionConfig) {
    this.multiplayer?.connect(cfg);
  }

  public disconnectMultiplayer() {
    this.multiplayer?.disconnect();
  }

  public getMultiplayerRoomId(): string | null {
    return this.multiplayer?.getRoomId() ?? null;
  }

  public getMultiplayerPeers(): PeerSummary[] {
    return this.multiplayer ? this.multiplayer.getPeersForUI() : [];
  }

  public teleportToPeer(userId: string): boolean {
    if (!this.multiplayer || !this.skier) return false;
    const pos = this.multiplayer.getPeerPosition(userId);
    if (!pos) return false;
    if (this.tracks) this.tracks.breakStroke();
    this.skier.teleportTo(pos.x, pos.z, pos.heading);
    if (this.mode === 'orbit') this.setMode('skier');
    return true;
  }

  public setMode(mode: 'skier' | 'orbit') {
    this.mode = mode;
    const isOrbit = mode === 'orbit';

    const hint = document.getElementById('controls-hint');
    if (hint) {
      hint.textContent = isOrbit
        ? 'Arrastra para rotar · Rueda/Pellizca para zoom'
        : 'WASD / Flechas para carvear · Espacio frenar · R base';
    }

    const touchControls = document.getElementById('skier-touch-controls');
    const telemetry = document.getElementById('skier-telemetry');
    if (touchControls) touchControls.style.display = isOrbit ? 'none' : 'flex';
    if (telemetry) telemetry.style.display = isOrbit ? 'none' : 'flex';

    if (this.pistes) {
      this.pistes.setAerialHighlight(isOrbit);
    }
    if (this.terrain) {
      this.terrain.setAerialHighlight(isOrbit);
    }
    if (this.weather) {
      this.weather.setAerialView(isOrbit);
    }

    if (this.skier) {
      if (isOrbit) {
        this.skier.audio.stop();
        this.camera.fov = 45;
        this.camera.updateProjectionMatrix();
        this.updateOrbitCamera();
      } else {
        this.skier.audio.start();
      }
    }
  }

  private setupOrbitInputs() {
    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'orbit') return;
      this.isPointerDown = true;
      this.prevPointerX = e.clientX;
      this.prevPointerY = e.clientY;
    });

    window.addEventListener('pointermove', (e) => {
      if (this.mode !== 'orbit' || !this.isPointerDown) return;
      const dx = e.clientX - this.prevPointerX;
      const dy = e.clientY - this.prevPointerY;
      this.prevPointerX = e.clientX;
      this.prevPointerY = e.clientY;

      this.orbitAngle -= dx * 0.006;
      this.orbitHeight = Math.max(80, Math.min(6000, this.orbitHeight - dy * 2.5));
      this.updateOrbitCamera();
    });

    window.addEventListener('pointerup', () => {
      this.isPointerDown = false;
    });

    this.canvas.addEventListener(
      'wheel',
      (e) => {
        if (this.mode !== 'orbit') return;
        this.orbitDistance = Math.max(250, Math.min(12000, this.orbitDistance + e.deltaY * 1.2));
        this.updateOrbitCamera();
      },
      { passive: true }
    );
  }

  private updateOrbitCamera() {
    const cx = Math.sin(this.orbitAngle) * this.orbitDistance;
    const cz = Math.cos(this.orbitAngle) * this.orbitDistance;
    this.camera.position.set(cx, this.orbitHeight, cz);
    this.camera.lookAt(0, (this.terrain?.verticalDropMeters || 300) * 0.4, 0);
  }

  private onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private animate() {
    requestAnimationFrame(this.animate);

    const delta = this.clock.getDelta();

    this.fpsFrames++;
    this.fpsAccum += delta;
    if (this.fpsAccum >= 0.5) {
      this.currentFps = Math.round(this.fpsFrames / this.fpsAccum);
      this.fpsFrames = 0;
      this.fpsAccum = 0;
      const fpsEl = document.getElementById('graphics-fps-val');
      if (fpsEl) fpsEl.textContent = `${this.currentFps} FPS`;
    }

    if (this.isPaused) {
      if (this.skyDomeMesh) {
      this.skyDomeMesh.position.copy(this.camera.position);
    }

    this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.lifts) {
      this.lifts.update(delta);
    }
    if (this.traffic && this.traffic.group.visible) {
      this.traffic.update(delta);
    }

    if (this.mode === 'skier' && this.skier) {
      const telemetry = this.skier.update(delta, this.camera);
      if (this.tracks) {
        if (telemetry.ridingLiftName) {
          this.tracks.breakStroke();
        } else {
          this.tracks.addPoint(
            this.skier.position,
            this.skier.heading,
            this.skier.isGrounded,
            telemetry.skidIntensity,
            telemetry.riderMode
          );
        }
      }
      // Seguir al esquiador con el frustum de sombras manteniendo la dirección exacta del sol
      if (this.sunLight) {
        this.sunLight.target.position.copy(this.skier.position);
        this.sunLight.target.updateMatrixWorld();
        const sunDir = this.weather ? this.weather.getSunDirection() : new THREE.Vector3(0.7, 0.55, 0.42).normalize();
        this.sunLight.position.copy(this.skier.position).addScaledVector(sunDir, 600);
      }
      if (this.minimap) {
        this.minimap.update(this.skier.position.x, this.skier.position.z, this.skier.heading);
      }
      if (this.multiplayer) {
        const pose = this.skier.getPoseSnapshot();
        this.multiplayer.sendLocalState({
          x: this.skier.position.x,
          y: this.skier.position.y,
          z: this.skier.position.z,
          heading: this.skier.heading,
          speedKmh: telemetry.speedKmh,
          riderMode: telemetry.riderMode,
          stance: this.skier.getSnowboardStance(),
          roll: pose.roll,
          crouch: pose.crouch,
          skidAngle: pose.skidAngle,
          isGrounded: pose.isGrounded,
          ridingLiftName: pose.ridingLiftName,
        });
        this.multiplayer.update(delta);
        this.minimap?.setRemotePeers(this.multiplayer.getPeersForUI());
      }
      const speedEl = document.getElementById('skier-speed');
      const altEl = document.getElementById('skier-alt');
      if (speedEl) speedEl.textContent = `${telemetry.speedKmh} km/h`;
      if (altEl) altEl.textContent = `${telemetry.altitudeMeters.toLocaleString()} m`;

      const sessionDistEl = document.getElementById('session-dist');
      const sessionDropEl = document.getElementById('session-drop');
      const sessionMaxEl = document.getElementById('session-max');
      const sessionRunsEl = document.getElementById('session-runs');
      if (sessionDistEl) sessionDistEl.textContent = `${telemetry.sessionDistanceKm.toFixed(2)} km`;
      if (sessionDropEl) sessionDropEl.textContent = `${telemetry.sessionDropMeters} m`;
      if (sessionMaxEl) sessionMaxEl.textContent = `${telemetry.sessionMaxSpeedKmh} km/h`;
      if (sessionRunsEl) sessionRunsEl.textContent = `${telemetry.sessionRuns}`;

      const camBtn = document.getElementById('btn-camera-mode');
      if (camBtn) {
        const camLabels = {
          third_person: '🎥 3ª Persona (C)',
          first_person: '🥽 1ª Persona (C)',
          cinematic: '🎬 Cine (C)',
        };
        const nextLabel = camLabels[telemetry.cameraMode];
        if (camBtn.textContent !== nextLabel) camBtn.textContent = nextLabel;
      }

      const riderBtn = document.getElementById('btn-rider-mode');
      if (riderBtn) {
        const nextRiderLabel = telemetry.riderMode === 'snowboard' ? '🏂 Snowboard' : '⛷️ Esquí';
        if (riderBtn.textContent !== nextRiderLabel) riderBtn.textContent = nextRiderLabel;
      }

      const pisteBadge = document.getElementById('piste-hud-badge');
      const pisteDot = document.getElementById('piste-hud-dot');
      const pisteText = document.getElementById('piste-hud-text');
      if (pisteBadge && pisteDot && pisteText && this.pistes) {
        if (telemetry.ridingLiftName) {
          pisteDot.style.background = '#38bdf8';
          pisteText.textContent = `🚡 ${telemetry.ridingLiftName} · ${telemetry.slopePercent}%`;
        } else {
          const activePiste = this.pistes.getPisteAt(this.skier.position.x, this.skier.position.z);
          if (activePiste) {
            const hex = `#${activePiste.color.toString(16).padStart(6, '0')}`;
            pisteDot.style.background = hex === '#0f172a' ? '#94a3b8' : hex;
            pisteText.textContent = `${activePiste.name} · ${telemetry.slopePercent}%`;
          } else {
            pisteDot.style.background = '#e2e8f0';
            pisteText.textContent = `Fuera de pista · ${telemetry.slopePercent}%`;
          }
        }
      }

      if (telemetry.jumpCompleted) {
        const jumpToast = document.getElementById('jump-toast');
        if (jumpToast) {
          jumpToast.textContent = `🚀 +${telemetry.jumpCompleted.airTimeSec}s AIRE · ${telemetry.jumpCompleted.distanceMeters} m`;
          jumpToast.style.display = 'block';
          if (this.jumpToastTimer) window.clearTimeout(this.jumpToastTimer);
          this.jumpToastTimer = window.setTimeout(() => {
            jumpToast.style.display = 'none';
          }, 2200);
        }
      }

      const touchControls = document.getElementById('skier-touch-controls');
      if (touchControls) {
        touchControls.style.display = telemetry.ridingLiftName ? 'none' : 'flex';
      }

      const liftBanner = document.getElementById('lift-action-banner');
      const liftBannerText = document.getElementById('lift-banner-text');
      const btnBoardLift = document.getElementById('btn-board-lift');
      const btnSkipLift = document.getElementById('btn-skip-lift');
      if (liftBanner && liftBannerText && btnBoardLift && btnSkipLift) {
        if (telemetry.ridingLiftName) {
          liftBanner.style.display = 'flex';
          liftBannerText.textContent = `Subiendo en ${telemetry.ridingLiftName}...`;
          btnBoardLift.style.display = 'none';
          btnSkipLift.style.display = 'inline-block';
        } else if (telemetry.nearbyLiftName) {
          liftBanner.style.display = 'flex';
          liftBannerText.textContent = `Remonte: ${telemetry.nearbyLiftName}`;
          btnBoardLift.style.display = 'inline-block';
          btnSkipLift.style.display = 'none';
        } else {
          liftBanner.style.display = 'none';
        }
      }
    } else if (this.mode === 'orbit' && !this.isPointerDown) {
      this.orbitAngle += 0.0008;
      this.updateOrbitCamera();
    }

    if (this.weather) {
      const skierPos = this.mode === 'skier' && this.skier ? this.skier.position : undefined;
      const skierHeading = this.mode === 'skier' && this.skier ? this.skier.heading : 0;
      this.weather.update(delta, this.camera.position, skierPos, skierHeading);
      if (this.skier) {
        const precip = this.weather.getPrecipitationLevel();
        this.skier.audio.setWeatherAmbience(precip.snow, precip.rain);
      }
    }

    if (this.skyDomeMesh) {
      this.skyDomeMesh.position.copy(this.camera.position);
    }

    this.renderer.render(this.scene, this.camera);
  }
}
