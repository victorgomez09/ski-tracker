import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ResortDataPayload, ResortDataService, ResortSummary } from './ResortDataService.js';

/**
 * Selector interactivo de estaciones a pantalla completa usando Leaflet (gratuito)
 * sobre tiles Carto Voyager / OSM de España y Andorra.
 * Los marcadores están anclados exactamente en sus coordenadas GPS y el tooltip
 * con el nombre flota encima sin desplazar nunca el punto de la estación.
 */
export class ResortMapSelector {
  private container: HTMLElement;
  private resorts: ResortSummary[] = [];
  private selectedResort: ResortSummary | null = null;
  private isLive = false;
  private hasChosenResort = false;
  private retryTimer: number | null = null;
  private currentSearch = '';
  private onSelectCallback: (data: ResortDataPayload) => void;

  private map: L.Map | null = null;
  private markersLayer: L.LayerGroup | null = null;
  private shellInitialized = false;

  constructor(containerId: string, onSelect: (data: ResortDataPayload) => void) {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`No se encontró el contenedor #${containerId}`);
    this.container = el;
    this.onSelectCallback = onSelect;
  }

  public async open(canClose = this.hasChosenResort) {
    this.hasChosenResort = canClose;
    this.container.style.display = 'flex';

    if (!this.shellInitialized) {
      this.buildShell();
      this.initLeafletMap();
      this.shellInitialized = true;
    }

    this.updateHeaderCloseState();

    if (this.resorts.length === 0 || !this.isLive) {
      await this.loadCatalog();
    }

    this.updateListAndMarkers();
    setTimeout(() => this.map?.invalidateSize(), 60);

    if (!this.isLive && !this.retryTimer) {
      this.retryTimer = window.setInterval(async () => {
        const result = await ResortDataService.fetchResortsCatalog();
        if (result.isLive) {
          this.resorts = result.resorts;
          this.isLive = true;
          if (this.retryTimer) {
            clearInterval(this.retryTimer);
            this.retryTimer = null;
          }
          if (!this.selectedResort && this.resorts.length > 0) {
            this.selectedResort =
              this.resorts.find((r) => r.name.toLowerCase().includes('valdesqu')) || this.resorts[0];
          }
          this.updateListAndMarkers();
        }
      }, 2500);
    }
  }

  private async loadCatalog() {
    const result = await ResortDataService.fetchResortsCatalog();
    this.resorts = result.resorts;
    this.isLive = result.isLive;
    if (this.resorts.length > 0 && !this.selectedResort) {
      this.selectedResort =
        this.resorts.find((r) => r.name.toLowerCase().includes('valdesqu')) || this.resorts[0];
    }
  }

  public close() {
    if (!this.hasChosenResort) return;
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
    this.container.style.display = 'none';
  }

  private buildShell() {
    this.container.innerHTML = `
      <div class="map-fullscreen-shell">
        <div class="map-modal-header">
          <div style="display:flex;align-items:center;gap:12px;">
            <h2 id="map-header-title">Estaciones de Esquí · España y Andorra</h2>
            <span class="map-status-badge offline" id="map-status-badge">● Cargando...</span>
          </div>
          <div id="map-header-action"></div>
        </div>

        <div class="map-modal-body">
          <div class="map-sidebar">
            <input
              type="text"
              id="resort-search-input"
              class="map-search-input"
              placeholder="Buscar estación (ej. Valdezcaray, Baqueira...)"
            />
            <div class="map-resort-list" id="map-resort-list"></div>
          </div>

          <div class="map-canvas-area">
            <div id="leaflet-resort-map" style="width:100%;height:100%;"></div>
            <div class="map-detail-card" id="map-detail-card" style="display:none;"></div>
          </div>
        </div>
      </div>
    `;

    const searchInput = this.container.querySelector('#resort-search-input') as HTMLInputElement | null;
    searchInput?.addEventListener('input', (e) => {
      this.currentSearch = (e.target as HTMLInputElement).value;
      this.updateListAndMarkers();
    });
  }

  private initLeafletMap() {
    const mapEl = this.container.querySelector('#leaflet-resort-map') as HTMLElement;
    this.map = L.map(mapEl, {
      center: [40.35, -2.8],
      zoom: 6,
      minZoom: 5,
      maxZoom: 14,
      zoomControl: true,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(this.map);

    this.markersLayer = L.layerGroup().addTo(this.map);
  }

  private updateHeaderCloseState() {
    const actionEl = this.container.querySelector('#map-header-action');
    if (!actionEl) return;
    if (this.hasChosenResort) {
      actionEl.innerHTML = '<button class="map-close-btn" id="map-close-btn" title="Cerrar mapa">✕</button>';
      actionEl.querySelector('#map-close-btn')?.addEventListener('click', () => this.close());
    } else {
      actionEl.innerHTML =
        '<span style="font-size:12px;color:#94a3b8;">Selecciona una estación en el mapa para empezar a esquiar</span>';
    }
  }

  private updateListAndMarkers() {
    const titleEl = this.container.querySelector('#map-header-title');
    if (titleEl) {
      titleEl.textContent = `Estaciones de Esquí · España y Andorra (${this.resorts.length})`;
    }

    const badgeEl = this.container.querySelector('#map-status-badge');
    if (badgeEl) {
      badgeEl.className = `map-status-badge ${this.isLive ? 'live' : 'offline'}`;
      badgeEl.textContent = this.isLive ? '● Backend en vivo' : '● Esperando Backend...';
    }

    const q = this.currentSearch.trim().toLowerCase();
    const filtered = q
      ? this.resorts.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            (r.region || '').toLowerCase().includes(q) ||
            r.country.toLowerCase().includes(q)
        )
      : this.resorts;

    const sel = this.selectedResort;

    // 1. Lista lateral
    const listEl = this.container.querySelector('#map-resort-list');
    if (listEl) {
      listEl.innerHTML = filtered
        .map(
          (r) => `
        <button class="map-resort-item ${sel?.id === r.id ? 'selected' : ''}" data-resort-id="${r.id}">
          <div class="map-resort-item-title">${r.name}</div>
          <div class="map-resort-item-sub">${r.region ? `${r.region} · ` : ''}${r.country}${r.base_altitude > 0 && r.summit_altitude > 0 ? ` · ${r.base_altitude}m–${r.summit_altitude}m` : ''}</div>
        </button>
      `
        )
        .join('');

      listEl.querySelectorAll('[data-resort-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-resort-id');
          const found = this.resorts.find((r) => r.id === id);
          if (found) {
            this.selectedResort = found;
            this.map?.flyTo([found.latitude, found.longitude], Math.max(this.map.getZoom(), 8), {
              duration: 0.6,
            });
            this.updateListAndMarkers();
          }
        });
      });
    }

    // 2. Marcadores Leaflet anclados exactamente en [lat, lon] con tooltip superior sin mover el punto
    if (this.markersLayer) {
      this.markersLayer.clearLayers();
      filtered.forEach((r) => {
        const isSelected = sel?.id === r.id;
        const marker = L.circleMarker([r.latitude, r.longitude], {
          radius: isSelected ? 9 : 6,
          color: '#ffffff',
          weight: 2,
          fillColor: isSelected ? '#f97316' : '#0284c7',
          fillOpacity: 1,
        });

        if (isSelected) {
          marker
            .bindTooltip(r.name, {
              permanent: true,
              direction: 'top',
              offset: [0, -10],
              className: 'resort-leaflet-tooltip',
            })
            .openTooltip();
        }

        marker.on('click', () => {
          this.selectedResort = r;
          this.updateListAndMarkers();
        });

        marker.addTo(this.markersLayer!);
      });
    }

    // 3. Tarjeta inferior de detalle
    const detailEl = this.container.querySelector('#map-detail-card') as HTMLElement | null;
    if (detailEl) {
      if (!sel) {
        detailEl.style.display = 'none';
      } else {
        const hasAlts = sel.base_altitude > 0 && sel.summit_altitude > 0;
        const verticalDrop = hasAlts ? Math.max(0, sel.summit_altitude - sel.base_altitude) : 0;

        detailEl.style.display = 'flex';
        detailEl.innerHTML = `
          <div class="map-detail-info">
            <h3>${sel.name}</h3>
            <p>${sel.region ? `${sel.region} · ` : ''}${sel.country}</p>
            <div class="map-detail-metrics">
              <span>Base: <b>${sel.base_altitude > 0 ? `${sel.base_altitude}m` : 'N/D'}</b></span>
              <span>Cumbre: <b>${sel.summit_altitude > 0 ? `${sel.summit_altitude}m` : 'N/D'}</b></span>
              <span>Desnivel: <b>${verticalDrop > 0 ? `${verticalDrop}m` : 'N/D'}</b></span>
              ${sel.pistes_count ? `<span>Pistas: <b>${sel.pistes_count}</b></span>` : ''}
            </div>
          </div>
          <button class="map-travel-btn" id="map-travel-btn">Viajar a la Estación 🎿</button>
        `;

        const travelBtn = detailEl.querySelector('#map-travel-btn') as HTMLButtonElement | null;
        travelBtn?.addEventListener('click', async () => {
          travelBtn.disabled = true;
          travelBtn.textContent = 'Cargando pistas y montaña real...';
          const liveData = await ResortDataService.fetchFromBackend(sel.id);
          const payload = liveData || ResortDataService.buildOfflineResortFallback(sel);
          this.hasChosenResort = true;
          this.close();
          this.onSelectCallback(payload);
        });
      }
    }
  }
}
