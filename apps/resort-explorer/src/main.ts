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

  // Sesión multijugador / autenticación compartida desde la app móvil
  let mpAuth: { apiBaseUrl: string; token: string; playerName?: string } | null = null;
  const urlToken = urlParams.get('token');
  const urlRoomId = urlParams.get('roomId');
  const urlApiBase = urlParams.get('apiBaseUrl') || 'http://localhost:8082';
  if (urlToken) {
    mpAuth = {
      apiBaseUrl: urlApiBase,
      token: urlToken,
      playerName: urlParams.get('playerName') || undefined,
    };
    if (urlRoomId) {
      const resortId = urlParams.get('resortId') || 'valdesqui';
      manager.connectMultiplayer({ ...mpAuth, roomId: urlRoomId, resortId });
    }
  }

  Bridge.on('SET_MULTIPLAYER_AUTH', (payload: any) => {
    if (payload?.token) {
      mpAuth = {
        apiBaseUrl: (payload.apiBaseUrl || 'http://localhost:8082').replace(/\/$/, ''),
        token: payload.token,
        playerName: payload.playerName,
      };
      if (payload.roomId) {
        manager.connectMultiplayer({
          ...mpAuth,
          roomId: payload.roomId,
          resortId: manager.getActiveResortInfo().id,
        });
      }
    }
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

  document.getElementById('btn-rider-mode')?.addEventListener('click', () => {
    const curr = manager.getGraphicsConfig();
    const next = curr.riderMode === 'snowboard' ? 'ski' : 'snowboard';
    manager.updateGraphicsOption({ riderMode: next });
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
    const riderSel = document.getElementById('gfx-rider-select') as HTMLSelectElement | null;
    if (riderSel) riderSel.value = cfg.riderMode || 'ski';
    const stanceSel = document.getElementById('gfx-stance-select') as HTMLSelectElement | null;
    if (stanceSel) stanceSel.value = cfg.snowboardStance || 'regular';
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

  document.getElementById('gfx-rider-select')?.addEventListener('change', (e) => {
    const val = (e.target as HTMLSelectElement).value as 'ski' | 'snowboard';
    manager.updateGraphicsOption({ riderMode: val });
  });

  document.getElementById('gfx-stance-select')?.addEventListener('change', (e) => {
    const val = (e.target as HTMLSelectElement).value as 'regular' | 'goofy';
    manager.updateGraphicsOption({ snowboardStance: val });
  });

  // Panel Multijugador: Esquiar con Amigos (Fase 10.16)
  const mpOverlay = document.getElementById('friends-mp-overlay');
  const mpSubtitle = document.getElementById('mp-modal-subtitle');
  const mpCreateBtn = document.getElementById('mp-create-room-btn');
  const mpLeaveBtn = document.getElementById('mp-leave-room-btn');
  const mpAuthWarn = document.getElementById('mp-auth-warning');
  const mpPeersList = document.getElementById('mp-peers-list');
  const mpInvitesList = document.getElementById('mp-invites-list');
  const mpFriendsList = document.getElementById('mp-friends-list');

  const apiFetch = async (path: string, init?: RequestInit) => {
    if (!mpAuth) throw new Error('Sin autenticación');
    const res = await fetch(`${mpAuth.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mpAuth.token}`,
        ...(init?.headers || {}),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };

  const renderMultiplayerModal = async () => {
    const roomId = manager.getMultiplayerRoomId();
    if (mpSubtitle) {
      mpSubtitle.textContent = roomId ? `Sala activa: #${roomId}` : 'Sin sala activa';
    }
    if (mpCreateBtn) mpCreateBtn.style.display = roomId ? 'none' : 'inline-block';
    if (mpLeaveBtn) mpLeaveBtn.style.display = roomId ? 'inline-block' : 'none';
    if (mpAuthWarn) mpAuthWarn.style.display = mpAuth ? 'none' : 'block';

    // 1. Compañeros conectados actualmente en la sala
    const peers = manager.getMultiplayerPeers();
    if (mpPeersList) {
      if (peers.length === 0) {
        mpPeersList.innerHTML = '<span style="color:#64748b;">Nadie conectado todavía</span>';
      } else {
        mpPeersList.innerHTML = peers
          .map(
            (p) => `
          <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(24,38,62,0.8);padding:6px 10px;border-radius:5px;border:1px solid rgba(16,185,129,0.3);">
            <span>${p.riderMode === 'snowboard' ? '🏂' : '⛷️'} <b>${p.name}</b> · ${p.speedKmh} km/h</span>
            <button class="btn-respawn" data-tp-peer="${p.userId}">📍 Ir con amigo</button>
          </div>`
          )
          .join('');
        mpPeersList.querySelectorAll('[data-tp-peer]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const uid = btn.getAttribute('data-tp-peer');
            if (uid && manager.teleportToPeer(uid) && mpOverlay) {
              mpOverlay.style.display = 'none';
            }
          });
        });
      }
    }

    if (!mpAuth) {
      if (mpInvitesList) mpInvitesList.innerHTML = '<span style="color:#64748b;">Inicia sesión en la app para ver invitaciones</span>';
      if (mpFriendsList) mpFriendsList.innerHTML = '<span style="color:#64748b;">Inicia sesión en la app para ver tus amigos</span>';
      return;
    }

    // 2. Invitaciones recibidas
    try {
      const invData = await apiFetch('/api/v1/explorer/invites');
      const invites = Array.isArray(invData) ? invData : invData?.data || [];
      if (mpInvitesList) {
        if (invites.length === 0) {
          mpInvitesList.innerHTML = '<span style="color:#64748b;">Sin invitaciones pendientes</span>';
        } else {
          mpInvitesList.innerHTML = invites
            .map(
              (inv: any) => `
            <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(14,165,233,0.16);padding:6px 10px;border-radius:5px;border:1px solid rgba(56,189,248,0.4);">
              <span><b>${inv.from_user_name}</b> te invita a ${inv.resort_name || inv.resort_id}</span>
              <button class="btn-respawn" data-join-inv="${inv.room_id}" data-inv-resort="${inv.resort_id}">Unirse</button>
            </div>`
            )
            .join('');
          mpInvitesList.querySelectorAll('[data-join-inv]').forEach((btn) => {
            btn.addEventListener('click', () => {
              const rId = btn.getAttribute('data-join-inv')!;
              const resId = btn.getAttribute('data-inv-resort') || manager.getActiveResortInfo().id;
              manager.connectMultiplayer({ ...mpAuth!, roomId: rId, resortId: resId });
              renderMultiplayerModal();
            });
          });
        }
      }
    } catch {
      if (mpInvitesList) mpInvitesList.innerHTML = '<span style="color:#64748b;">Sin invitaciones pendientes</span>';
    }

    // 3. Lista de amigos de Ski Tracker
    try {
      const frData = await apiFetch('/api/v1/friends');
      const friendships = Array.isArray(frData) ? frData : frData?.data || [];
      if (mpFriendsList) {
        if (friendships.length === 0) {
          mpFriendsList.innerHTML = '<span style="color:#64748b;">Aún no tienes amigos añadidos en la app</span>';
        } else {
          mpFriendsList.innerHTML = friendships
            .map((f: any) => {
              const friend = f.friend || f.requester || f.addressee || f;
              const fId = friend.id || f.friend_id || f.addressee_id || '';
              const fName = friend.display_name || friend.email || 'Amigo';
              return `
                <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(24,38,62,0.7);padding:6px 10px;border-radius:5px;border:1px solid rgba(255,255,255,0.1);">
                  <span>👤 <b>${fName}</b></span>
                  <button class="btn-respawn" data-invite-uid="${fId}">Invitar</button>
                </div>`;
            })
            .join('');
          mpFriendsList.querySelectorAll('[data-invite-uid]').forEach((btn) => {
            btn.addEventListener('click', async () => {
              const toUid = btn.getAttribute('data-invite-uid');
              if (!toUid) return;
              let rId = manager.getMultiplayerRoomId();
              const resort = manager.getActiveResortInfo();
              if (!rId) {
                const created = await apiFetch('/api/v1/explorer/rooms', {
                  method: 'POST',
                  body: JSON.stringify({ resort_id: resort.id, resort_name: resort.name }),
                });
                rId = created.room_id || created.data?.room_id;
                if (rId) manager.connectMultiplayer({ ...mpAuth!, roomId: rId, resortId: resort.id });
              }
              if (rId) {
                await apiFetch(`/api/v1/explorer/rooms/${encodeURIComponent(rId)}/invite`, {
                  method: 'POST',
                  body: JSON.stringify({ to_user_id: toUid, resort_id: resort.id, resort_name: resort.name }),
                });
                (btn as HTMLButtonElement).textContent = '✓ Invitado';
                renderMultiplayerModal();
              }
            });
          });
        }
      }
    } catch {
      if (mpFriendsList) mpFriendsList.innerHTML = '<span style="color:#64748b;">No se pudo cargar la lista de amigos</span>';
    }
  };

  document.getElementById('btn-friends-mp')?.addEventListener('click', () => {
    if (mpOverlay) mpOverlay.style.display = 'flex';
    renderMultiplayerModal();
  });

  document.getElementById('mp-close-btn')?.addEventListener('click', () => {
    if (mpOverlay) mpOverlay.style.display = 'none';
  });

  mpCreateBtn?.addEventListener('click', async () => {
    if (!mpAuth) {
      if (mpSubtitle) mpSubtitle.textContent = '⚠️ Inicia sesión desde la app Ski Tracker';
      if (mpAuthWarn) mpAuthWarn.style.display = 'block';
      return;
    }
    try {
      if (mpSubtitle) mpSubtitle.textContent = '⏳ Creando sala...';
      const resort = manager.getActiveResortInfo();
      const created = await apiFetch('/api/v1/explorer/rooms', {
        method: 'POST',
        body: JSON.stringify({ resort_id: resort.id, resort_name: resort.name }),
      });
      const rId = created.room_id || created.data?.room_id;
      if (rId) {
        manager.connectMultiplayer({ ...mpAuth, roomId: rId, resortId: resort.id });
        renderMultiplayerModal();
      } else if (mpSubtitle) {
        mpSubtitle.textContent = '⚠️ Respuesta inesperada del servidor';
      }
    } catch (err) {
      if (mpSubtitle) {
        mpSubtitle.textContent = `⚠️ Error creando sala (${err instanceof Error ? err.message : 'red'})`;
      }
    }
  });

  mpLeaveBtn?.addEventListener('click', () => {
    manager.disconnectMultiplayer();
    renderMultiplayerModal();
  });

  document.getElementById('mp-join-code-btn')?.addEventListener('click', () => {
    if (!mpAuth) {
      if (mpSubtitle) mpSubtitle.textContent = '⚠️ Inicia sesión desde la app Ski Tracker';
      if (mpAuthWarn) mpAuthWarn.style.display = 'block';
      return;
    }
    const input = document.getElementById('mp-room-code-input') as HTMLInputElement | null;
    const code = input?.value.trim();
    if (!code) return;
    manager.connectMultiplayer({
      ...mpAuth,
      roomId: code,
      resortId: manager.getActiveResortInfo().id,
    });
    renderMultiplayerModal();
  });
});
