/**
 * Mensajes intercambiados entre la app nativa (React Native WebView) y el simulador 3D
 */
export interface BridgeMessage<T = unknown> {
  type: string;
  payload: T;
}

export interface ResortConfig {
  id?: string;
  name: string;
  baseAltitude: number;
  summitAltitude: number;
  pistesCount?: number;
  bounds?: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
}

export class Bridge {
  private static listeners: Map<string, Array<(payload: any) => void>> = new Map();

  public static init(onConfigReceived?: (config: ResortConfig) => void) {
    // 1. Escuchar mensajes desde window / document / WebView
    const handleMessage = (event: MessageEvent) => {
      try {
        let data = event.data;
        if (typeof data === 'string') {
          data = JSON.parse(data);
        }

        if (data && data.type) {
          const callbacks = this.listeners.get(data.type) || [];
          callbacks.forEach(cb => cb(data.payload));

          if (data.type === 'SET_RESORT' && onConfigReceived) {
            onConfigReceived(data.payload as ResortConfig);
          }
        }
      } catch (err) {
        console.warn('[Bridge] Error procesando mensaje entrante:', err);
      }
    };

    window.addEventListener('message', handleMessage);
    document.addEventListener('message', handleMessage as any); // Compatibilidad con Android WebView

    // 2. Extraer parámetros de URL si viene por query string (ej. ?resort=Valdesquí&summit=2280&base=1860)
    const params = new URLSearchParams(window.location.search);
    if (onConfigReceived) {
      onConfigReceived({
        name: params.get('resort') || 'Valdesquí',
        summitAltitude: Number(params.get('summit')) || 2280,
        baseAltitude: Number(params.get('base')) || 1860,
        pistesCount: Number(params.get('pistes')) || 22.3,
      });
    }

    // 3. Notificar a la app nativa de que el simulador 3D está listo
    this.sendToNative('EXPLORER_READY', { timestamp: Date.now() });
  }

  public static on<T = any>(type: string, callback: (payload: T) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(callback);
  }

  public static sendToNative<T = any>(type: string, payload: T) {
    const message: BridgeMessage<T> = { type, payload };
    const serialized = JSON.stringify(message);

    // Si estamos dentro de React Native WebView
    if ((window as any).ReactNativeWebView && typeof (window as any).ReactNativeWebView.postMessage === 'function') {
      (window as any).ReactNativeWebView.postMessage(serialized);
    } else if (window.parent && window.parent !== window) {
      // Si estamos en un iframe web
      window.parent.postMessage(serialized, '*');
    }
  }
}
