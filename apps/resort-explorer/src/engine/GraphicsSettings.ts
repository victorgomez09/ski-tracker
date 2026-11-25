export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra';

export interface GraphicsConfig {
  preset: QualityPreset;
  pixelRatioMax: number;
  shadowsEnabled: boolean;
  shadowMapSize: number;
  drawDistance: number;
  treeCount: number;
  rockCount: number;
  trafficEnabled: boolean;
}

const PRESET_MAP: Record<QualityPreset, GraphicsConfig> = {
  low: {
    preset: 'low',
    pixelRatioMax: 1.0,
    shadowsEnabled: false,
    shadowMapSize: 512,
    drawDistance: 5000,
    treeCount: 700,
    rockCount: 150,
    trafficEnabled: false,
  },
  medium: {
    preset: 'medium',
    pixelRatioMax: 1.25,
    shadowsEnabled: true,
    shadowMapSize: 1024,
    drawDistance: 10000,
    treeCount: 1400,
    rockCount: 280,
    trafficEnabled: true,
  },
  high: {
    preset: 'high',
    pixelRatioMax: 1.75,
    shadowsEnabled: true,
    shadowMapSize: 2048,
    drawDistance: 18000,
    treeCount: 2200,
    rockCount: 450,
    trafficEnabled: true,
  },
  ultra: {
    preset: 'ultra',
    pixelRatioMax: 2.0,
    shadowsEnabled: true,
    shadowMapSize: 2048,
    drawDistance: 25000,
    treeCount: 2600,
    rockCount: 550,
    trafficEnabled: true,
  },
};

const STORAGE_KEY = 'ski_explorer_graphics_v1';

/**
 * Gestor de escalabilidad gráfica multi-dispositivo (Fase 10.13):
 * - Detecta automáticamente un perfil óptimo en móviles vs escritorio.
 * - Persiste preferencias en localStorage y permite ajustes en vivo sin recargar.
 */
export class GraphicsSettings {
  private config: GraphicsConfig;

  constructor() {
    this.config = this.loadInitialConfig();
  }

  private detectDefaultPreset(): QualityPreset {
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;
    const cores = navigator.hardwareConcurrency || 4;
    if (isMobile) {
      return cores <= 4 ? 'low' : 'medium';
    }
    return cores >= 8 ? 'high' : 'medium';
  }

  private loadInitialConfig(): GraphicsConfig {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<GraphicsConfig>;
        const base = PRESET_MAP[parsed.preset || this.detectDefaultPreset()];
        return { ...base, ...parsed };
      }
    } catch {
      // Ignorar errores de almacenamiento en WebView restringido
    }
    return { ...PRESET_MAP[this.detectDefaultPreset()] };
  }

  public getConfig(): GraphicsConfig {
    return { ...this.config };
  }

  public applyPreset(preset: QualityPreset): GraphicsConfig {
    this.config = { ...PRESET_MAP[preset] };
    this.save();
    return this.getConfig();
  }

  public updatePartial(partial: Partial<GraphicsConfig>): GraphicsConfig {
    this.config = { ...this.config, ...partial };
    this.save();
    return this.getConfig();
  }

  private save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
    } catch {
      // Silencioso
    }
  }
}
