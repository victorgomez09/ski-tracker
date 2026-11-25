/**
 * Cargador de Modelos Digitales de Elevación (DEM) reales usando AWS Open Data Terrain Tiles
 * (formato Mapzen/Tilezen Terrarium PNG, público, sin API key y con soporte CORS).
 * Permite reconstruir la topografía real 1:1 en metros de cualquier estación del mundo.
 */

export interface TerrariumDEM {
  sampleElevation(lon: number, lat: number): number;
}

export class TerrainTileLoader {
  private static readonly BASE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';

  /**
   * Carga el DEM de la estación priorizando la caché en PostgreSQL del backend Go.
   * Si no existe aún en base de datos, descarga los tiles de AWS una sola vez,
   * genera una malla compacta de 160x160 (~50 KB) y la guarda en el backend.
   */
  public static async loadForResort(
    resortId: string,
    minLon: number,
    minLat: number,
    maxLon: number,
    maxLat: number,
    apiBaseUrl: string
  ): Promise<TerrariumDEM | null> {
    // 1. Intentar cargar desde PostgreSQL (0 peticiones a AWS)
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/v1/resorts/by-id/${encodeURIComponent(resortId)}/dem`
      ).catch(() => null);

      if (res && res.ok) {
        const dto = await res.json();
        if (dto?.elevations_b64 && dto?.resolution > 1) {
          return this.createGridSampler(
            dto.min_lon,
            dto.min_lat,
            dto.max_lon,
            dto.max_lat,
            dto.resolution,
            this.base64ToInt16(dto.elevations_b64)
          );
        }
      }
    } catch {
      // Continuar con AWS si falla caché
    }

    // 2. Descargar de AWS Terrarium una vez y guardar en BD
    const awsDem = await this.loadForBounds(minLon, minLat, maxLon, maxLat);
    if (!awsDem) return null;

    const resolution = 160;
    const grid = new Int16Array(resolution * resolution);
    for (let row = 0; row < resolution; row++) {
      const lat = maxLat - (row / (resolution - 1)) * (maxLat - minLat);
      for (let col = 0; col < resolution; col++) {
        const lon = minLon + (col / (resolution - 1)) * (maxLon - minLon);
        grid[row * resolution + col] = Math.round(awsDem.sampleElevation(lon, lat));
      }
    }

    // Guardar en PostgreSQL en segundo plano (~51 KB)
    fetch(`${apiBaseUrl}/api/v1/resorts/by-id/${encodeURIComponent(resortId)}/dem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        min_lon: minLon,
        min_lat: minLat,
        max_lon: maxLon,
        max_lat: maxLat,
        resolution,
        elevations_b64: this.int16ToBase64(grid),
      }),
    }).catch(() => {});

    return awsDem;
  }

  private static createGridSampler(
    minLon: number,
    minLat: number,
    maxLon: number,
    maxLat: number,
    resolution: number,
    grid: Int16Array
  ): TerrariumDEM {
    return {
      sampleElevation(lon: number, lat: number): number {
        const u = ((lon - minLon) / (maxLon - minLon)) * (resolution - 1);
        const v = ((maxLat - lat) / (maxLat - minLat)) * (resolution - 1);

        const cu = Math.max(0, Math.min(resolution - 1.001, u));
        const cv = Math.max(0, Math.min(resolution - 1.001, v));

        const x0 = Math.floor(cu);
        const y0 = Math.floor(cv);
        const x1 = Math.min(resolution - 1, x0 + 1);
        const y1 = Math.min(resolution - 1, y0 + 1);

        const fx = cu - x0;
        const fy = cv - y0;

        const e00 = grid[y0 * resolution + x0];
        const e10 = grid[y0 * resolution + x1];
        const e01 = grid[y1 * resolution + x0];
        const e11 = grid[y1 * resolution + x1];

        const top = e00 * (1 - fx) + e10 * fx;
        const bottom = e01 * (1 - fx) + e11 * fx;
        return top * (1 - fy) + bottom * fy;
      },
    };
  }

  private static int16ToBase64(arr: Int16Array): string {
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private static base64ToInt16(b64: string): Int16Array {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Int16Array(bytes.buffer);
  }

  private static lonToTileX(lon: number, zoom: number): number {
    return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
  }

  private static latToTileY(lat: number, zoom: number): number {
    const latRad = (lat * Math.PI) / 180;
    return Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * Math.pow(2, zoom)
    );
  }

  private static loadImage(url: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const timer = window.setTimeout(() => resolve(null), 6500);

      img.onload = () => {
        clearTimeout(timer);
        resolve(img);
      };
      img.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };
      img.src = url;
    });
  }

  /**
   * Descarga los tiles de elevación de AWS que cubren el bounding box completo de la estación.
   */
  public static async loadForBounds(
    minLon: number,
    minLat: number,
    maxLon: number,
    maxLat: number
  ): Promise<TerrariumDEM | null> {
    try {
      const spanDeg = Math.max(maxLon - minLon, maxLat - minLat);
      // Seleccionar zoom óptimo para cubrir desde estaciones pequeñas hasta dominios gigantes (270+ pistas)
      let zoom = 13;
      if (spanDeg > 0.14) zoom = 11;
      else if (spanDeg > 0.05) zoom = 12;

      let txMin = this.lonToTileX(minLon, zoom);
      let txMax = this.lonToTileX(maxLon, zoom);
      let tyMin = this.latToTileY(maxLat, zoom); // Norte = menor tileY
      let tyMax = this.latToTileY(minLat, zoom); // Sur = mayor tileY

      // Seguridad: si abarca demasiados tiles, bajar 1 nivel de zoom
      while ((txMax - txMin + 1) * (tyMax - tyMin + 1) > 25 && zoom > 9) {
        zoom--;
        txMin = this.lonToTileX(minLon, zoom);
        txMax = this.lonToTileX(maxLon, zoom);
        tyMin = this.latToTileY(maxLat, zoom);
        tyMax = this.latToTileY(minLat, zoom);
      }

      const cols = txMax - txMin + 1;
      const rows = tyMax - tyMin + 1;
      const widthPx = cols * 256;
      const heightPx = rows * 256;

      const tileJobs: Array<{ tx: number; ty: number; promise: Promise<HTMLImageElement | null> }> = [];
      for (let ty = tyMin; ty <= tyMax; ty++) {
        for (let tx = txMin; tx <= txMax; tx++) {
          const url = `${this.BASE_URL}/${zoom}/${tx}/${ty}.png`;
          tileJobs.push({ tx, ty, promise: this.loadImage(url) });
        }
      }

      const images = await Promise.all(tileJobs.map((j) => j.promise));
      const loadedCount = images.filter(Boolean).length;
      if (loadedCount === 0) {
        console.warn('[TerrainTileLoader] No se pudieron descargar tiles de elevación AWS.');
        return null;
      }

      const canvas = document.createElement('canvas');
      canvas.width = widthPx;
      canvas.height = heightPx;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      tileJobs.forEach((job, idx) => {
        const img = images[idx];
        if (img) {
          const dx = (job.tx - txMin) * 256;
          const dy = (job.ty - tyMin) * 256;
          ctx.drawImage(img, dx, dy);
        }
      });

      const pixels = ctx.getImageData(0, 0, widthPx, heightPx).data;

      const decodePixel = (px: number, py: number): number => {
        const idx = (py * widthPx + px) * 4;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];
        return r * 256 + g + b / 256 - 32768;
      };

      const n = Math.pow(2, zoom);

      return {
        sampleElevation(lon: number, lat: number): number {
          const globalPx = ((lon + 180) / 360) * n * 256;
          const latRad = (lat * Math.PI) / 180;
          const globalPy =
            ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n * 256;

          const lx = Math.max(0, Math.min(widthPx - 1.001, globalPx - txMin * 256));
          const ly = Math.max(0, Math.min(heightPx - 1.001, globalPy - tyMin * 256));

          const x0 = Math.floor(lx);
          const y0 = Math.floor(ly);
          const x1 = Math.min(widthPx - 1, x0 + 1);
          const y1 = Math.min(heightPx - 1, y0 + 1);

          const fx = lx - x0;
          const fy = ly - y0;

          const e00 = decodePixel(x0, y0);
          const e10 = decodePixel(x1, y0);
          const e01 = decodePixel(x0, y1);
          const e11 = decodePixel(x1, y1);

          const top = e00 * (1 - fx) + e10 * fx;
          const bottom = e01 * (1 - fx) + e11 * fx;
          return top * (1 - fy) + bottom * fy;
        },
      };
    } catch (err) {
      console.warn('[TerrainTileLoader] Error cargando DEM:', err);
      return null;
    }
  }
}
