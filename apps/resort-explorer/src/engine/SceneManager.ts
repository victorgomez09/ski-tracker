import * as THREE from 'three';
import { ProceduralTerrain } from './ProceduralTerrain.js';
import { ProceduralPistes } from './ProceduralPistes.js';
import { ProceduralLifts } from './ProceduralLifts.js';
import { ProceduralVegetation } from './ProceduralVegetation.js';
import { GeoProjection } from './GeoProjection.js';
import { ResortDataService, ResortDataPayload } from './ResortDataService.js';
import { ResortConfig } from './Bridge.js';
import { SkierController, SkierInputState } from './SkierController.js';
import { TerrainTileLoader } from './TerrainTileLoader.js';

export class SceneManager {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private terrain!: ProceduralTerrain;
  private pistes!: ProceduralPistes;
  private lifts!: ProceduralLifts;
  private vegetation!: ProceduralVegetation;
  private projection!: GeoProjection;
  private skier!: SkierController;
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

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    // Scene con cielo alpino luminoso y niebla ligera para abarcar estaciones extensas
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xcde2f5);
    this.scene.fog = new THREE.FogExp2(0xdce8f4, 0.00016);

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

    // Si viene ?resortId= desde la app móvil o URL, cargar estación + DEM real
    const urlParams = new URLSearchParams(window.location.search);
    const resortParam = urlParams.get('resortId') || urlParams.get('resort');
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

  private setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xf1f5f9, 1.0);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfffcf5, 1.4);
    sunLight.position.set(450, 800, 350);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    this.scene.add(sunLight);

    const bounceSnowLight = new THREE.DirectionalLight(0xf8fafc, 0.5);
    bounceSnowLight.position.set(-400, 120, -400);
    this.scene.add(bounceSnowLight);
  }

  private initWorld() {
    const resortData = ResortDataService.getActiveResort();

    this.terrain = new ProceduralTerrain(2600, 2600, 220);
    this.scene.add(this.terrain.mesh);

    this.pistes = new ProceduralPistes(this.terrain, this.projection, resortData.pistes);
    this.scene.add(this.pistes.group);

    this.lifts = new ProceduralLifts(this.terrain, this.projection, resortData.lifts, true);
    this.scene.add(this.lifts.group);

    this.vegetation = new ProceduralVegetation(this.terrain, 2200);
    this.scene.add(this.vegetation.instancedMesh);

    // Controlador del esquiador siempre activo para empezar a esquiar al llegar a la estación
    this.skier = new SkierController(this.terrain);
    this.skier.setAltitudeRange(resortData.base_altitude, resortData.summit_altitude);
    this.scene.add(this.skier.avatar.group);
    this.scene.add(this.skier.particles.points);

    const hint = document.getElementById('controls-hint');
    if (hint) {
      hint.textContent = 'WASD / Flechas para carvear · Espacio frenar · R base';
    }

    const loader = document.getElementById('loading-screen');
    if (loader) {
      loader.style.opacity = '0';
      setTimeout(() => loader.remove(), 500);
    }
  }

  public async applyResortData(data: ResortDataPayload) {
    ResortDataService.setActiveResort(data);

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

    // 4. Reconstruir pistas, remontes y vegetación sobre la topografía real
    if (this.pistes && data.pistes) {
      this.pistes.rebuild(this.terrain, this.projection, data.pistes);
    }
    if (this.lifts && data.lifts) {
      this.lifts.rebuild(this.terrain, this.projection, data.lifts, isValdesqui);
    }
    if (this.vegetation && this.terrain) {
      this.vegetation.rebuild(this.terrain);
    }

    // 5. Colocar al esquiador directamente en la base de la estación listo para esquiar
    if (this.skier) {
      this.skier.setAltitudeRange(data.base_altitude, data.summit_altitude);
      const { baseX, baseZ, baseHeading, summitX, summitZ, summitHeading } = this.computeResortSpawns(data);
      this.skier.setSpawnPoints(baseX, baseZ, baseHeading, summitX, summitZ, summitHeading);
      this.skier.respawnAtBase();
    }

    this.applyResortConfig({
      name: data.name,
      summitAltitude: data.summit_altitude,
      baseAltitude: data.base_altitude,
      pistesCount: data.pistes?.length,
    });
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

    let lowestY = Infinity;
    let highestY = -Infinity;

    (data.lifts || []).forEach((lift) => {
      const coords = lift.geometry_geojson?.coordinates;
      if (!coords || coords.length < 2) return;
      const [sx, sz] = this.projection.project(coords[0][0], coords[0][1]);
      const [ex, ez] = this.projection.project(coords[coords.length - 1][0], coords[coords.length - 1][1]);
      const sy = this.terrain.getElevationAt(sx, sz);
      const ey = this.terrain.getElevationAt(ex, ez);

      if (sy < lowestY) {
        lowestY = sy;
        baseX = sx;
        baseZ = sz;
      }
      if (ey > highestY) {
        highestY = ey;
        summitX = ex;
        summitZ = ez;
      }
    });

    if (!isFinite(lowestY) && data.pistes && data.pistes.length > 0) {
      data.pistes.forEach((piste) => {
        const coords = piste.geometry_geojson?.coordinates;
        if (!coords || coords.length < 2) return;
        const [sx, sz] = this.projection.project(coords[0][0], coords[0][1]);
        const [ex, ez] = this.projection.project(coords[coords.length - 1][0], coords[coords.length - 1][1]);
        const sy = this.terrain.getElevationAt(sx, sz);
        const ey = this.terrain.getElevationAt(ex, ez);
        if (ey < lowestY) {
          lowestY = ey;
          baseX = ex;
          baseZ = ez;
        }
        if (sy > highestY) {
          highestY = sy;
          summitX = sx;
          summitZ = sz;
        }
      });
    }

    const toSummit = Math.atan2(summitX - baseX, summitZ - baseZ);
    const toBase = Math.atan2(baseX - summitX, baseZ - summitZ);

    return {
      baseX,
      baseZ,
      baseHeading: toSummit,
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
    if (this.skier) {
      if (target === 'summit') {
        this.skier.respawnAtSummit();
      } else {
        this.skier.respawnAtBase();
      }
    }
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

    if (this.lifts) {
      this.lifts.update(delta);
    }

    if (this.mode === 'skier' && this.skier) {
      const telemetry = this.skier.update(delta, this.camera);
      const speedEl = document.getElementById('skier-speed');
      const altEl = document.getElementById('skier-alt');
      if (speedEl) speedEl.textContent = `${telemetry.speedKmh} km/h`;
      if (altEl) altEl.textContent = `${telemetry.altitudeMeters.toLocaleString()} m`;
    } else if (this.mode === 'orbit' && !this.isPointerDown) {
      this.orbitAngle += 0.0008;
      this.updateOrbitCamera();
    }

    this.renderer.render(this.scene, this.camera);
  }
}
