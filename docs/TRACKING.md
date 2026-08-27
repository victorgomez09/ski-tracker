# Hoja de Ruta: Sistema de Tracking de Esquí y Detección de Bajadas

## 🏗️ 1. Arquitectura del Sistema

El flujo de datos se divide en tres capas principales: captura móvil, ingesta y procesamiento geoespacial/analítico.
```
+-------------------------------------------------------------+
|               APP FRONTEND (React / Expo)                   |
|  - Captura GPS en segundo plano (expo-location)             |
|  - Almacenamiento temporal en buffer local                  |
|  - Sincronización por lotes (Batch POST)                    |
+-------------------------------------------------------------+
|
| [POST /sessions & POST /points]
v
+-------------------------------------------------------------+
|               API BACKEND (Golang / Gin)                    |
|  - Ingesta de puntos brutos                                 |
|  - Almacenamiento en tabla de coordenadas                   |
+-------------------------------------------------------------+
|
| [Al finalizar sesión / Trigger]
v
+-------------------------------------------------------------+
|             MOTOR DE ANÁLISIS Y GIS (Backend)               |
|  ├─ 1. Filtrado de ruido y suavizado altimétrico            |
|  ├─ 2. Segmentación (Heurística Remontes vs. Bajadas)       |
|  └─ 3. Map Matching geoespacial con pistas (PostGIS)        |
+-------------------------------------------------------------+
```

---

## 🗺️ 2. Fases de Implementación (Roadmap)

### Fase 1: Captura de Telemetría en el Cliente (Frontend / Expo)
*Objetivo: Registrar las coordenadas GPS del usuario de manera eficiente y con bajo consumo de batería.*

* [x] **Servicio en Segundo Plano:** Implementar el seguimiento de ubicación usando librerías compatibles con Expo (`expo-location` con `startLocationUpdatesAsync`).
* [x] **Configuración de Precisión:** Ajustar intervalos óptimos (por ejemplo, actualizar cada 5-10 metros o cada 3-5 segundos) para no agotar la batería ni saturar el servidor.
* [x] **Buffer Local y Reintentos:** Guardar temporalmente los puntos en almacenamiento local (`AsyncStorage` o SQLite) por si el esquiador pierde cobertura en la montaña, enviándolos al recuperar conexión.
* [ ] **Controles de Sesión en la UI:** Pantalla o botón flotante para "Iniciar Actividad", "Pausar/Reanudar" y "Finalizar Sesión".

---

### Fase 2: Ingesta y Almacenamiento en Backend
*Objetivo: Recibir y almacenar de forma segura flujos masivos de coordenadas.*

* [x] **Endpoints de Sesión:**
  * `POST /ski-sessions` (Inicia una nueva sesión de esquí).
  * `POST /ski-sessions/{id}/points` (Recibe lotes de coordenadas: `[ {lat, lon, altitude, speed, timestamp}, ... ]`).
  * `POST /ski-sessions/{id}/finish` (Cierra la sesión y activa el procesamiento en segundo plano).
* [x] **Esquema de Base de Datos:**
  * Tabla `ski_sessions`: ID, usuario, inicio, fin, métricas globales.
  * Tabla `session_points`: ID, session_id, punto geográfico (tipo `GEOMETRY(Point, 4326)` o lat/lon), altitud, velocidad, timestamp.

---

### Fase 3: Algoritmo de Detección de Bajadas (Núcleo del Backend)
*Objetivo: Transformar una lista desordenada de puntos GPS en "Bajadas" (descensos) separadas de "Remontes" (ascensos).*

* [x] **Filtrado de Ruido GPS:** Aplicar un filtro de suavizado (como un *Filtro de Kalman* o medias móviles) para eliminar saltos erróneos de posición provocados por el rebote de señal en la montaña.
* [x] **Detección de Altitud y Pendiente (Heurística):**
  * **Ascenso (Remonte):** Si la tendencia de altitud es sostenidamente positiva en el tiempo, clasificar el segmento como `lift`.
  * **Descenso (Bajada):** Si la tendencia de altitud es descendente y la velocidad supera un umbral mínimo, clasificar como posible bajada.
* [x] **Corte por Inactividad / Paradas:** Si el usuario se detiene (velocidad cercana a 0 en una cafetería o base) durante más de X minutos, cerrar la bajada actual e iniciar una nueva al reanudar el movimiento.

---

### Fase 4: Enriquecimiento Geoespacial y Matching de Pistas
*Objetivo: Determinar con precisión qué pistas de esquí recorrió el usuario durante su descenso.*

* [x] **Indexación Espacial (PostGIS / Motor GIS):** Cargar los polígonos/líneas de las pistas de la estación (`pistesGeoJSON`) en la base de datos geoespacial.
* [x] **Map Matching:** Cruzar los puntos de cada bajada detectada con la capa de pistas para identificar qué ID de pista o estación coincide con la trayectoria del usuario.
* [x] **Cálculo de Métricas Finales:**
  * Distancia total recorrida.
  * Velocidad máxima y media.
  * Desnivel acumulado (positivo y negativo).
  * Dificultad predominante de la bajada (según las pistas emparejadas).

---

### Fase 5: Visualización de Resultados en Frontend
*Objetivo: Mostrar al usuario un resumen detallado del día y de cada bajada individual.*

* [x] **Pantalla de Historial de Sesiones:** Lista agrupada cronológicamente de bajadas (Bajada 1, Bajada 2, etc.).
* [x] **Renderizado del Track en el Mapa:** Dibujar la línea exacta de la trayectoria sobre el componente `InteractiveSkiMap` con colores destacados o diferenciados.
* [x] **Panel de Estadísticas:** Mostrar gráficos de velocidad vs. altitud para cada bajada seleccionada.