import { SceneManager } from './engine/SceneManager.js';
import { Bridge } from './engine/Bridge.js';
import { ResortMapSelector } from './engine/ResortMapSelector.js';

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('webgl-canvas') as HTMLCanvasElement;
  if (!canvas) {
    console.error('Canvas element #webgl-canvas no encontrado');
    return;
  }

  const manager = new SceneManager(canvas);

  // Selector interactivo de estaciones (Fase 10.5)
  const mapSelector = new ResortMapSelector('resort-map-overlay', async (resortData) => {
    await manager.applyResortData(resortData);
  });

  // Si se abre standalone sin ?resortId, mostrar el mapa de estaciones obligatorio al inicio
  const urlParams = new URLSearchParams(window.location.search);
  const hasResortParam = Boolean(urlParams.get('resortId') || urlParams.get('resort'));
  if (!hasResortParam) {
    mapSelector.open(false);
  }

  document.getElementById('btn-open-map')?.addEventListener('click', () => {
    mapSelector.open(true);
  });

  // Inicializar puente bidireccional
  Bridge.init((config) => {
    manager.applyResortConfig(config);
  });

  // Escuchar datos geoespaciales completos desde React Native
  Bridge.on('SET_RESORT_DATA', (data: any) => {
    manager.applyResortData(data);
  });

  // Controles táctiles / ratón en modo esquí
  const bindHoldButton = (id: string, inputKey: 'left' | 'right' | 'tuck' | 'brake') => {
    const el = document.getElementById(id);
    if (!el) return;
    const press = (e: Event) => {
      e.preventDefault();
      manager.setSkierInput(inputKey, true);
    };
    const release = (e: Event) => {
      e.preventDefault();
      manager.setSkierInput(inputKey, false);
    };
    el.addEventListener('pointerdown', press);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointerleave', release);
    el.addEventListener('pointercancel', release);
  };

  bindHoldButton('touch-left', 'left');
  bindHoldButton('touch-right', 'right');
  bindHoldButton('touch-tuck', 'tuck');
  bindHoldButton('touch-brake', 'brake');

  document.getElementById('btn-respawn-base')?.addEventListener('click', () => {
    manager.respawnSkier('base');
  });

  document.getElementById('btn-respawn')?.addEventListener('click', () => {
    manager.respawnSkier('summit');
  });

  document.getElementById('btn-board-lift')?.addEventListener('click', () => {
    manager.boardNearbyLift();
  });

  document.getElementById('btn-skip-lift')?.addEventListener('click', () => {
    manager.skipLiftRide();
  });

  document.getElementById('btn-camera-mode')?.addEventListener('click', () => {
    manager.cycleCameraMode();
  });

  // Botón temporal para alternar entre esquiar y vista aérea de inspección del terreno
  let isAerial = false;
  const aerialBtn = document.getElementById('btn-toggle-aerial');
  aerialBtn?.addEventListener('click', () => {
    isAerial = !isAerial;
    aerialBtn.classList.toggle('active', isAerial);
    aerialBtn.textContent = isAerial ? '🎿 Volver a Esquiar' : '👁️ Vista Aérea';
    manager.setMode(isAerial ? 'orbit' : 'skier');
  });

  // Selector rápido de clima (Tiempo Real, Seco, Nieve, Aleatorio Dinámico)
  document.querySelectorAll('[data-weather]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-weather]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.getAttribute('data-weather') as 'live' | 'dry' | 'snow' | 'random';
      if (mode) manager.setWeatherMode(mode);
    });
  });

  // Panel de Ajustes Gráficos Multi-Dispositivo (Fase 10.13) y Menú de Pausa
  const gfxOverlay = document.getElementById('graphics-settings-overlay');
  const pauseOverlay = document.getElementById('pause-overlay');
  const pauseBtn = document.getElementById('btn-pause-game');
  let manualPauseOpen = false;

  const setManualPause = (open: boolean) => {
    manualPauseOpen = open;
    if (pauseOverlay) pauseOverlay.style.display = open ? 'flex' : 'none';
    if (pauseBtn) {
      pauseBtn.textContent = open ? '▶️ Reanudar' : '⏸️ Pausa';
    }
    const gfxOpen = gfxOverlay?.style.display === 'flex';
    manager.setPaused(open || gfxOpen);
  };

  const openGraphicsModal = () => {
    syncGfxUI();
    if (gfxOverlay) gfxOverlay.style.display = 'flex';
    manager.setPaused(true);
  };

  const closeGraphicsModal = () => {
    if (gfxOverlay) gfxOverlay.style.display = 'none';
    if (manualPauseOpen && pauseOverlay) {
      pauseOverlay.style.display = 'flex';
    }
    manager.setPaused(manualPauseOpen);
  };

  const syncGfxUI = () => {
    const cfg = manager.getGraphicsConfig();
    document.querySelectorAll('[data-gfx-preset]').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-gfx-preset') === cfg.preset);
    });
    const shadowsBtn = document.getElementById('gfx-toggle-shadows');
    if (shadowsBtn) {
      shadowsBtn.textContent = cfg.shadowsEnabled ? 'Activadas' : 'Desactiv.';
      shadowsBtn.classList.toggle('active', cfg.shadowsEnabled);
    }
    const trafficBtn = document.getElementById('gfx-toggle-traffic');
    if (trafficBtn) {
      trafficBtn.textContent = cfg.trafficEnabled ? 'Activados' : 'Desactiv.';
      trafficBtn.classList.toggle('active', cfg.trafficEnabled);
    }
    const trackerBtn = document.getElementById('gfx-toggle-tracker');
    if (trackerBtn) {
      trackerBtn.textContent = cfg.sessionTrackerEnabled ? 'Activado' : 'Desactiv.';
      trackerBtn.classList.toggle('active', cfg.sessionTrackerEnabled);
    }
    const dprSel = document.getElementById('gfx-dpr-select') as HTMLSelectElement | null;
    if (dprSel) dprSel.value = String(cfg.pixelRatioMax);
    const distSel = document.getElementById('gfx-dist-select') as HTMLSelectElement | null;
    if (distSel) distSel.value = String(cfg.drawDistance);
  };

  document.getElementById('btn-open-gfx')?.addEventListener('click', openGraphicsModal);
  document.getElementById('gfx-close-btn')?.addEventListener('click', closeGraphicsModal);

  pauseBtn?.addEventListener('click', () => setManualPause(!manualPauseOpen));
  document.getElementById('pause-resume-btn')?.addEventListener('click', () => setManualPause(false));
  document.getElementById('pause-gfx-btn')?.addEventListener('click', () => {
    if (pauseOverlay) pauseOverlay.style.display = 'none';
    openGraphicsModal();
  });
  document.getElementById('pause-map-btn')?.addEventListener('click', () => {
    setManualPause(false);
    mapSelector.open(true);
  });
  document.getElementById('pause-base-btn')?.addEventListener('click', () => {
    manager.respawnSkier('base');
    setManualPause(false);
  });

  window.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    const mapOpen = document.getElementById('resort-map-overlay')?.style.display === 'flex';
    const expandedOpen = document.getElementById('expanded-minimap-overlay')?.style.display === 'flex';
    if (mapOpen || expandedOpen) return;

    if (e.code === 'KeyP') {
      if (gfxOverlay?.style.display === 'flex') {
        closeGraphicsModal();
      } else {
        setManualPause(!manualPauseOpen);
      }
    } else if (e.code === 'Escape') {
      if (gfxOverlay?.style.display === 'flex') {
        closeGraphicsModal();
        if (manualPauseOpen && pauseOverlay) pauseOverlay.style.display = 'flex';
      } else {
        setManualPause(!manualPauseOpen);
      }
    }
  });

  document.querySelectorAll('[data-gfx-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = btn.getAttribute('data-gfx-preset') as 'low' | 'medium' | 'high' | 'ultra';
      if (preset) {
        manager.setGraphicsPreset(preset);
        syncGfxUI();
      }
    });
  });

  document.getElementById('gfx-toggle-shadows')?.addEventListener('click', () => {
    const curr = manager.getGraphicsConfig();
    manager.updateGraphicsOption({ shadowsEnabled: !curr.shadowsEnabled });
    syncGfxUI();
  });

  document.getElementById('gfx-toggle-traffic')?.addEventListener('click', () => {
    const curr = manager.getGraphicsConfig();
    manager.updateGraphicsOption({ trafficEnabled: !curr.trafficEnabled });
    syncGfxUI();
  });

  document.getElementById('gfx-toggle-tracker')?.addEventListener('click', () => {
    const curr = manager.getGraphicsConfig();
    manager.updateGraphicsOption({ sessionTrackerEnabled: !curr.sessionTrackerEnabled });
    syncGfxUI();
  });

  document.getElementById('gfx-dpr-select')?.addEventListener('change', (e) => {
    const val = Number((e.target as HTMLSelectElement).value);
    if (val > 0) manager.updateGraphicsOption({ pixelRatioMax: val });
  });

  document.getElementById('gfx-dist-select')?.addEventListener('change', (e) => {
    const val = Number((e.target as HTMLSelectElement).value);
    if (val > 0) manager.updateGraphicsOption({ drawDistance: val });
  });
});
