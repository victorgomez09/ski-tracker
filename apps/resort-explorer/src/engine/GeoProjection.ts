/**
 * Conversor geoespacial ligero de alta precisión (WGS84 Lat/Lon -> Coordenadas locales Three.js en metros).
 * Utiliza proyección equirrectangular corregida por la latitud media del resort.
 */
export class GeoProjection {
  public centerLon: number;
  public centerLat: number;
  public metersPerDegLon: number;
  public metersPerDegLat: number;
  public worldScale: number;

  /**
   * @param centerLon Longitud de anclaje central
   * @param centerLat Latitud de anclaje central
   * @param worldScale Escala 1:1 (1 unidad Three.js = 1 metro real)
   */
  constructor(centerLon = -3.9719, centerLat = 40.7983, worldScale = 1.0) {
    this.centerLon = centerLon;
    this.centerLat = centerLat;
    this.worldScale = worldScale;

    const latRad = (centerLat * Math.PI) / 180;
    // 1 grado de longitud varía con el coseno de la latitud
    this.metersPerDegLon = 111320 * Math.cos(latRad);
    // 1 grado de latitud es aprox 110540 metros en latitud media
    this.metersPerDegLat = 110574;
  }

  /**
   * Actualiza el centro de proyección a partir de un Bounding Box [minLon, minLat, maxLon, maxLat]
   * manteniendo escala real 1:1 en metros para que el terreno abarque toda la estación.
   */
  public setBounds(minLon: number, minLat: number, maxLon: number, maxLat: number) {
    this.centerLon = (minLon + maxLon) / 2;
    this.centerLat = (minLat + maxLat) / 2;

    const latRad = (this.centerLat * Math.PI) / 180;
    this.metersPerDegLon = 111320 * Math.cos(latRad);
    this.worldScale = 1.0;
  }

  /**
   * Convierte coordenadas GPS [lon, lat] a coordenadas Three.js [x, z]
   * X = Este (+), Oeste (-)
   * Z = Sur (+), Norte (-)
   */
  public project(lon: number, lat: number): [number, number] {
    const dxMeters = (lon - this.centerLon) * this.metersPerDegLon;
    const dzMeters = -(lat - this.centerLat) * this.metersPerDegLat;

    return [dxMeters * this.worldScale, dzMeters * this.worldScale];
  }

  /**
   * Desproyecta coordenadas Three.js [x, z] a GPS [lon, lat]
   */
  public unproject(x: number, z: number): [number, number] {
    const dxMeters = x / this.worldScale;
    const dzMeters = -z / this.worldScale;

    const lon = this.centerLon + dxMeters / this.metersPerDegLon;
    const lat = this.centerLat + dzMeters / this.metersPerDegLat;

    return [lon, lat];
  }
}
