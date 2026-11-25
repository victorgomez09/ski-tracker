import { ResortDataPayload, ResortDataService, ResortSummary } from './ResortDataService.js';

/**
 * Selector interactivo de estaciones sobre un mapa vectorial de España y Andorra.
 * Permite buscar, inspeccionar cotas/pistas y viajar a cualquier estación cargando
 * su geometría real desde el backend Go o desde el respaldo local.
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

  // Límites geográficos del mapa Ibérico (Lon: -9.8 a 4.5, Lat: 35.8 a 43.9)
  private readonly minLon = -9.8;
  private readonly maxLon = 4.5;
  private readonly minLat = 35.8;
  private readonly maxLat = 43.9;

  constructor(containerId: string, onSelect: (data: ResortDataPayload) => void) {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`No se encontró el contenedor #${containerId}`);
    this.container = el;
    this.onSelectCallback = onSelect;
  }

  public async open(canClose = this.hasChosenResort) {
    this.hasChosenResort = canClose;
    this.container.style.display = 'flex';
    if (this.resorts.length === 0 || !this.isLive) {
      await this.loadCatalog();
    }
    this.render(this.currentSearch);

    // Si el backend aún está arrancando (make dev-explorer), reintentar automáticamente
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
            this.selectedResort = this.resorts.find((r) => r.name.toLowerCase().includes('valdesqu')) || this.resorts[0];
          }
          this.render(this.currentSearch);
        }
      }, 2500);
    }
  }

  private async loadCatalog() {
    const result = await ResortDataService.fetchResortsCatalog();
    this.resorts = result.resorts;
    this.isLive = result.isLive;
    if (this.resorts.length > 0 && !this.selectedResort) {
      this.selectedResort = this.resorts.find((r) => r.name.toLowerCase().includes('valdesqu')) || this.resorts[0];
    }
  }

  public close() {
    if (!this.hasChosenResort) return; // Obligatorio elegir estación antes de cerrar
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
    this.container.style.display = 'none';
  }

  private projectToPercent(lon: number, lat: number): { x: number; y: number } {
    const x = ((lon - this.minLon) / (this.maxLon - this.minLon)) * 100;
    const y = (1 - (lat - this.minLat) / (this.maxLat - this.minLat)) * 100;
    return {
      x: Math.max(4, Math.min(96, x)),
      y: Math.max(6, Math.min(94, y)),
    };
  }

  private render(searchQuery = '') {
    this.currentSearch = searchQuery;
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? this.resorts.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            (r.region || '').toLowerCase().includes(q) ||
            r.country.toLowerCase().includes(q)
        )
      : this.resorts;

    const sel = this.selectedResort;
    const hasAlts = Boolean(sel && sel.base_altitude > 0 && sel.summit_altitude > 0);
    const verticalDrop = hasAlts && sel ? Math.max(0, sel.summit_altitude - sel.base_altitude) : 0;

    this.container.innerHTML = `
      <div class="map-modal-card">
        <div class="map-modal-header">
          <div>
            <h2>Mapa de Estaciones 3D (${this.resorts.length})</h2>
            <span class="map-status-badge ${this.isLive ? 'live' : 'offline'}">
              ${this.isLive ? '● Conectado a Backend (España y Andorra)' : '● Esperando Backend... (Catálogo de respaldo)'}
            </span>
          </div>
          ${this.hasChosenResort ? '<button class="map-close-btn" id="map-close-btn" title="Cerrar mapa">✕</button>' : '<span style="font-size:11px;color:#94a3b8;">Elige una estación para empezar</span>'}
        </div>

        <div class="map-modal-body">
          <div class="map-sidebar">
            <input
              type="text"
              id="resort-search-input"
              class="map-search-input"
              placeholder="Buscar estación o sistema montañoso..."
              value="${searchQuery}"
            />
            <div class="map-resort-list">
              ${filtered
                .map(
                  (r) => `
                <button class="map-resort-item ${sel?.id === r.id ? 'selected' : ''}" data-resort-id="${r.id}">
                  <div class="map-resort-item-title">${r.name}</div>
                  <div class="map-resort-item-sub">${r.region ? `${r.region} · ` : ''}${r.country}${r.base_altitude > 0 && r.summit_altitude > 0 ? ` · ${r.base_altitude}m–${r.summit_altitude}m` : ''}</div>
                </button>
              `
                )
                .join('')}
            </div>
          </div>

          <div class="map-canvas-area">
            <div class="iberian-map-bg">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="iberian-svg">
                <!-- Silueta esquemática de la Península Ibérica y Pirineos -->
                <path d="M12,18 L24,14 L48,16 L76,22 L88,28 L82,42 L74,56 L68,72 L56,86 L36,90 L18,86 L12,72 L14,48 L8,30 Z"
                      fill="rgba(30, 41, 59, 0.75)" stroke="rgba(56, 189, 248, 0.35)" stroke-width="0.6" />
                <!-- Cordilleras principales -->
                <path d="M52,20 Q68,21 84,26" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="1.4" stroke-dasharray="1.5,1" />
                <path d="M32,48 Q42,46 52,44" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1.2" stroke-dasharray="1.5,1" />
                <path d="M44,82 Q52,80 60,81" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1.2" stroke-dasharray="1.5,1" />
              </svg>

              ${filtered
                .map((r) => {
                  const pt = this.projectToPercent(r.longitude, r.latitude);
                  const isSelected = sel?.id === r.id;
                  return `
                  <button
                    class="map-pin ${isSelected ? 'active' : ''}"
                    style="left: ${pt.x}%; top: ${pt.y}%;"
                    data-resort-id="${r.id}"
                    title="${r.name}"
                  >
                    <span class="pin-dot"></span>
                    ${isSelected ? `<span class="pin-label">${r.name}</span>` : ''}
                  </button>
                `;
                })
                .join('')}
            </div>

            ${
              sel
                ? `
              <div class="map-detail-card">
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
                <button class="map-travel-btn" id="map-travel-btn">Viajar a la Estación</button>
              </div>
            `
                : ''
            }
          </div>
        </div>
      </div>
    `;

    // Bind events
    this.container.querySelector('#map-close-btn')?.addEventListener('click', () => this.close());

    const searchInput = this.container.querySelector('#resort-search-input') as HTMLInputElement | null;
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const val = (e.target as HTMLInputElement).value;
        this.render(val);
        const newInput = this.container.querySelector('#resort-search-input') as HTMLInputElement | null;
        if (newInput) {
          newInput.focus();
          newInput.setSelectionRange(val.length, val.length);
        }
      });
    }

    this.container.querySelectorAll('[data-resort-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-resort-id');
        const found = this.resorts.find((r) => r.id === id);
        if (found) {
          this.selectedResort = found;
          this.render(searchQuery);
        }
      });
    });

    const travelBtn = this.container.querySelector('#map-travel-btn') as HTMLButtonElement | null;
    if (travelBtn && sel) {
      travelBtn.addEventListener('click', async () => {
        travelBtn.disabled = true;
        travelBtn.textContent = 'Cargando pistas y relieve...';
        const liveData = await ResortDataService.fetchFromBackend(sel.id);
        const payload = liveData || ResortDataService.buildOfflineResortFallback(sel);
        this.hasChosenResort = true;
        this.close();
        this.onSelectCallback(payload);
      });
    }
  }
}
