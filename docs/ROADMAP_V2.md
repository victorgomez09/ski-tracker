# Roadmap v2.0: Plataforma Multi-Actividad (Outdoor & Tracking General)

## 🎯 Visión General

La versión 1.0 consolidó el núcleo de captura GPS en segundo plano con persistencia local en SQLite, sincronización por lotes con el backend, y segmentación especializada de esquí/snowboard (remontes y pistas con PostGIS).

La **versión 2.0** evoluciona la plataforma de un rastreador exclusivo de esquí a un **sistema integral de seguimiento multi-actividad** (Paseo/Senderismo, Ciclismo, Coche/Viajes, Esquí y Snowboard), permitiendo el uso de la aplicación durante todo el año y en cualquier ubicación (sin depender de una estación).

---

## 🏗️ 1. Arquitectura y Flujo de Datos v2.0

```
+---------------------------------------------------------------------------------+
|                                 APP FRONTEND                                    |
|  ├─ Selector de Actividad (Esquí, Paseo, Bici, Coche...)                        |
|  ├─ Configuración Dinámica GPS (Sampling rate / Batería según actividad)       |
|  ├─ UI Modularizada (HUD / Métricas en tiempo real según deporte)               |
|  └─ Buffer Local SQLite (Puntos y fotos desacoplados de Resort)                |
+---------------------------------------------------------------------------------+
                                      |
                                      | [POST /sessions (activity_type, optional resort_id)]
                                      | [POST /sessions/{id}/points & photos]
                                      v
+---------------------------------------------------------------------------------+
|                                 API BACKEND                                     |
|  ├─ Ingesta Universal de Puntos                                                 |
|  └─ Router de Procesamiento Asíncrono según ActivityType                        |
+---------------------------------------------------------------------------------+
                                      |
         +----------------------------+----------------------------+
         |                                                         |
         v (ski / snowboard)                                       v (walk / hike / bike / car)
+-----------------------------------------+   +-----------------------------------------+
|     PIPELINE NIEVE                      |   |     PIPELINE GENERAL / OUTDOOR          |
|  ├─ Detección Remontes (Lifts)          |   |  ├─ Desnivel Positivo / Negativo (D+/D-) |
|  ├─ Detección Bajadas (Runs)            |   |  ├─ Ritmo (Pace min/km) / Vel. Media     |
|  └─ Map Matching PostGIS con pistas     |   |  └─ Tiempos en movimiento vs paradas    |
+-----------------------------------------+   +-----------------------------------------+
```

---

## 🗺️ 2. Fases de Implementación

### Fase 0: Refactorización y Arquitectura Base en Frontend (React Native)
> **Objetivo:** Descomponer componentes monolíticos, extraer lógica de negocio a hooks y modularizar la UI para soportar múltiples modos sin deuda técnica.

- [x] **Extracción de la lógica de tracking (`useTrackingSession` hook):**
  - Desacoplado el ciclo de vida de tracking (start, pause, resume, stop, discard, polling de SQLite) de `tracking.native.tsx`.
  - Creado hook reutilizable en `components/tracking/hooks/use-tracking-session.ts`.
- [x] **Descomposición del componente monolítico `tracking.native.tsx` (de 1668 a ~400 líneas):**
  - `components/tracking/map/tracking-map-layers.ts`: Estilos MapLibre, normalización geométrica y builders GeoJSON puros.
  - `components/tracking/map/friend-marker.tsx`: Marcador nativo MapLibre para amigos.
  - `components/tracking/tracking-controls.tsx`: Botones flotantes (SOS, Cámara, Play/Pausa/Stop, Offline).
  - `components/tracking/tracking-hud.tsx`: Panel HUD de métricas en vivo adaptativo (km/h vs min/km).
  - `components/tracking/hooks/use-live-stats.ts`: Cálculo y formateo de métricas en tiempo real.
  - `components/tracking/modals/`:
    - `upload-session-modal.tsx`: Resumen, selector de privacidad y subida/descarte.
    - `resort-error-modal.tsx`: Alerta de proximidad a estación.
    - `coverage-warning-modal.tsx` y `resort-search-modal.tsx`.
- [x] **Desacoplamiento de Estaciones en Almacenamiento Local (`database.ts` y `task-manager.ts`):**
  - Soporte de `distanceInterval` configurable dinámicamente y `resortId` opcional en `startTracking`.
- [x] **Sistema de Tipos para Actividades:**
  - Creado `models/activity.model.ts` con tipado formal `ActivityType` y matriz `ACTIVITY_CONFIGS` (unidades, frecuencias GPS, iconos, necesidad de estación).

---

### Fase 1: Abstracción de Actividades y Modo "Tracking Libre" (Frontend)
> **Objetivo:** Permitir iniciar actividades en cualquier lugar y para cualquier deporte sin obligar a elegir estación.

- [x] **Selector de Modo/Deporte Pre-Tracking:**
  - Selector intuitivo en la pantalla de tracking o modal de inicio rápido (Paseo, Bici, Coche, Esquí...).
  - Si se elige Esquí/Snowboard, ofrecer la búsqueda/detección de estación; si se elige otra actividad, saltarse la selección de estación ("Modo Libre").
- [x] **Eliminar el bloqueo de distancia (20 km):**
  - Permitir iniciar el tracking en cualquier coordenada geográfica sin el modal de error de estación.
