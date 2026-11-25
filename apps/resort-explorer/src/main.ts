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

  // Botón temporal para alternar entre esquiar y vista aérea de inspección del terreno
  let isAerial = false;
  const aerialBtn = document.getElementById('btn-toggle-aerial');
  aerialBtn?.addEventListener('click', () => {
    isAerial = !isAerial;
    aerialBtn.classList.toggle('active', isAerial);
    aerialBtn.textContent = isAerial ? '🎿 Volver a Esquiar' : '👁️ Vista Aérea';
    manager.setMode(isAerial ? 'orbit' : 'skier');
  });
});