- [x] **Ajuste Dinámico de Precisión y Frecuencia GPS:**
  - Pasar la configuración óptima a `startLocationUpdatesAsync` según el deporte:
    - **Paseo / Senderismo:** `timeInterval: 4000-6000ms`, `distanceInterval: 5m` (conservar batería).
    - **Ciclismo:** `timeInterval: 2000-3000ms`, `distanceInterval: 3-5m`.
    - **Coche / Conducción:** `timeInterval: 1000-2000ms`, `distanceInterval: 10m`.
    - **Esquí / Snowboard:** configuración actual optimizada.

---

### Fase 2: Ingesta y Motor de Procesamiento Polimórfico (Backend Go)
> **Objetivo:** Procesar las sesiones de acuerdo a su naturaleza deportiva sin forzar reglas de esquí a deportes de verano o urbanos.

- [x] **Actualización del Modelo y API de Sesiones:**
  - Permitir `resort_id` como `NULL` en `POST /ski-sessions` y alias `/sessions`.
  - Recibir y validar `activity_type` en la creación de la sesión con fallback al perfil de usuario o valor por defecto.
- [x] **Desacoplar el Pipeline en `SkiSessionService.processSessionAsync`:**
  - Creado dispatcher polimórfico según `activity_type`:
    - **Si `activity_type in ('ski', 'snowboard', 'snow')`:**
      - Mantiene `segmentTrack` (remontes vs bajadas).
      - Mantiene `processRunEnrichment` y Map Matching en PostGIS.
    - **Si `activity_type in ('walk', 'hike', 'bike', 'car', 'general')`:**
      - **NO** genera registros en la tabla `ski_runs`.
      - Ejecuta pipeline `calculateOutdoorSessionMetrics`:
        - Cálculo de distancia acumulada 2D y 3D (Haversine + altitud).
        - Desnivel positivo ($D+$) y desnivel negativo ($D-$) con filtro de histéresis de 2.0 m para eliminar ruido GPS/barométrico.
        - Velocidad media, velocidad máxima y ritmo medio ($\text{min/km}$ para senderismo/paseo).
        - Tiempo total vs. tiempo en movimiento con umbrales adaptativos por deporte.
- [x] **Migración de Base de Datos:**
  - Creada migración `20260903120000_add_outdoor_metrics_to_sessions.go` para añadir `avg_speed`, `elevation_gain`, `elevation_loss`, `moving_time`, `duration` y `pace` a la tabla `ski_sessions`.

---

### Fase 3: Métricas, Historial y Visualización Adaptativa
> **Objetivo:** Mostrar al usuario resúmenes e historial coherentes con el deporte practicado.

- [x] **HUD en Pantalla de Tracking:**
  - Paseo / Senderismo: Muestra **Ritmo (min/km)**, **Distancia (km)**, **Tiempo**, **D+ (m)**.
  - Bici: Muestra **Velocidad actual (km/h)**, **Distancia (km)**, **Tiempo**, **Altitud (m)**.
  - Coche: Muestra **Velocidad (km/h)**, **Distancia (km)**, **Vel. Máx (km/h)**, **Tiempo**.
  - Esquí / Snowboard: Muestra **Velocidad punta (km/h)**, **Distancia (km)**, **Desnivel esquiado (D-)**, **Tiempo**.
- [x] **Historial y Detalle de Sesión Adaptativo:**
  - Renderizado de tarjetas y paneles de métricas específicas según la actividad practicada.
  - Analizador de sesión en mapa con vista prioritaria de perfil altimétrico (elevación vs distancia) y velocidad para actividades outdoor, y desglose de bajadas/pistas para esquí/snowboard.
  - Distintivos visuales / iconos dinámicos con selector multi-actividad en el perfil, en el listado de sesiones de estaciones y en el feed de comunidad.

---

### Fase 4: Experiencia Cartográfica Multi-Entorno
> **Objetivo:** Adaptar las capas visuales del mapa según el tipo de actividad.

- [ ] **Capas Condicionales en el Mapa:**
  - Ocultar capas vectoriales de pistas de esquí y remontes cuando la actividad no sea invernal.
  - Soporte para estilo de mapa topográfico / senderos (OpenStreetMap Outdoors o MapTiler/Carto Outdoors) para rutas de senderismo o bici.
- [ ] **Pintado de Ruta Personalizado:**
  - Color de trazado o gradiente por velocidad o altitud según la actividad (ej. gradiente de pendiente para senderismo/ciclismo, velocidad para coche).

---

### Fase 5: Optimización de Batería y Pruebas en Escenarios Reales
> **Objetivo:** Garantizar autonomía para sesiones largas (4-8 horas de senderismo o bici).

- [ ] **Auditoría de Consumo Energético:**
  - Probar perfiles de actualización en segundo plano en Android e iOS.
  - Verificación del comportamiento del sensor con pantalla apagada en rutas de más de 2 horas.
- [ ] **Manejo de Pérdida Prolongada de Cobertura:**
  - Validar que sesiones sin cobertura de red durante horas almacenen miles de puntos en SQLite sin problemas de memoria y se sincronicen correctamente al recuperar conectividad.

---

## 📅 Orden de Ejecución Inmediato

1. ⚙️ **Fase 0 (Completada):** Refactorización modular en React Native (`useTracking`, partición de `tracking.native.tsx`, tipado de actividades).
2. 🚀 **Fase 1 (Completada):** Habilitar selector de actividad y tracking libre sin estación en la app.
3. 🛠️ **Fase 2 (Completada):** Adaptar el backend Go para procesar métricas outdoor sin segmentación de remontes/pistas.
4. 📊 **Fase 3 (Completada):** Adaptar pantallas de detalle e historial con las nuevas métricas.
5. 🗺️ **Fase 4 & 5 (Siguiente Prioridad):** Capas cartográficas y pruebas de autonomía de batería.
